// Configuración a partir de variables de entorno (y de un archivo .env opcional).
import fs from 'node:fs';
import crypto from 'node:crypto';

try {
  const txt = fs.readFileSync(new URL('../.env', import.meta.url), 'utf8');
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (!m || line.trim().startsWith('#')) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(m[1] in process.env) || process.env[m[1]] === '') process.env[m[1]] = v;
  }
} catch { /* sin .env: se usan las variables del entorno */ }

const production = process.env.NODE_ENV === 'production';
let secret = process.env.SESSION_SECRET;
if (!secret) {
  if (production) throw new Error('Falta SESSION_SECRET (obligatorio en producción).');
  secret = crypto.randomBytes(32).toString('hex');
  console.warn('[aviso] SESSION_SECRET no definido: se usa uno temporal; las sesiones se cierran al reiniciar.');
}

const bool = (v, def) => (v === undefined || v === '' ? def : v === 'true' || v === '1');

export const env = {
  production,
  port: Number(process.env.PORT || 3000),
  host: process.env.HOST || '0.0.0.0',
  baseDomain: (process.env.BASE_DOMAIN || 'localhost').toLowerCase(),
  databaseFile: process.env.DATABASE_FILE || './data/app.db',
  databaseUrl: process.env.DATABASE_URL || '',
  sessionSecret: secret,
  cookieSecure: bool(process.env.COOKIE_SECURE, production),
  trustProxy: bool(process.env.TRUST_PROXY, false),
  tzOffsetMin: Number(process.env.TZ_OFFSET_MIN ?? -240),
  bcvUrl: process.env.BCV_API_URL || 'https://ve.dolarapi.com/v1/dolares/oficial',
  bcvStaleHours: Number(process.env.BCV_STALE_HOURS || 36),
  bcvDisabled: bool(process.env.BCV_DISABLED, false),
  cronSecret: process.env.CRON_SECRET || '',
  allowTenantQuery: bool(process.env.ALLOW_TENANT_QUERY, !production),
  superEmail: process.env.SUPER_EMAIL || '',
  superPassword: process.env.SUPER_PASSWORD || '',
};
