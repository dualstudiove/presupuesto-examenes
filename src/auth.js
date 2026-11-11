import crypto from 'node:crypto';
import { env } from './env.js';

// Contraseñas: PBKDF2-SHA256 con WebCrypto. Cloudflare Workers admite como máximo 100 000 iteraciones
// y limita el tiempo de CPU por petición, por eso no se usa scrypt.
const ITER = 100_000;
const hex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('');
const deHex = (h) => Uint8Array.from(h.match(/../g) || [], (x) => parseInt(x, 16));

async function derivar(pw, salt, iter = ITER) {
  const k = await globalThis.crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await globalThis.crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, k, 256));
}

const iguales = (a, b) => {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
};

export async function hashPassword(pw) {
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  return `s2$${hex(salt)}$${hex(await derivar(pw, salt))}`;
}

export async function verifyPassword(pw, stored) {
  try {
    const [v, s, h] = String(stored).split('$');
    if (v !== 's2') return false;
    return iguales(await derivar(pw, deHex(s)), deHex(h));
  } catch {
    return false;
  }
}

// Hash de relleno (válido, de una clave que nadie conoce) para que el tiempo de respuesta
// no revele si el correo existe.
export const HASH_RELLENO = 's2$0102030405060708090a0b0c0d0e0f10$5aa43dd56e91636b235fb6cfdafb7c1c15b530ab09bd54b1b685e7005892d733';

// ── Sesiones: cookie firmada con HMAC (sin estado en el servidor) ──
const b64 = (b) => Buffer.from(b).toString('base64url');
const firma = (data) => crypto.createHmac('sha256', env.sessionSecret).update(data).digest('base64url');

export function firmarToken(payload, ttlSeg = 12 * 3600) {
  const body = b64(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeg }));
  return `${body}.${firma(body)}`;
}

export function leerToken(token) {
  if (typeof token !== 'string') return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const esperada = firma(body);
  if (sig.length !== esperada.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(esperada))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return p.exp > Date.now() / 1000 ? p : null;
  } catch {
    return null;
  }
}

export const marcaPassword = (hash) => String(hash).slice(-16);

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function cookie(name, value, { maxAge, expire } = {}) {
  const p = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (expire) p.push('Max-Age=0', 'Expires=Thu, 01 Jan 1970 00:00:00 GMT');
  else if (maxAge) p.push(`Max-Age=${maxAge}`);
  if (env.cookieSecure) p.push('Secure');
  return p.join('; ');
}

// ── Protección contra fuerza bruta (en memoria) ──
const intentos = new Map();
const VENTANA = 15 * 60 * 1000;
const BLOQUEO = 15 * 60 * 1000;
const MAX_FALLOS = 5;

export function bloqueoRestante(key) {
  const e = intentos.get(key);
  return e && e.hasta > Date.now() ? Math.ceil((e.hasta - Date.now()) / 1000) : 0;
}
export function registrarFallo(key) {
  purgar();
  const ahora = Date.now();
  let e = intentos.get(key);
  if (!e || ahora - e.inicio > VENTANA) {
    e = { fallos: 0, inicio: ahora, hasta: 0 };
    intentos.set(key, e);
  }
  e.fallos += 1;
  if (e.fallos >= MAX_FALLOS) e.hasta = ahora + BLOQUEO;
}
export const limpiarFallos = (key) => intentos.delete(key);

// ── Límite de peticiones por clave (en memoria) ──
const cubos = new Map();
export function limite(key, max, ventanaMs) {
  purgar();
  const ahora = Date.now();
  const c = cubos.get(key);
  if (!c || ahora > c.reinicio) {
    cubos.set(key, { n: 1, reinicio: ahora + ventanaMs });
    return true;
  }
  c.n += 1;
  return c.n <= max;
}

// En Workers no hay temporizadores de fondo: se limpian los mapas de forma oportunista.
function purgar() {
  if (intentos.size + cubos.size < 2000) return;
  const ahora = Date.now();
  for (const [k, e] of intentos) if (e.hasta < ahora && ahora - e.inicio > VENTANA) intentos.delete(k);
  for (const [k, c] of cubos) if (ahora > c.reinicio) cubos.delete(k);
}
