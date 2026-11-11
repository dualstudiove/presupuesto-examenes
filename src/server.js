import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { env } from './env.js';
import { initDb } from './db.js';
import { parseCookies, cookie } from './auth.js';
import { Router, Raw, clientIp, leerJson } from './http.js';
import { HttpError } from './util.js';
import { negocioPorSlug } from './negocio.js';
import { iniciarProgramador } from './bcv.js';
import { registrarPublicas } from './routes/public.js';
import { registrarAdmin } from './routes/admin.js';
import { registrarSuper } from './routes/super.js';

const PUBLIC = fileURLToPath(new URL('../public/', import.meta.url));
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json; charset=utf-8',
};

const router = new Router();
registrarPublicas(router);
registrarAdmin(router);
registrarSuper(router);

/** Determina el negocio por subdominio. En desarrollo también acepta ?negocio=slug. */
function tenantDe(req, url) {
  const host = String(req.headers.host || '').split(':')[0].toLowerCase();
  const base = env.baseDomain;
  if (host !== base && host !== `www.${base}` && host.endsWith(`.${base}`)) {
    const slug = host.slice(0, -(base.length + 1));
    if (slug && !slug.includes('.')) return { slug };
  }
  if (env.allowTenantQuery) {
    const q = url.searchParams.get('negocio');
    if (q === '-') return { root: true, limpiarDev: true };
    if (q) return { slug: q.toLowerCase(), viaQuery: true };
    const c = parseCookies(req.headers.cookie).negocio_dev;
    if (c) return { slug: c.toLowerCase() };
  }
  return { root: true };
}

function cabecerasSeguridad(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  );
  if (env.cookieSecure) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
}

function enviarJson(res, status, obj, setCookies = []) {
  const body = JSON.stringify(obj);
  if (setCookies.length) res.setHeader('Set-Cookie', setCookies);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'content-length': Buffer.byteLength(body) });
  res.end(body);
}

async function api(req, res, url, tenant) {
  const metodo = req.method === 'HEAD' ? 'GET' : req.method;
  const m = router.match(metodo, url.pathname);
  if (!m) throw new HttpError(404, 'No encontrado.');
  const o = m.route.opts;
  const ctx = {
    req, res, url, params: m.params, tenant, ip: clientIp(req), setCookies: [],
    query: Object.fromEntries(url.searchParams), cookies: parseCookies(req.headers.cookie), body: {},
  };
  if (o.tenant) {
    if (tenant.root) throw new HttpError(404, 'Negocio no encontrado.');
    const neg = await negocioPorSlug(tenant.slug);
    if (!neg) throw new HttpError(404, 'Negocio no encontrado.');
    if (!neg.activo) throw new HttpError(403, 'Este servicio no está disponible por el momento.');
    ctx.negocio = neg;
  }
  if (o.root && !tenant.root) throw new HttpError(404, 'No encontrado.');
  if (metodo !== 'GET') {
    // Cabecera propia: un formulario de otro sitio no puede enviarla (requeriría CORS).
    if (!o.noCsrf && req.headers['x-app'] !== '1') throw new HttpError(403, 'Solicitud no permitida.');
    ctx.body = await leerJson(req);
  }
  if (o.auth) ctx.usuario = await o.auth(ctx);

  const out = await m.route.handler(ctx);
  if (out instanceof Raw) {
    if (ctx.setCookies.length) res.setHeader('Set-Cookie', ctx.setCookies);
    res.writeHead(200, { 'content-type': out.type, 'cache-control': 'no-store', ...out.headers });
    return res.end(req.method === 'HEAD' ? undefined : out.body);
  }
  return enviarJson(res, 200, out ?? { ok: true }, ctx.setCookies);
}

const paginaMensaje = (titulo, texto) =>
  `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${titulo}</title><link rel="stylesheet" href="/css/app.css"></head><body class="mensaje"><main class="card centro"><h1>${titulo}</h1><p>${texto}</p></main></body></html>`;

function enviarHtml(res, status, html) {
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  res.end(html);
}

function enviarArchivo(req, res, archivo) {
  let st;
  try { st = fs.statSync(archivo); } catch { return enviarHtml(res, 404, paginaMensaje('No encontrado', 'La página que buscas no existe.')); }
  if (!st.isFile()) return enviarHtml(res, 404, paginaMensaje('No encontrado', 'La página que buscas no existe.'));
  const etag = `"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
  const headers = { 'content-type': MIME[path.extname(archivo)] || 'application/octet-stream', etag, 'cache-control': 'no-cache' };
  if (req.headers['if-none-match'] === etag) { res.writeHead(304, headers); return res.end(); }
  res.writeHead(200, { ...headers, 'content-length': st.size });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(archivo).pipe(res);
}

async function paginas(req, res, url, tenant) {
  if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Método no permitido.');
  const p = url.pathname;
  if (tenant.limpiarDev) res.setHeader('Set-Cookie', cookie('negocio_dev', '', { expire: true }));
  if (tenant.viaQuery) res.setHeader('Set-Cookie', `negocio_dev=${encodeURIComponent(tenant.slug)}; Path=/; SameSite=Lax`);

  const estaticos = ['/css/', '/js/', '/img/'];
  if (estaticos.some((d) => p.startsWith(d))) {
    const destino = path.normalize(path.join(PUBLIC, p));
    if (!destino.startsWith(PUBLIC)) throw new HttpError(404, 'No encontrado.');
    return enviarArchivo(req, res, destino);
  }
  if (p === '/favicon.ico') return enviarArchivo(req, res, path.join(PUBLIC, 'img/favicon.svg'));

  let archivo = null;
  if (p === '/') archivo = tenant.root ? 'landing.html' : 'index.html';
  else if (p === '/admin') {
    if (tenant.root) { res.writeHead(302, { location: '/' }); return res.end(); }
    archivo = 'admin.html';
  } else if (p === '/super') {
    if (!tenant.root) return enviarHtml(res, 404, paginaMensaje('No encontrado', 'La página que buscas no existe.'));
    archivo = 'super.html';
  } else return enviarHtml(res, 404, paginaMensaje('No encontrado', 'La página que buscas no existe.'));

  if (!tenant.root) {
    const neg = await negocioPorSlug(tenant.slug);
    if (!neg) return enviarHtml(res, 404, paginaMensaje('Negocio no encontrado', 'No existe un negocio con esta dirección. Revisa que el enlace esté bien escrito.'));
    if (!neg.activo) return enviarHtml(res, 403, paginaMensaje('Servicio no disponible', 'Este servicio no está disponible por el momento.'));
  }
  return enviarArchivo(req, res, path.join(PUBLIC, archivo));
}

async function manejar(req, res) {
  cabecerasSeguridad(res);
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname === '/healthz') { res.writeHead(200, { 'content-type': 'text/plain' }); return res.end('ok'); }
    const tenant = tenantDe(req, url);
    if (url.pathname.startsWith('/api/')) return await api(req, res, url, tenant);
    return await paginas(req, res, url, tenant);
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    if (!(e instanceof HttpError)) console.error('[error]', req.method, req.url, e);
    const mensaje = e instanceof HttpError ? e.message : 'Ocurrió un error inesperado. Intenta de nuevo.';
    if (res.headersSent) return res.end();
    if (url.pathname.startsWith('/api/')) return enviarJson(res, status, { error: mensaje });
    return enviarHtml(res, status, paginaMensaje('Ups', mensaje));
  }
}

export async function start({ port = env.port, host = env.host, programador = true } = {}) {
  await initDb();
  if (programador) iniciarProgramador();
  const server = http.createServer(manejar);
  await new Promise((resolve) => server.listen(port, host, resolve));
  const real = server.address().port;
  console.log(`Presupuesto de Exámenes escuchando en http://${host === '0.0.0.0' ? 'localhost' : host}:${real}`);
  console.log(`  Dominio base: ${env.baseDomain}  ·  Base de datos: ${env.databaseUrl ? 'PostgreSQL' : `SQLite (${env.databaseFile})`}`);
  return server;
}

void crypto;
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  start().catch((e) => { console.error(e); process.exit(1); });
}
