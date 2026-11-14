// Cotízalo en Cloudflare Workers: Hono + D1, sobre crearServidor() de @dualstudio/comun.
//
//  • La app vive bajo BASE_PATH (hoy /cotizalo); lo genérico (montaje, API, cabeceras, errores) lo hace comun.
//  • Aquí va lo propio de Cotízalo: el negocio se resuelve por el primer segmento de la ruta:
//    <base>/<negocio>, <base>/<negocio>/admin y <base>/<negocio>/api/...;
//    la plataforma usa <base>, <base>/super y <base>/api/super/...
//  • export default { fetch, scheduled }: `scheduled` actualiza la tasa BCV con el Cron Trigger.
import { Router, HttpError, parseCookies, crearServidor, env } from '@dualstudio/comun/servidor';
import { configurarEnv } from './env.js';
import { negocioPorSlug, RESERVADOS } from './negocio.js';
import { consultaProgramada } from './bcv.js';
import { registrarPublicas } from './routes/public.js';
import { registrarAdmin } from './routes/admin.js';
import { registrarSuper, superDe, asegurarSuperDesdeSecretos } from './routes/super.js';
import { registrarAcceso } from './routes/acceso.js';
import { asegurarEsquema } from './esquema.js';

const router = new Router();
registrarPublicas(router);
registrarAdmin(router);
registrarSuper(router);
registrarAcceso(router);

// ───────────── Negocio (tenant) por ruta: /<negocio>/... ─────────────
/** El primer segmento de la ruta es el negocio, salvo las rutas propias de la plataforma (/api, /super, /css…). */
function tenantDe(url) {
  let seg = '';
  try { seg = decodeURIComponent(url.pathname.split('/')[1] || '').toLowerCase(); } catch { /* ruta mal codificada */ }
  if (seg && !RESERVADOS.has(seg)) return { slug: seg };
  return { root: true };
}

/** Antes de cada ruta de la API: qué negocio es y si puede atender. */
async function contexto(ctx, r) {
  const tenant = tenantDe(ctx.url);
  ctx.tenant = tenant;
  if (r.opts.tenant) {
    if (tenant.root) throw new HttpError(404, 'Negocio no encontrado.');
    const neg = await negocioPorSlug(tenant.slug);
    if (!neg) throw new HttpError(404, 'Negocio no encontrado.');
    // Un negocio suspendido no atiende a nadie… salvo al superadministrador.
    if (!neg.activo && !(await superDe(ctx.cookies))) throw new HttpError(403, 'Este servicio no está disponible por el momento.');
    ctx.negocio = neg;
  }
  if (r.opts.root && !tenant.root) throw new HttpError(404, 'No encontrado.');
}

function paginas(app, { asset, respHtml, paginaMensaje, noEncontrada }) {
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
}

export const { app, fetch, scheduled } = crearServidor({
  router,
  configurar: configurarEnv,
  asegurarEsquema,
  alIniciar: () => asegurarSuperDesdeSecretos(),
  // Las rutas de un negocio cuelgan de /:negocio (p. ej. /demo/api/publico/config); las de la plataforma, de la raíz.
  rutaApi: (r) => (r.opts.tenant ? `/:negocio${r.path}` : r.path),
  contexto,
  paginas,
  /** Cron Trigger (cada hora): actualiza la tasa BCV. */
  programado: () => consultaProgramada(),
});

export default { fetch, scheduled };
