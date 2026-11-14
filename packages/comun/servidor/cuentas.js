// Cuentas de usuario comunes a las apps: sesiones en cookie firmada (con versión para cerrarlas a distancia),
// inicio de sesión con bloqueo por intentos, «cerrar sesión en los demás dispositivos» y secretos de
// recuperación de un solo uso. Cada app decide sus tablas y sus papeles; esto es la mecánica compartida.
import crypto from "node:crypto";
import { env } from "./env.js";
import { db } from "./db.js";
import { HttpError } from "./http.js";
import { esEmail, str } from "./util.js";
import {
  bloqueoRestante,
  cookie,
  firmarToken,
  HASH_RELLENO,
  hashPassword,
  leerToken,
  limite,
  limpiarFallos,
  marcaPassword,
  registrarFallo,
  verifyPassword,
} from "./auth.js";
import { guardarAjuste, leerAjuste } from "./cuotas.js";

// ── Sesiones ──
/**
 * Un tipo de sesión: tipoDeSesion({ cookie: 'sid', tipo: 'u', horas: 12 }).
 *  · emitir(usuario, { datos, path }) → cabecera Set-Cookie. El usuario trae id, password_hash y sesion_version.
 *  · leer(cookies) → el contenido del token si es de este tipo y no venció (sin mirar la base).
 *  · vigente(token, usuarioDeLaBase) → true si la contraseña y la versión de sesión siguen siendo las mismas.
 *  · cerrar({ path }) → cabecera Set-Cookie que borra la cookie.
 * Cambiar la contraseña o subir sesion_version invalida todas las cookies anteriores de ese usuario.
 */
export function tipoDeSesion({ cookie: nombre, tipo, horas = 12 }) {
  const ttl = Math.round(horas * 3600);
  return {
    nombre,
    emitir(u, { datos = {}, path } = {}) {
      const token = firmarToken({
        k: tipo,
        uid: u.id,
        ph: marcaPassword(u.password_hash),
        sv: u.sesion_version ?? 0,
        ...datos,
      }, ttl);
      return cookie(nombre, token, { maxAge: ttl, ...(path ? { path } : {}) });
    },
    leer(cookies) {
      const tok = leerToken(cookies?.[nombre]);
      return tok && tok.k === tipo ? tok : null;
    },
    vigente(tok, u) {
      return Boolean(
        tok && u && marcaPassword(u.password_hash) === tok.ph &&
          (tok.sv ?? 0) === (u.sesion_version ?? 0),
      );
    },
    cerrar({ path } = {}) {
      return cookie(nombre, "", { expire: true, ...(path ? { path } : {}) });
    },
  };
}

/** Sube la versión de sesión: todas las cookies anteriores de ese usuario dejan de valer. Devuelve la nueva versión. */
export async function cerrarOtrasSesiones(tabla, usuario) {
  if (!/^[a-z_]+$/.test(tabla)) throw new Error(`Tabla no válida: ${tabla}`);
  await db.run(
    `UPDATE ${tabla} SET sesion_version = COALESCE(sesion_version, 0) + 1 WHERE id = ?`,
    [usuario.id],
  );
  return (usuario.sesion_version ?? 0) + 1;
}

// ── Inicio de sesión ──
/** Correo y contraseña del cuerpo de la petición, normalizados. */
export function credenciales(body = {}) {
  return {
    email: str(body.email, 160).toLowerCase(),
    password: typeof body.password === "string" ? body.password.slice(0, 200) : "",
  };
}

/**
 * Freno contra fuerza bruta para un intento de inicio de sesión.
 * Lanza 429 si la IP hace demasiados intentos o si esa clave (p. ej. correo + IP) está bloqueada.
 * Devuelve { fallo(), exito() } para registrar el resultado.
 */
export function frenoDeIntentos(
  clave,
  ip,
  { maxPorIp = 30, ventanaMs = 15 * 60_000, prefijo = "login" } = {},
) {
  if (!limite(`${prefijo}|${ip}`, maxPorIp, ventanaMs)) {
    throw new HttpError(429, "Demasiados intentos. Espera unos minutos.");
  }
  const espera = bloqueoRestante(clave);
  if (espera) {
    throw new HttpError(
      429,
      `Demasiados intentos fallidos. Intenta de nuevo en ${Math.ceil(espera / 60)} minuto(s).`,
    );
  }
  return { fallo: () => registrarFallo(clave), exito: () => limpiarFallos(clave) };
}

/**
 * Comprueba la contraseña. Si no hay hash (el correo no existe) compara igual contra un hash de relleno,
 * para que el tiempo de respuesta no revele qué correos existen.
 */
export async function comprobarPassword(password, hash) {
  const ok = await verifyPassword(password, hash || HASH_RELLENO);
  return Boolean(hash) && ok;
}

// ── Secretos de recuperación (SUPER_EMAIL / SUPER_PASSWORD) ──
// Si el Worker tiene esos secretos, la cuenta se crea o recibe esa contraseña. Se aplican UNA sola vez: la base
// recuerda (tabla _ajustes, solo una huella) qué secretos ya se usaron, así que cambiar luego la contraseña
// desde el panel no se deshace. La app debe avisar mientras los secretos sigan guardados en Cloudflare.
const aplicados = new Map();
const huella = (email, pw) => crypto.createHash("sha256").update(`${email}\n${pw}`).digest("hex");

/** Solo para pruebas: imita una instancia nueva del Worker (sin la caché en memoria). */
export const olvidarCacheDeSecretos = () => aplicados.clear();

/**
 * opciones:
 *  email, password   los secretos (si falta alguno, no hace nada)
 *  clave             nombre del ajuste donde se guarda la huella
 *  buscar(email)     → { id, password_hash } | undefined
 *  actualizar(id, hash), crear(email, hash)
 */
export async function aplicarSecretosDeRecuperacion(
  { email, password, clave, buscar, actualizar, crear },
) {
  const correo = String(email || "").trim().toLowerCase();
  const pw = String(password || "");
  if (!correo || !pw) return false;
  const marca = `${clave}\n${correo}\n${pw}`;
  if (aplicados.get(clave) === marca) return false;
  aplicados.set(clave, marca); // también si falla: no se reintenta en cada petición
  if (!esEmail(correo) || pw.length < 8 || pw.length > 200) {
    console.error(
      "[cuentas] Los secretos de recuperación no son válidos (la contraseña necesita 8 caracteres o más).",
    );
    return false;
  }
  const h = huella(correo, pw);
  if ((await leerAjuste(clave)) === h) return false; // ya se usaron
  const u = await buscar(correo);
  if (!u || !(await verifyPassword(pw, u.password_hash))) {
    const hash = await hashPassword(pw);
    if (u) await actualizar(u.id, hash);
    else await crear(correo, hash);
    console.log(
      `[cuentas] Acceso ${u ? "restablecido" : "creado"} desde los secretos de recuperación.`,
    );
  }
  await guardarAjuste(clave, h);
  return true;
}

/** ¿Siguen guardados los secretos de recuperación? (para avisar en el panel) */
export const secretosDeRecuperacionActivos = () => Boolean(env.superEmail || env.superPassword);
