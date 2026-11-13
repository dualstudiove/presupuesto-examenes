// Panel de la plataforma (dominio raíz): crear negocios, administradores y gestionar la tasa.
import { db } from '../db.js';
import { env } from '../env.js';
import {
  verifyPassword, hashPassword, HASH_RELLENO, firmarToken, leerToken, marcaPassword, cookie,
  bloqueoRestante, registrarFallo, limpiarFallos, limite,
} from '../auth.js';
import { crearNegocio, invalidarNegocios } from '../negocio.js';
import { pasoEjemplo } from '../ejemplo.js';
import { estadoConsulta, guardarTasaManualGlobal, refrescarTasa, tasaGlobal } from '../bcv.js';
import { HttpError, uuid, nowIso, str, esColor, esEmail, validarPassword } from '../util.js';

/** Cookie de sesión del superadministrador (vale en toda la app: BASE_PATH). */
export const cookieSesionSuper = (u) => cookie('sid_super', firmarToken({ k: 's', uid: u.id, ph: marcaPassword(u.password_hash) }, 8 * 3600), { maxAge: 8 * 3600 });

/** ¿Las cookies traen una sesión válida de superadministrador? (no lanza error) */
export async function superDe(cookies) {
  try { return await sesionSuper({ cookies }); } catch { return null; }
}

// ── Recuperar el acceso sin terminal ──
// Si el Worker tiene los secretos SUPER_EMAIL y SUPER_PASSWORD (Cloudflare → Worker → Configuración →
// Variables y secretos), ese superadministrador se crea, o se le pone esa contraseña si ya existía.
// Se comprueba una vez por instancia del Worker. Al terminar, conviene borrar los secretos: mientras
// existan, la contraseña vuelve a ser esa cada vez que arranque una instancia nueva.
let secretosAplicados = null;
export async function asegurarSuperDesdeSecretos() {
  const email = String(env.superEmail || '').trim().toLowerCase();
  const pw = String(env.superPassword || '');
  if (!email || !pw) return;
  const clave = `${email}\n${pw}`;
  if (secretosAplicados === clave) return;
  secretosAplicados = clave; // también si falla: no se reintenta en cada petición
  if (!esEmail(email) || pw.length < 8 || pw.length > 200) {
    console.error('[super] SUPER_EMAIL o SUPER_PASSWORD no son válidos (la contraseña necesita 8 caracteres o más).');
    return;
  }
  const u = await db.get('SELECT id, password_hash FROM superadmins WHERE email = ?', [email]);
  if (u && (await verifyPassword(pw, u.password_hash))) return;
  const hash = await hashPassword(pw);
  if (u) await db.run('UPDATE superadmins SET password_hash = ? WHERE id = ?', [hash, u.id]);
  else await db.run('INSERT OR IGNORE INTO superadmins (id, email, password_hash, creado_en) VALUES (?,?,?,?)', [uuid(), email, hash, nowIso()]);
  console.log(`[super] Acceso de superadministrador ${u ? 'restablecido' : 'creado'} desde los secretos: ${email}`);
}

export async function sesionSuper(ctx) {
  const tok = leerToken(ctx.cookies.sid_super);
  if (!tok || tok.k !== 's') throw new HttpError(401, 'Inicia sesión para continuar.');
  const u = await db.get('SELECT id, email, password_hash FROM superadmins WHERE id = ?', [tok.uid]);
  if (!u || marcaPassword(u.password_hash) !== tok.ph) throw new HttpError(401, 'Tu sesión expiró. Inicia sesión de nuevo.');
  return u;
}

export function registrarSuper(r) {
  const S = { root: true, auth: sesionSuper };

  r.add('POST', '/api/super/login', { root: true }, async (ctx) => {
    const email = str(ctx.body.email, 160).toLowerCase();
    const pw = typeof ctx.body.password === 'string' ? ctx.body.password.slice(0, 200) : '';
    if (!limite(`slogin|${ctx.ip}`, 20, 15 * 60_000)) throw new HttpError(429, 'Demasiados intentos. Espera unos minutos.');
    const key = `s|${email}|${ctx.ip}`;
    const espera = bloqueoRestante(key);
    if (espera) throw new HttpError(429, `Demasiados intentos fallidos. Intenta de nuevo en ${Math.ceil(espera / 60)} minuto(s).`);
    const u = await db.get('SELECT id, email, password_hash FROM superadmins WHERE email = ?', [email]);
    const ok = await verifyPassword(pw, u ? u.password_hash : HASH_RELLENO);
    if (!u || !ok) {
      registrarFallo(key);
      throw new HttpError(401, 'Correo o contraseña incorrectos.');
    }
    limpiarFallos(key);
    ctx.setCookies.push(cookieSesionSuper(u));
    return { email: u.email };
  });

  r.add('POST', '/api/super/logout', { root: true }, async (ctx) => {
    ctx.setCookies.push(cookie('sid_super', '', { expire: true }));
    return { ok: true };
  });

  // Negocio de ejemplo, por pasos (solo en el sitio de pruebas: DATOS_DE_EJEMPLO = "true").
  r.add('POST', '/api/super/ejemplo', S, async ({ body }) => {
    if (!env.datosEjemplo) throw new HttpError(403, 'Los datos de ejemplo solo están disponibles en el sitio de pruebas.');
    return pasoEjemplo({ paso: body.paso, negocio_id: body.negocio_id, i: body.i });
  });

  r.add('POST', '/api/super/password', S, async ({ usuario, body, setCookies }) => {
    if (!(await verifyPassword(String(body.actual || ''), usuario.password_hash))) throw new HttpError(400, 'La contraseña actual no es correcta.');
    const hash = await hashPassword(validarPassword(body.nueva));
    await db.run('UPDATE superadmins SET password_hash = ? WHERE id = ?', [hash, usuario.id]);
    setCookies.push(cookieSesionSuper({ id: usuario.id, password_hash: hash }));
    return { ok: true };
  });

  r.add('GET', '/api/super/me', S, async ({ usuario }) => ({ email: usuario.email, base_path: env.basePath, ejemplo: env.datosEjemplo }));

  r.add('GET', '/api/super/negocios', S, async () => {
    const negocios = await db.all(
      `SELECT n.id, n.slug, n.nombre, n.activo, n.creado_en,
              (SELECT COUNT(*) FROM presupuestos p WHERE p.negocio_id = n.id) AS presupuestos,
              (SELECT COUNT(*) FROM examenes e WHERE e.negocio_id = n.id) AS examenes
         FROM negocios n ORDER BY n.creado_en DESC`,
    );
    const admins = await db.all('SELECT negocio_id, email, activo FROM usuarios_admin ORDER BY email');
    return {
      base_path: env.basePath,
      negocios: negocios.map((n) => ({
        ...n, presupuestos: Number(n.presupuestos), examenes: Number(n.examenes),
        admins: admins.filter((a) => a.negocio_id === n.id).map((a) => ({ email: a.email, activo: !!a.activo })),
      })),
    };
  });

  r.add('POST', '/api/super/negocios', S, async ({ body }) => {
    const nombre = str(body.nombre, 80);
    if (!nombre) throw new HttpError(400, 'El nombre del negocio es obligatorio.');
    const slug = str(body.slug, 40).toLowerCase();
    const email = str(body.admin_email, 160).toLowerCase();
    if (!esEmail(email)) throw new HttpError(400, 'El correo del administrador no es válido.');
    validarPassword(body.admin_password);
    const color = body.color && esColor(body.color) ? body.color : undefined;
    return crearNegocio({ nombre, slug, adminEmail: email, adminPassword: body.admin_password, color });
  });

  r.add('PUT', '/api/super/negocios/:id', S, async ({ params, body }) => {
    const n = await db.get('SELECT * FROM negocios WHERE id = ?', [params.id]);
    if (!n) throw new HttpError(404, 'El negocio no existe.');
    const nombre = body.nombre !== undefined ? str(body.nombre, 80) : n.nombre;
    if (!nombre) throw new HttpError(400, 'El nombre es obligatorio.');
    await db.run('UPDATE negocios SET nombre = ?, activo = ? WHERE id = ?', [nombre, body.activo !== undefined ? (body.activo ? 1 : 0) : n.activo, n.id]);
    invalidarNegocios();
    return { ok: true };
  });

  // Crea el administrador o restablece su contraseña.
  r.add('POST', '/api/super/negocios/:id/admin', S, async ({ params, body }) => {
    const n = await db.get('SELECT id FROM negocios WHERE id = ?', [params.id]);
    if (!n) throw new HttpError(404, 'El negocio no existe.');
    const email = str(body.email, 160).toLowerCase();
    if (!esEmail(email)) throw new HttpError(400, 'El correo no es válido.');
    const hash = await hashPassword(validarPassword(body.password));
    const u = await db.get('SELECT id FROM usuarios_admin WHERE negocio_id = ? AND email = ?', [n.id, email]);
    if (u) await db.run('UPDATE usuarios_admin SET password_hash = ?, activo = 1 WHERE id = ?', [hash, u.id]);
    else {
      await db.run(
        'INSERT INTO usuarios_admin (id, negocio_id, email, nombre, password_hash, activo, creado_en) VALUES (?,?,?,?,?,1,?)',
        [uuid(), n.id, email, 'Administrador', hash, nowIso()],
      );
    }
    return { ok: true, creado: !u };
  });

  // ── Tasa BCV (global) ──
  r.add('GET', '/api/super/tasa', S, async () => {
    const g = await tasaGlobal();
    return {
      tasa: g ? { valor: g.valor, fecha_valor: g.fecha_valor, fuente: g.fuente, verificado_en: g.verificado_en, desactualizada: g.desactualizada } : null,
      consulta: estadoConsulta(),
      url: env.bcvUrl,
      desactivada: env.bcvDisabled,
    };
  });

  r.add('POST', '/api/super/tasa/actualizar', S, async () => refrescarTasa({ forzar: true }));

  r.add('POST', '/api/super/tasa/manual', S, async ({ body }) => {
    const n = Number(body.valor);
    if (!Number.isFinite(n) || n <= 0 || n > 1e7) throw new HttpError(400, 'La tasa no es válida.');
    await guardarTasaManualGlobal(Math.round(n * 10000) / 10000);
    return { ok: true };
  });
}
