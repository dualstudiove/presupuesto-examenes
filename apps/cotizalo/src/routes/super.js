// Panel de la plataforma (dominio raíz): crear negocios, administradores y gestionar la tasa.
import { env } from "../env.js";
import {
  aplicarSecretosDeRecuperacion,
  cerrarOtrasSesiones,
  comprobarPassword,
  credenciales,
  db,
  frenoDeIntentos,
  hashPassword,
  secretosDeRecuperacionActivos,
  tipoDeSesion,
  verifyPassword,
} from "@dualstudio/comun/servidor";
import { crearNegocio, invalidarNegocios } from "../negocio.js";
import { pasoEjemplo } from "../ejemplo.js";
import { estadoConsulta, guardarTasaManualGlobal, refrescarTasa, tasaGlobal } from "../bcv.js";
import { esColor, esEmail, HttpError, nowIso, str, uuid, validarPassword } from "../util.js";

/**
 * Sesión del superadministrador (cuentas compartidas de @dualstudio/comun): cookie sid_super, vale en toda la app
 * (BASE_PATH) durante 8 horas. «Cerrar sesión en los demás dispositivos» sube su versión de sesión.
 */
export const SESION_SUPER = tipoDeSesion({ cookie: "sid_super", tipo: "s", horas: 8 });
export const cookieSesionSuper = (u) => SESION_SUPER.emitir(u);

/** ¿Las cookies traen una sesión válida de superadministrador? (no lanza error) */
export async function superDe(cookies) {
  try {
    return await sesionSuper({ cookies });
  } catch {
    return null;
  }
}

// ── Recuperar el acceso sin terminal ──
// Con los secretos SUPER_EMAIL y SUPER_PASSWORD (Cloudflare → Worker → Configuración → Variables y secretos),
// ese superadministrador se crea, o recibe esa contraseña si ya existía. Se aplican una sola vez (ver cuentas.js).
export function asegurarSuperDesdeSecretos() {
  return aplicarSecretosDeRecuperacion({
    email: env.superEmail,
    password: env.superPassword,
    clave: "super_secretos_aplicados",
    buscar: (email) => db.get("SELECT id, password_hash FROM superadmins WHERE email = ?", [email]),
    actualizar: (id, hash) =>
      db.run("UPDATE superadmins SET password_hash = ? WHERE id = ?", [hash, id]),
    crear: (email, hash) =>
      db.run(
        "INSERT OR IGNORE INTO superadmins (id, email, password_hash, creado_en) VALUES (?,?,?,?)",
        [uuid(), email, hash, nowIso()],
      ),
  });
}

export async function sesionSuper(ctx) {
  const tok = SESION_SUPER.leer(ctx.cookies);
  if (!tok) throw new HttpError(401, "Inicia sesión para continuar.");
  const u = await db.get(
    "SELECT id, email, password_hash, sesion_version FROM superadmins WHERE id = ?",
    [tok.uid],
  );
  if (!SESION_SUPER.vigente(tok, u)) {
    throw new HttpError(401, "Tu sesión expiró. Inicia sesión de nuevo.");
  }
  return u;
}

export function registrarSuper(r) {
  const S = { root: true, auth: sesionSuper };

  r.add("POST", "/api/super/login", { root: true }, async (ctx) => {
    const { email, password } = credenciales(ctx.body);
    const freno = frenoDeIntentos(`s|${email}|${ctx.ip}`, ctx.ip, {
      maxPorIp: 20,
      prefijo: "slogin",
    });
    const u = await db.get(
      "SELECT id, email, password_hash, sesion_version FROM superadmins WHERE email = ?",
      [email],
    );
    if (!(await comprobarPassword(password, u?.password_hash))) {
      freno.fallo();
      throw new HttpError(401, "Correo o contraseña incorrectos.");
    }
    freno.exito();
    ctx.setCookies.push(cookieSesionSuper(u));
    return { email: u.email };
  });

  r.add("POST", "/api/super/logout", { root: true }, async (ctx) => {
    ctx.setCookies.push(SESION_SUPER.cerrar());
    return { ok: true };
  });

  // Negocio de ejemplo, por pasos (solo en el sitio de pruebas: DATOS_DE_EJEMPLO = "true").
  r.add("POST", "/api/super/ejemplo", S, async ({ body }) => {
    if (!env.datosEjemplo) {
      throw new HttpError(
        403,
        "Los datos de ejemplo solo están disponibles en el sitio de pruebas.",
      );
    }
    return pasoEjemplo({ paso: body.paso, negocio_id: body.negocio_id, i: body.i });
  });

  r.add("POST", "/api/super/password", S, async ({ usuario, body, setCookies }) => {
    if (!(await verifyPassword(String(body.actual || ""), usuario.password_hash))) {
      throw new HttpError(400, "La contraseña actual no es correcta.");
    }
    const hash = await hashPassword(validarPassword(body.nueva));
    await db.run("UPDATE superadmins SET password_hash = ? WHERE id = ?", [hash, usuario.id]);
    setCookies.push(cookieSesionSuper({ ...usuario, password_hash: hash }));
    return { ok: true };
  });

  // Cierra la sesión en todos los demás navegadores (p. ej. si alguien pudo copiar la cookie). Esta sigue abierta.
  r.add("POST", "/api/super/sesiones/cerrar", S, async ({ usuario, setCookies }) => {
    const sv = await cerrarOtrasSesiones("superadmins", usuario);
    setCookies.push(cookieSesionSuper({ ...usuario, sesion_version: sv }));
    return { ok: true };
  });

  r.add("GET", "/api/super/me", S, async ({ usuario }) => ({
    email: usuario.email,
    base_path: env.basePath,
    ejemplo: env.datosEjemplo,
    // Los secretos de recuperación siguen guardados en Cloudflare: conviene borrarlos.
    secretos_recuperacion: secretosDeRecuperacionActivos(),
  }));

  r.add("GET", "/api/super/negocios", S, async () => {
    const negocios = await db.all(
      `SELECT n.id, n.slug, n.nombre, n.activo, n.creado_en,
              (SELECT COUNT(*) FROM presupuestos p WHERE p.negocio_id = n.id) AS presupuestos,
              (SELECT COUNT(*) FROM examenes e WHERE e.negocio_id = n.id) AS examenes
         FROM negocios n ORDER BY n.creado_en DESC`,
    );
    const admins = await db.all(
      "SELECT negocio_id, email, activo FROM usuarios_admin ORDER BY email",
    );
    return {
      base_path: env.basePath,
      negocios: negocios.map((n) => ({
        ...n,
        presupuestos: Number(n.presupuestos),
        examenes: Number(n.examenes),
        admins: admins.filter((a) => a.negocio_id === n.id).map((a) => ({
          email: a.email,
          activo: !!a.activo,
        })),
      })),
    };
  });

  r.add("POST", "/api/super/negocios", S, async ({ body }) => {
    const nombre = str(body.nombre, 80);
    if (!nombre) throw new HttpError(400, "El nombre del negocio es obligatorio.");
    const slug = str(body.slug, 40).toLowerCase();
    const email = str(body.admin_email, 160).toLowerCase();
    if (!esEmail(email)) throw new HttpError(400, "El correo del administrador no es válido.");
    validarPassword(body.admin_password);
    const color = body.color && esColor(body.color) ? body.color : undefined;
    return crearNegocio({
      nombre,
      slug,
      adminEmail: email,
      adminPassword: body.admin_password,
      color,
    });
  });

  r.add("PUT", "/api/super/negocios/:id", S, async ({ params, body }) => {
    const n = await db.get("SELECT * FROM negocios WHERE id = ?", [params.id]);
    if (!n) throw new HttpError(404, "El negocio no existe.");
    const nombre = body.nombre !== undefined ? str(body.nombre, 80) : n.nombre;
    if (!nombre) throw new HttpError(400, "El nombre es obligatorio.");
    await db.run("UPDATE negocios SET nombre = ?, activo = ? WHERE id = ?", [
      nombre,
      body.activo !== undefined ? (body.activo ? 1 : 0) : n.activo,
      n.id,
    ]);
    invalidarNegocios();
    return { ok: true };
  });

  // Eliminar un negocio y TODOS sus datos. Hay que escribir su nombre exacto y la contraseña del superadministrador.
  r.add("DELETE", "/api/super/negocios/:id", S, async ({ params, body, usuario, ip }) => {
    const n = await db.get("SELECT id, slug, nombre FROM negocios WHERE id = ?", [params.id]);
    if (!n) throw new HttpError(404, "El negocio no existe.");
    if (String(body.nombre ?? "").trim() !== n.nombre.trim()) {
      throw new HttpError(400, "El nombre escrito no coincide con el del negocio.");
    }
    const freno = frenoDeIntentos(`del|${usuario.id}|${ip}`, ip, { prefijo: "del" });
    if (!(await verifyPassword(String(body.password || "").slice(0, 200), usuario.password_hash))) {
      freno.fallo();
      throw new HttpError(400, "La contraseña no es correcta.");
    }
    freno.exito();
    // Todo en un solo lote (o se borra todo o nada), de los datos que dependen de otros hacia el negocio.
    await db.tx(async (t) => {
      await t.run("DELETE FROM presupuesto_examenes WHERE negocio_id = ?", [n.id]);
      await t.run("DELETE FROM presupuesto_items WHERE negocio_id = ?", [n.id]);
      await t.run("DELETE FROM presupuestos WHERE negocio_id = ?", [n.id]);
      await t.run("DELETE FROM visitas WHERE negocio_id = ?", [n.id]);
      await t.run(
        "DELETE FROM perfil_examenes WHERE perfil_id IN (SELECT id FROM perfiles WHERE negocio_id = ?)",
        [n.id],
      );
      await t.run(
        "DELETE FROM perfil_examenes WHERE examen_id IN (SELECT id FROM examenes WHERE negocio_id = ?)",
        [n.id],
      );
      await t.run("DELETE FROM perfiles WHERE negocio_id = ?", [n.id]);
      await t.run("DELETE FROM examenes WHERE negocio_id = ?", [n.id]);
      await t.run("DELETE FROM categorias WHERE negocio_id = ?", [n.id]);
      await t.run("DELETE FROM origenes WHERE negocio_id = ?", [n.id]);
      await t.run("DELETE FROM usuarios_admin WHERE negocio_id = ?", [n.id]);
      await t.run("DELETE FROM configuracion_negocio WHERE negocio_id = ?", [n.id]);
      await t.run("DELETE FROM negocios WHERE id = ?", [n.id]);
    });
    invalidarNegocios();
    console.log(`[super] Negocio eliminado: ${n.nombre} (${n.slug}) por ${usuario.email}`);
    return { ok: true, slug: n.slug };
  });

  // Crea el administrador o restablece su contraseña.
  r.add("POST", "/api/super/negocios/:id/admin", S, async ({ params, body }) => {
    const n = await db.get("SELECT id FROM negocios WHERE id = ?", [params.id]);
    if (!n) throw new HttpError(404, "El negocio no existe.");
    const email = str(body.email, 160).toLowerCase();
    if (!esEmail(email)) throw new HttpError(400, "El correo no es válido.");
    const hash = await hashPassword(validarPassword(body.password));
    const u = await db.get("SELECT id FROM usuarios_admin WHERE negocio_id = ? AND email = ?", [
      n.id,
      email,
    ]);
    if (u) {
      await db.run("UPDATE usuarios_admin SET password_hash = ?, activo = 1 WHERE id = ?", [
        hash,
        u.id,
      ]);
    } else {
      await db.run(
        "INSERT INTO usuarios_admin (id, negocio_id, email, nombre, password_hash, activo, creado_en) VALUES (?,?,?,?,?,1,?)",
        [uuid(), n.id, email, "Administrador", hash, nowIso()],
      );
    }
    return { ok: true, creado: !u };
  });

  // ── Tasa BCV (global) ──
  r.add("GET", "/api/super/tasa", S, async () => {
    const g = await tasaGlobal();
    return {
      tasa: g
        ? {
          valor: g.valor,
          fecha_valor: g.fecha_valor,
          fuente: g.fuente,
          verificado_en: g.verificado_en,
          desactualizada: g.desactualizada,
        }
        : null,
      consulta: estadoConsulta(),
      url: env.bcvUrl,
      desactivada: env.bcvDisabled,
    };
  });

  r.add("POST", "/api/super/tasa/actualizar", S, async () => refrescarTasa({ forzar: true }));

  r.add("POST", "/api/super/tasa/manual", S, async ({ body }) => {
    const n = Number(body.valor);
    if (!Number.isFinite(n) || n <= 0 || n > 1e7) throw new HttpError(400, "La tasa no es válida.");
    await guardarTasaManualGlobal(Math.round(n * 10000) / 10000);
    return { ok: true };
  });
}
