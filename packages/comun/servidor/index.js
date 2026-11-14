// @dualstudio/comun/servidor: lo que comparten los Workers de todas las apps.
// (d1-local.js no se exporta aquí: usa node:sqlite y solo sirve para pruebas y el seed.)
export { bool, configurarEnv, env, normalizarBase } from "./env.js";
export { bindD1, d1Actual, db } from "./db.js";
export { rt } from "./runtime.js";
export { HttpError, Raw, Router } from "./http.js";
export {
  csv,
  entero,
  escHtml,
  esColor,
  esDia,
  esEmail,
  hoy,
  nowIso,
  optStr,
  parteFecha,
  placeholders,
  str,
  sumarDias,
  uuid,
  validarPassword,
} from "./util.js";
export {
  bloqueoRestante,
  cookie,
  firmarToken,
  HASH_RELLENO,
  hashPassword,
  igualesTexto,
  leerToken,
  limite,
  limpiarFallos,
  marcaPassword,
  parseCookies,
  registrarFallo,
  verifyPassword,
} from "./auth.js";
export { crearEsquema, instrucciones, TABLAS_COMUNES } from "./esquema.js";
export { cuotaDeHoy, cuotaDiaria, guardarAjuste, leerAjuste } from "./cuotas.js";
export {
  aplicarSecretosDeRecuperacion,
  cerrarOtrasSesiones,
  comprobarPassword,
  credenciales,
  frenoDeIntentos,
  olvidarCacheDeSecretos,
  secretosDeRecuperacionActivos,
  tipoDeSesion,
} from "./cuentas.js";
export {
  CABECERAS_SEGURIDAD,
  conSeguridad,
  crearServidor,
  CSP,
  respHtml,
  respJson,
} from "./servidor.js";
