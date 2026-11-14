// Configuración de __TITULO__: la común (BASE_PATH, SESSION_SECRET, ENVIRONMENT, TZ_OFFSET_MIN, PBKDF2_ITER)
// más las variables propias de esta app, que se añaden aquí.
import { configurarEnv as configurarComun, env } from "@dualstudio/comun/servidor";

export { env };

export function configurarEnv(b = {}) {
  return configurarComun(b, (_v, _e) => {
    // Variables propias, p. ej.:  e.miVariable = v.MI_VARIABLE || 'valor por defecto';
  });
}
