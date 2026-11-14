// Configuración de Planifica: la común (BASE_PATH, SESSION_SECRET, ENVIRONMENT, TZ_OFFSET_MIN, PBKDF2_ITER,
// SUPER_EMAIL/SUPER_PASSWORD para recuperar el acceso de administrador). Por ahora no tiene variables propias.
import { env, configurarEnv as configurarComun } from '@dualstudio/comun/servidor';

export { env };

export function configurarEnv(b = {}) {
  return configurarComun(b);
}
