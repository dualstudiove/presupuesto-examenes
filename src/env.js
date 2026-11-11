// Configuración. En Cloudflare Workers no hay process.env ni sistema de archivos: los valores llegan
// en los "bindings" de cada petición (wrangler.jsonc → vars, y secretos con `wrangler secret put`).
// server.js llama a configurarEnv(c.env) al inicio de cada petición (es barato e idempotente).

const bool = (v, def) => (v === undefined || v === null || v === '' ? def : v === true || v === 'true' || v === '1');

export const env = {
  production: false,
  baseDomain: 'localhost',
  sessionSecret: '',
  cookieSecure: false,
  tzOffsetMin: -240,
  bcvUrl: 'https://ve.dolarapi.com/v1/dolares/oficial',
  bcvStaleHours: 36,
  bcvDisabled: false,
  cronSecret: '',
  allowTenantQuery: true,
  superEmail: '',
  superPassword: '',
};

/** Aplica los bindings de Cloudflare (o un objeto equivalente, p. ej. process.env en pruebas/seed). */
export function configurarEnv(b = {}) {
  env.production = b.ENVIRONMENT === 'production' || b.NODE_ENV === 'production';
  env.baseDomain = String(b.BASE_DOMAIN || 'localhost').toLowerCase();
  env.sessionSecret = b.SESSION_SECRET || env.sessionSecret || '';
  env.cookieSecure = bool(b.COOKIE_SECURE, env.production);
  env.tzOffsetMin = Number(b.TZ_OFFSET_MIN ?? -240);
  env.bcvUrl = b.BCV_API_URL || 'https://ve.dolarapi.com/v1/dolares/oficial';
  env.bcvStaleHours = Number(b.BCV_STALE_HOURS || 36);
  env.bcvDisabled = bool(b.BCV_DISABLED, false);
  env.cronSecret = b.CRON_SECRET || '';
  env.allowTenantQuery = bool(b.ALLOW_TENANT_QUERY, !env.production);
  env.superEmail = b.SUPER_EMAIL || '';
  env.superPassword = b.SUPER_PASSWORD || '';
  if (!env.sessionSecret) {
    if (env.production) throw new Error('Falta SESSION_SECRET (ejecuta: wrangler secret put SESSION_SECRET).');
    env.sessionSecret = 'solo-desarrollo-no-usar-en-produccion-0123456789';
  }
  return env;
}
