// Configuración. En Cloudflare Workers no hay process.env ni sistema de archivos: los valores llegan
// en los "bindings" de cada petición (wrangler.jsonc → vars, y secretos con `wrangler secret put`).
// server.js llama a configurarEnv(c.env) al inicio de cada petición (es barato e idempotente).

const bool = (v, def) => (v === undefined || v === null || v === '' ? def : v === true || v === 'true' || v === '1');

export const env = {
  production: false,
  basePath: '', // ruta donde está montada la app: '' (raíz de su dominio) o '/cotizalo'
  sessionSecret: '',
  cookieSecure: false,
  tzOffsetMin: -240,
  bcvUrl: 'https://ve.dolarapi.com/v1/dolares/oficial',
  bcvStaleHours: 36,
  bcvDisabled: false,
  cronSecret: '',
  superEmail: '',
  superPassword: '',
};

/** '/cotizalo/' | 'cotizalo' | '/' | '' → '/cotizalo' o '' (sin barra final). */
export function normalizarBase(v) {
  const s = String(v ?? '').trim().replace(/^\/+|\/+$/g, '');
  if (!s) return '';
  if (!/^[a-z0-9][a-z0-9/_-]*$/i.test(s)) throw new Error(`BASE_PATH no válido: «${v}». Usa algo como /cotizalo.`);
  return `/${s}`;
}

/** Aplica los bindings de Cloudflare (o un objeto equivalente, p. ej. process.env en pruebas/seed). */
export function configurarEnv(b = {}) {
  env.production = b.ENVIRONMENT === 'production' || b.NODE_ENV === 'production';
  env.basePath = normalizarBase(b.BASE_PATH);
  env.sessionSecret = b.SESSION_SECRET || env.sessionSecret || '';
  env.cookieSecure = bool(b.COOKIE_SECURE, env.production);
  env.tzOffsetMin = Number(b.TZ_OFFSET_MIN ?? -240);
  env.bcvUrl = b.BCV_API_URL || 'https://ve.dolarapi.com/v1/dolares/oficial';
  env.bcvStaleHours = Number(b.BCV_STALE_HOURS || 36);
  env.bcvDisabled = bool(b.BCV_DISABLED, false);
  env.cronSecret = b.CRON_SECRET || '';
  env.superEmail = b.SUPER_EMAIL || '';
  env.superPassword = b.SUPER_PASSWORD || '';
  if (!env.sessionSecret) {
    if (env.production) throw new Error('Falta SESSION_SECRET (ejecuta: wrangler secret put SESSION_SECRET).');
    env.sessionSecret = 'solo-desarrollo-no-usar-en-produccion-0123456789';
  }
  return env;
}
