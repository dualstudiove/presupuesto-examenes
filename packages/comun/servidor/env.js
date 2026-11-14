// Configuración común a todas las apps. En Cloudflare Workers no hay process.env ni sistema de archivos:
// los valores llegan en los "bindings" de cada petición (wrangler.jsonc → vars, y secretos con
// `wrangler secret put`). crearServidor() llama a configurarEnv(c.env) al inicio de cada petición.
//
// Cada app añade sus propias variables con configurarEnv(bindings, (b, env) => { env.miVariable = … }).
// Todas comparten este mismo objeto `env`.

export const bool = (
  v,
  def,
) => (v === undefined || v === null || v === "" ? def : v === true || v === "true" || v === "1");

export const env = {
  production: false,
  development: false,
  basePath: "", // ruta donde está montada la app: '' (raíz de su dominio) o '/cotizalo'
  sessionSecret: "",
  cookieSecure: false,
  tzOffsetMin: -240,
  pbkdf2Iter: 100_000,
  superEmail: "", // secretos de recuperación del acceso (ver cuentas.js)
  superPassword: "",
};

/** '/cotizalo/' | 'cotizalo' | '/' | '' → '/cotizalo' o '' (sin barra final). */
export function normalizarBase(v) {
  const s = String(v ?? "").trim().replace(/^\/+|\/+$/g, "");
  if (!s) return "";
  if (!/^[a-z0-9][a-z0-9/_-]*$/i.test(s)) {
    throw new Error(`BASE_PATH no válido: «${v}». Usa algo como /cotizalo.`);
  }
  return `/${s}`;
}

const SECRETO_DESARROLLO = "solo-desarrollo-no-usar-en-produccion-0123456789";

/**
 * Aplica los bindings de Cloudflare (o un objeto equivalente, p. ej. process.env en pruebas o en el seed).
 * extra(b, env): las variables propias de la app.
 *
 * SESSION_SECRET es obligatorio. La única excepción es ENVIRONMENT = "development" (tu computadora,
 * con `wrangler dev`): ahí, si falta, se usa uno de desarrollo. Así un olvido nunca deja una app
 * publicada con un secreto conocido.
 */
export function configurarEnv(b = {}, extra) {
  env.development = b.ENVIRONMENT === "development";
  env.production = !env.development;
  env.basePath = normalizarBase(b.BASE_PATH);
  env.sessionSecret = b.SESSION_SECRET || "";
  env.cookieSecure = bool(b.COOKIE_SECURE, env.production);
  env.tzOffsetMin = Number(b.TZ_OFFSET_MIN ?? -240);
  const iter = Number(b.PBKDF2_ITER || 100_000);
  env.pbkdf2Iter = Number.isInteger(iter) && iter >= 10_000 && iter <= 100_000 ? iter : 100_000;
  env.superEmail = b.SUPER_EMAIL || "";
  env.superPassword = b.SUPER_PASSWORD || "";
  if (!env.sessionSecret) {
    if (!env.development) {
      throw new Error(
        "Falta el secreto SESSION_SECRET. Agrégalo en Cloudflare (en el Worker: Configuración → Variables y secretos; en el sitio de pruebas: los secretos de las vistas previas) o con: wrangler secret put SESSION_SECRET.",
      );
    }
    env.sessionSecret = SECRETO_DESARROLLO;
  } else if (env.sessionSecret.length < 32 && !env.development) {
    throw new Error(
      "El secreto SESSION_SECRET es demasiado corto: usa un texto aleatorio de 32 caracteres o más.",
    );
  }
  if (extra) extra(b, env);
  return env;
}
