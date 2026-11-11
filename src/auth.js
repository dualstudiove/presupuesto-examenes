import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { env } from './env.js';

const scrypt = promisify(crypto.scrypt);

export async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const h = await scrypt(pw, salt, 64);
  return `s1$${salt.toString('hex')}$${h.toString('hex')}`;
}

export async function verifyPassword(pw, stored) {
  try {
    const [v, s, h] = String(stored).split('$');
    if (v !== 's1') return false;
    const esperado = Buffer.from(h, 'hex');
    const calculado = await scrypt(pw, Buffer.from(s, 'hex'), esperado.length);
    return crypto.timingSafeEqual(calculado, esperado);
  } catch {
    return false;
  }
}

// Hash de relleno para que el tiempo de respuesta no revele si el correo existe.
export const HASH_RELLENO = await hashPassword('relleno-no-usar');

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
  const ahora = Date.now();
  const c = cubos.get(key);
  if (!c || ahora > c.reinicio) {
    cubos.set(key, { n: 1, reinicio: ahora + ventanaMs });
    return true;
  }
  c.n += 1;
  return c.n <= max;
}

setInterval(() => {
  const ahora = Date.now();
  for (const [k, e] of intentos) if (e.hasta < ahora && ahora - e.inicio > VENTANA) intentos.delete(k);
  for (const [k, c] of cubos) if (ahora > c.reinicio) cubos.delete(k);
}, 5 * 60 * 1000).unref();
