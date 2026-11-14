// @dualstudio/comun/servidor: lo que comparten los Workers de todas las apps.
// (d1-local.js no se exporta aquí: usa node:sqlite y solo sirve para pruebas y el seed.)
export { env, configurarEnv, normalizarBase, bool } from './env.js';
export { db, bindD1, d1Actual } from './db.js';
export { rt } from './runtime.js';
export { HttpError, Raw, Router } from './http.js';
export {
  uuid, nowIso, parteFecha, hoy, sumarDias, esDia, placeholders, str, optStr, entero,
  esColor, esEmail, validarPassword, escHtml, csv,
} from './util.js';
export {
  hashPassword, verifyPassword, HASH_RELLENO, marcaPassword, igualesTexto, firmarToken, leerToken,
  parseCookies, cookie, bloqueoRestante, registrarFallo, limpiarFallos, limite,
} from './auth.js';
export { crearEsquema, instrucciones, TABLAS_COMUNES } from './esquema.js';
export { cuotaDiaria, cuotaDeHoy, leerAjuste, guardarAjuste } from './cuotas.js';
export { crearServidor, conSeguridad, respJson, respHtml, CSP, CABECERAS_SEGURIDAD } from './servidor.js';
