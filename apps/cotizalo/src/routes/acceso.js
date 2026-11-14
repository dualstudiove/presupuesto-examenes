// Inicio de sesión único (página principal de la app): según el correo y la contraseña,
// abre el panel del superadministrador o el del negocio que administra esa persona.
import { env } from '../env.js';
import { db, verifyPassword, HASH_RELLENO, credenciales, frenoDeIntentos } from '@dualstudio/comun/servidor';
import { HttpError } from '../util.js';
import { cookieSesionSuper, superDe } from './super.js';
import { cookieSesionAdmin } from './admin.js';

// Tope de cuentas de administrador con el mismo correo que se comprueban: cada una cuesta una verificación de
// contraseña (CPU), y el plan gratuito de Workers da 10 ms por petición.
const MAX_NEGOCIOS = 5;

export function registrarAcceso(r) {
  /**
   * { email, password } → { rol: 'super', destino } | { rol: 'admin', destino?, negocios: [{ slug, nombre, destino }] }
   * Un mismo correo puede administrar varios negocios (una cuenta por negocio): se abren todos
   * los que coincidan con la contraseña y, si son varios, la página deja elegir.
   */
  r.add('POST', '/api/login', { root: true }, async (ctx) => {
    const { email, password: pw } = credenciales(ctx.body);
    if (!email || !pw) throw new HttpError(400, 'Escribe tu correo y tu contraseña.');
    const freno = frenoDeIntentos(`l|${email}|${ctx.ip}`, ctx.ip);

    const base = env.basePath;
    const sup = await db.get('SELECT id, email, password_hash, sesion_version FROM superadmins WHERE email = ?', [email]);
    const admins = await db.all(
      `SELECT u.id, u.password_hash, u.sesion_version, n.id AS nid, n.slug, n.nombre, n.activo AS negocio_activo
         FROM usuarios_admin u JOIN negocios n ON n.id = u.negocio_id
        WHERE u.email = ? AND u.activo = 1 ORDER BY n.nombre LIMIT ${MAX_NEGOCIOS}`,
      [email],
    );

    // Sin cuentas con ese correo se compara igual contra un hash de relleno: el tiempo de respuesta no lo delata.
    if (!sup && !admins.length) await verifyPassword(pw, HASH_RELLENO);

    if (sup && (await verifyPassword(pw, sup.password_hash))) {
      freno.exito();
      ctx.setCookies.push(cookieSesionSuper(sup));
      return { rol: 'super', destino: `${base}/super` };
    }

    const negocios = [];
    let suspendido = false;
    for (const a of admins) {
      if (!(await verifyPassword(pw, a.password_hash))) continue;
      if (!a.negocio_activo) { suspendido = true; continue; }
      const negocio = { id: a.nid, slug: a.slug };
      ctx.setCookies.push(cookieSesionAdmin(a, negocio));
      negocios.push({ slug: a.slug, nombre: a.nombre, destino: `${base}/${a.slug}/admin` });
    }
    if (negocios.length) {
      freno.exito();
      return { rol: 'admin', destino: negocios.length === 1 ? negocios[0].destino : null, negocios };
    }
    if (suspendido) throw new HttpError(403, 'Tu negocio está suspendido. Escribe al equipo de la plataforma.');
    freno.fallo();
    throw new HttpError(401, 'Correo o contraseña incorrectos.');
  });

  /** Para la página principal: si ya hay sesión de superadministrador, va directo a su panel. */
  r.add('GET', '/api/sesion', { root: true }, async ({ cookies }) => {
    const s = await superDe(cookies);
    return { super: s ? { email: s.email, destino: `${env.basePath}/super` } : null };
  });
}
