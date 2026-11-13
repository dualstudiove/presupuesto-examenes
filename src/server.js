// Aplicación para Cloudflare Workers: Hono + D1.
//
//  • La app puede vivir en la raíz de su dominio o montada bajo una ruta (BASE_PATH, p. ej. /cotizalo).
//    fetch() quita esa ruta antes de llegar a Hono, así que todo lo de abajo trabaja como si estuviera en la raíz.
//  • Resuelve el negocio por el primer segmento de la ruta: <base>/<negocio>, <base>/<negocio>/admin
//    y <base>/<negocio>/api/...; la plataforma usa <base>, <base>/super y <base>/api/super/...
//  • Expone las rutas de src/routes/* (declaradas en un Router neutral) como rutas de Hono.
//  • Sirve las páginas y los archivos estáticos de /public mediante el binding ASSETS.
//  • export default { fetch, scheduled }: `scheduled` actualiza la tasa BCV con el Cron Trigger.
import { Hono } from 'hono';
import { env, configurarEnv } from './env.js';
import { bindD1 } from './db.js';
import { rt } from './runtime.js';
import { parseCookies } from './auth.js';
import { Router, Raw } from './http.js';
import { HttpError } from './util.js';
import { negocioPorSlug, RESERVADOS } from './negocio.js';
import { consultaProgramada } from './bcv.js';
import { registrarPublicas } from './routes/public.js';
import { registrarAdmin } from './routes/admin.js';
import { registrarSuper, superDe } from './routes/super.js';
import { registrarAcceso } from './routes/acceso.js';

const router = new Router();
registrarPublicas(router);
registrarAdmin(router);
registrarSuper(router);
registrarAcceso(router);

export const app = new Hono();

// ───────────── Utilidades de respuesta ─────────────
const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

function respJson(status, obj, cookies = []) {
  const h = new Headers(JSON_HEADERS);
  for (const c of cookies) h.append('set-cookie', c);
  return new Response(JSON.stringify(obj), { status, headers: h });
}

function respHtml(status, html, cookies = []) {
  const h = new Headers({ 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  for (const c of cookies) h.append('set-cookie', c);
  return new Response(html, { status, headers: h });
}

const paginaMensaje = (titulo, texto) =>
  `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${titulo}</title><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap"><link rel="stylesheet" href="${env.basePath}/css/app.css"></head><body class="mensaje"><main class="card centro"><h1>${titulo}</h1><p>${texto}</p></main></body></html>`;

const noEncontrada = () => respHtml(404, paginaMensaje('No encontrado', 'La página que buscas no existe.'));

/** Copia mutable de la respuesta con las cabeceras de seguridad (las de ASSETS son inmutables). */
function conSeguridad(res) {
  const r = new Response(res.body, res);
  r.headers.set('X-Content-Type-Options', 'nosniff');
  r.headers.set('X-Frame-Options', 'DENY');
  r.headers.set('Referrer-Policy', 'same-origin');
  r.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  r.headers.set(
    'Content-Security-Policy',
    "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  );
  if (env.cookieSecure) r.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  return r;
}

// ───────────── Negocio (tenant) por ruta: /<negocio>/... ─────────────
/** El primer segmento de la ruta es el negocio, salvo las rutas propias de la plataforma (/api, /super, /css…). */
function tenantDe(url) {
  let seg = '';
  try { seg = decodeURIComponent(url.pathname.split('/')[1] || '').toLowerCase(); } catch { /* ruta mal codificada */ }
  if (seg && !RESERVADOS.has(seg)) return { slug: seg };
  return { root: true };
}

// Detrás de Cloudflare la IP real llega en CF-Connecting-IP (Cloudflare la sobrescribe: el cliente no puede falsearla).
const clientIp = (h) => h['cf-connecting-ip'] || String(h['x-forwarded-for'] || '').split(',')[0].trim() || 'desconocida';

async function leerJson(req, max = 400_000) {
  const largo = Number(req.headers.get('content-length') || 0);
  if (largo > max) throw new HttpError(413, 'La solicitud es demasiado grande.');
  const buf = await req.arrayBuffer();
  if (buf.byteLength > max) throw new HttpError(413, 'La solicitud es demasiado grande.');
  if (!buf.byteLength) return {};
  if (!String(req.headers.get('content-type') || '').includes('application/json')) throw new HttpError(415, 'Formato no permitido.');
  try {
    const v = JSON.parse(new TextDecoder().decode(buf));
    return v && typeof v === 'object' ? v : {};
  } catch {
    throw new HttpError(400, 'La solicitud no es válida.');
  }
}

// ───────────── Middleware: bindings, tarea en segundo plano, cabeceras ─────────────
app.use('*', async (c, next) => {
  configurarEnv(c.env);
  bindD1(c.env.DB);
  rt.waitUntil = (p) => {
    const q = Promise.resolve(p).catch(() => {});
    try { c.executionCtx.waitUntil(q); } catch { /* sin ExecutionContext (pruebas) */ }
  };
  await next();
  c.res = conSeguridad(c.res);
});

app.get('/healthz', () => new Response('ok', { headers: { 'content-type': 'text/plain' } }));

// ───────────── API: cada ruta registrada en el Router pasa por aquí ─────────────
async function atender(c, r) {
  const req = c.req.raw;
  const url = new URL(c.req.url);
  const headers = Object.fromEntries(req.headers);
  const tenant = tenantDe(url);
  const o = r.opts;
  const ctx = {
    req: { headers }, url, params: c.req.param(), tenant, ip: clientIp(headers), setCookies: [],
    query: Object.fromEntries(url.searchParams), cookies: parseCookies(headers.cookie), body: {},
  };
  if (o.tenant) {
    if (tenant.root) throw new HttpError(404, 'Negocio no encontrado.');
    const neg = await negocioPorSlug(tenant.slug);
    if (!neg) throw new HttpError(404, 'Negocio no encontrado.');
    // Un negocio suspendido no atiende a nadie… salvo al superadministrador.
    if (!neg.activo && !(await superDe(ctx.cookies))) throw new HttpError(403, 'Este servicio no está disponible por el momento.');
    ctx.negocio = neg;
  }
  if (o.root && !tenant.root) throw new HttpError(404, 'No encontrado.');
  if (r.method !== 'GET') {
    // Cabecera propia: un formulario de otro sitio no puede enviarla (requeriría CORS).
    if (!o.noCsrf && headers['x-app'] !== '1') throw new HttpError(403, 'Solicitud no permitida.');
    ctx.body = await leerJson(req);
  }
  if (o.auth) ctx.usuario = await o.auth(ctx);

  const out = await r.handler(ctx);
  if (out instanceof Raw) {
    const h = new Headers({ 'content-type': out.type, 'cache-control': 'no-store', ...out.headers });
    for (const ck of ctx.setCookies) h.append('set-cookie', ck);
    return new Response(out.body, { status: 200, headers: h });
  }
  return respJson(200, out ?? { ok: true }, ctx.setCookies);
}

// Las rutas de un negocio cuelgan de /:negocio (p. ej. /demo/api/publico/config); las de la plataforma, de la raíz.
for (const r of router.routes) app.on(r.method, r.opts.tenant ? `/:negocio${r.path}` : r.path, (c) => atender(c, r));

// ───────────── Archivos estáticos y páginas (binding ASSETS) ─────────────
async function asset(c, ruta, { status = 200 } = {}) {
  if (!c.env.ASSETS) throw new HttpError(500, 'Falta el binding ASSETS (revisa wrangler.jsonc → assets).');
  const u = new URL(c.req.url);
  u.pathname = ruta;
  u.search = '';
  const html = ruta.endsWith('.html');
  // Las páginas no se revalidan con ETag: se reescriben al servirlas (ver abajo).
  const r = await c.env.ASSETS.fetch(new Request(u, { method: 'GET', headers: html ? {} : c.req.raw.headers }));
  if (r.status === 404) return noEncontrada();
  const h = new Headers(r.headers);
  if (html) {
    // Los HTML enlazan sus archivos desde la raíz (href="/css/app.css"); se les antepone BASE_PATH.
    h.delete('etag');
    h.delete('content-length');
    h.set('cache-control', 'no-cache');
    const texto = (await r.text()).replace(/(href|src)="\/(?!\/)/g, `$1="${env.basePath}/`);
    return new Response(texto, { status, headers: h });
  }
  h.set('cache-control', 'no-cache'); // revalida con ETag: los cambios se ven al instante
  return new Response(r.status === 304 ? null : r.body, { status: r.status === 304 ? 304 : status, headers: h });
}

for (const dir of ['/css/*', '/js/*', '/img/*']) app.get(dir, (c) => asset(c, new URL(c.req.url).pathname));
app.get('/favicon.ico', (c) => asset(c, '/img/favicon.svg'));

async function pagina(c, archivo) {
  const tenant = tenantDe(new URL(c.req.url));
  if (tenant.root) return noEncontrada(); // /api, /css… no son negocios
  const neg = await negocioPorSlug(tenant.slug);
  if (!neg) return respHtml(404, paginaMensaje('Negocio no encontrado', 'No existe un negocio con esta dirección. Revisa que el enlace esté bien escrito.'));
  if (!neg.activo && !(await superDe(parseCookies(c.req.raw.headers.get('cookie') || '')))) {
    return respHtml(403, paginaMensaje('Servicio no disponible', 'Este servicio no está disponible por el momento.'));
  }
  return asset(c, archivo);
}

/** /Demo/ → /demo (la dirección canónica va en minúsculas y sin barra final). */
function canonica(c, resto = '') {
  const url = new URL(c.req.url);
  const slug = String(c.req.param('negocio') || '').toLowerCase();
  const destino = `/${slug}${resto}`;
  if (url.pathname === destino) return null;
  return new Response(null, { status: 301, headers: { location: env.basePath + destino + url.search } });
}

app.get('/', (c) => asset(c, '/landing.html'));
app.get('/super', (c) => asset(c, '/super.html'));
app.get('/:negocio', (c) => canonica(c) || pagina(c, '/index.html'));
app.get('/:negocio/', (c) => canonica(c) || pagina(c, '/index.html'));
app.get('/:negocio/admin', (c) => canonica(c, '/admin') || pagina(c, '/admin.html'));
app.get('/:negocio/admin/', (c) => canonica(c, '/admin') || pagina(c, '/admin.html'));

// ───────────── Errores ─────────────
const esApi = (c) => /^\/(?:[^/]+\/)?api\//.test(new URL(c.req.url).pathname);
app.notFound((c) => (esApi(c) ? respJson(404, { error: 'No encontrado.' }) : noEncontrada()));

app.onError((e, c) => {
  const status = e instanceof HttpError ? e.status : 500;
  if (!(e instanceof HttpError)) console.error('[error]', c.req.method, c.req.url, e);
  const mensaje = e instanceof HttpError ? e.message : 'Ocurrió un error inesperado. Intenta de nuevo.';
  if (esApi(c)) return respJson(status, { error: mensaje });
  return respHtml(status, paginaMensaje('Ups', mensaje));
});

/**
 * Monta la app bajo BASE_PATH: /cotizalo/demo/admin → Hono ve /demo/admin.
 * Lo que queda fuera de la base no es de esta app: la raíz del dominio redirige a la base
 * (útil en *.workers.dev; en dualstudio.app esas rutas las atiende la página central).
 */
function montar(request, bindings, ctx) {
  configurarEnv(bindings);
  const base = env.basePath;
  if (!base) return app.fetch(request, bindings, ctx);
  const url = new URL(request.url);
  const p = url.pathname;
  if (p === base || p.startsWith(`${base}/`)) {
    if (p === `${base}/`) return new Response(null, { status: 301, headers: { location: base + url.search } });
    url.pathname = p.slice(base.length) || '/';
    return app.fetch(new Request(url, request), bindings, ctx);
  }
  if (p === '/') return new Response(null, { status: 302, headers: { location: base } });
  return conSeguridad(respHtml(404, paginaMensaje('No encontrado', 'La página que buscas no existe.')));
}

export default {
  fetch: montar,
  /** Cron Trigger (cada hora): actualiza la tasa BCV. */
  async scheduled(_event, bindings, ctx) {
    configurarEnv(bindings);
    bindD1(bindings.DB);
    ctx.waitUntil(consultaProgramada());
  },
};
