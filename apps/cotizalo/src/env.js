// Configuración de Cotízalo: la común de @dualstudio/comun (BASE_PATH, SESSION_SECRET, ENVIRONMENT,
// TZ_OFFSET_MIN, PBKDF2_ITER, SUPER_EMAIL/SUPER_PASSWORD) más las variables propias de esta app. Todas viven en el mismo objeto `env`.
import {
  bool,
  configurarEnv as configurarComun,
  env,
  normalizarBase,
} from "@dualstudio/comun/servidor";

export { env, normalizarBase };

/** Aplica los bindings de Cloudflare (o un objeto equivalente, p. ej. process.env en pruebas o en el seed). */
export function configurarEnv(b = {}) {
  return configurarComun(b, (v, e) => {
    e.bcvUrl = v.BCV_API_URL || "https://ve.dolarapi.com/v1/dolares/oficial";
    e.bcvStaleHours = Number(v.BCV_STALE_HOURS || 36);
    e.bcvDisabled = bool(v.BCV_DISABLED, false);
    e.datosEjemplo = bool(v.DATOS_DE_EJEMPLO, false); // botón «Crear negocio de ejemplo» (solo en el sitio de pruebas)
  });
}
