// Sesión y permisos de Planifica, sobre las cuentas compartidas de @dualstudio/comun.
//  · Siempre hay que iniciar sesión (una cookie para toda la app, bajo BASE_PATH).
//  · Administrador (es_admin): ve todos los clientes, como editor, y gestiona clientes, equipo y accesos.
//  · Los demás ven solo los clientes que tienen asignados, como editor o solo lectura.
import { db, HttpError, tipoDeSesion, aplicarSecretosDeRecuperacion, uuid, nowIso } from '@dualstudio/comun/servidor';
import { env } from './env.js';

export const SESION = tipoDeSesion({ cookie: 'sid_planifica', tipo: 'p', horas: 12 });

/** Palabras que no pueden ser la dirección de un cliente (las usa la app). */
export const RESERVADOS = new Set(['admin', 'api', 'css', 'js', 'img', 'vendor', '_ds', 'healthz', 'favicon.ico', 'cuenta', 'super']);

const COLS = 'id, email, nombre, password_hash, es_admin, activo, sesion_version';

/** El usuario de la sesión, o null. */
export async function usuarioDe(cookies) {
  const tok = SESION.leer(cookies);
  if (!tok) return null;
  const u = await db.get(`SELECT ${COLS} FROM usuarios WHERE id = ?`, [tok.uid]);
  if (!u || !u.activo || !SESION.vigente(tok, u)) return null;
  return u;
}

/** opts.auth: exige sesión. */
export async function conSesion(ctx) {
  const u = await usuarioDe(ctx.cookies);
  if (!u) throw new HttpError(401, 'Inicia sesión para continuar.');
  return u;
}

/** opts.auth: exige ser administrador de Dual Studio. */
export async function soloAdmin(ctx) {
  const u = await conSesion(ctx);
  if (!u.es_admin) throw new HttpError(403, 'Solo un administrador puede hacer esto.');
  return u;
}

/** Clientes que puede ver un usuario, con su papel en cada uno. */
export async function clientesDe(u) {
  if (u.es_admin) {
    return (await db.all('SELECT id, slug, nombre, handle, activo FROM clientes ORDER BY activo DESC, nombre'))
      .map((c) => ({ ...c, rol: 'editor' }));
  }
  return db.all(
    `SELECT c.id, c.slug, c.nombre, c.handle, c.activo, a.rol
       FROM accesos a JOIN clientes c ON c.id = a.cliente_id
      WHERE a.usuario_id = ? AND c.activo = 1 ORDER BY c.nombre`,
    [u.id],
  );
}

/**
 * Para las rutas de un cliente (/<cliente>/api/...): sesión + cliente + papel.
 * Deja en ctx: usuario, cliente y rol ('editor' | 'lector'). Un cliente sin acceso responde 404 (no se revela que existe).
 */
export async function accesoACliente(ctx) {
  const u = await conSesion(ctx);
  const slug = String(ctx.params.cliente || '').toLowerCase();
  const c = await db.get('SELECT id, slug, nombre, handle, activo, cambiado_en FROM clientes WHERE slug = ?', [slug]);
  let rol = null;
  if (c && u.es_admin) rol = 'editor';
  else if (c && c.activo) rol = (await db.get('SELECT rol FROM accesos WHERE usuario_id = ? AND cliente_id = ?', [u.id, c.id]))?.rol || null;
  if (!rol) throw new HttpError(404, 'No tienes acceso a este cliente o no existe.');
  ctx.cliente = c;
  ctx.rol = rol;
  return u;
}

/** Lanza 403 si el papel es solo lectura. */
export function exigirEditor(ctx) {
  if (ctx.rol !== 'editor') throw new HttpError(403, 'Tienes acceso de solo lectura a este cliente.');
}

/** Con SUPER_EMAIL / SUPER_PASSWORD se crea (o recupera) un administrador. Una sola vez (ver comun/cuentas.js). */
export function asegurarAdminDesdeSecretos() {
  return aplicarSecretosDeRecuperacion({
    email: env.superEmail,
    password: env.superPassword,
    clave: 'admin_secretos_aplicados',
    buscar: (email) => db.get('SELECT id, password_hash FROM usuarios WHERE email = ?', [email]),
    actualizar: (id, hash) => db.run('UPDATE usuarios SET password_hash = ?, es_admin = 1, activo = 1 WHERE id = ?', [hash, id]),
    crear: (email, hash) => db.run(
      'INSERT OR IGNORE INTO usuarios (id, email, nombre, password_hash, es_admin, activo, creado_en) VALUES (?,?,?,?,1,1,?)',
      [uuid(), email, 'Administrador', hash, nowIso()],
    ),
  });
}
