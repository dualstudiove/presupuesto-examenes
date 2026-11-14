// Administración de Planifica (solo administradores de Dual Studio): clientes, equipo, accesos e importación.
import {
  db,
  esEmail,
  hashPassword,
  HttpError,
  nowIso,
  str,
  uuid,
  validarPassword,
} from "@dualstudio/comun/servidor";
import { RESERVADOS, soloAdmin } from "./sesion.js";
import { decodificar, guardarImagen, TOPE_CLIENTE } from "./almacen.js";
import {
  esClaveObjetivo,
  esIdPublicacion,
  unir,
  validarCambiosObjetivo,
  validarCambiosPublicacion,
} from "./validar.js";
import { tocar } from "./rutas.js";

const A = { auth: soloAdmin };

/** «Laboratorio RH» → laboratorio-rh */
export function slugDe(texto) {
  return String(texto || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}
function validarSlug(slug) {
  if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(slug) || RESERVADOS.has(slug)) {
    throw new HttpError(
      400,
      "La dirección del cliente debe tener entre 2 y 40 letras minúsculas, números o guiones, y no puede ser una palabra reservada.",
    );
  }
  return slug;
}
const handleDe = (v) => {
  const h = str(v, 60).replace(/\s+/g, "");
  return h ? (h.startsWith("@") ? h : `@${h}`) : null;
};

export function registrarAdmin(r) {
  r.add("GET", "/api/admin/resumen", A, async () => {
    const clientes = await db.all(
      `SELECT c.id, c.slug, c.nombre, c.handle, c.activo, c.creado_en,
              (SELECT COUNT(*) FROM publicaciones p WHERE p.cliente_id = c.id) AS publicaciones,
              (SELECT COALESCE(SUM(i.bytes), 0) FROM imagenes i WHERE i.cliente_id = c.id) AS uso_bytes
         FROM clientes c ORDER BY c.activo DESC, c.nombre`,
    );
    const usuarios = await db.all(
      "SELECT id, email, nombre, es_admin, activo, creado_en FROM usuarios ORDER BY es_admin DESC, nombre, email",
    );
    const accesos = await db.all("SELECT usuario_id, cliente_id, rol FROM accesos");
    return {
      tope_bytes: TOPE_CLIENTE,
      clientes: clientes.map((c) => ({
        ...c,
        activo: !!c.activo,
        publicaciones: Number(c.publicaciones),
        uso_bytes: Number(c.uso_bytes),
      })),
      usuarios: usuarios.map((u) => ({
        ...u,
        es_admin: !!u.es_admin,
        activo: !!u.activo,
        accesos: accesos.filter((a) => a.usuario_id === u.id).map((a) => ({
          cliente_id: a.cliente_id,
          rol: a.rol,
        })),
      })),
    };
  });

  // ── Clientes ──
  r.add("POST", "/api/admin/clientes", A, async ({ body }) => {
    const nombre = str(body.nombre, 80);
    if (!nombre) throw new HttpError(400, "Escribe el nombre del cliente.");
    const slug = validarSlug(body.slug ? str(body.slug, 40).toLowerCase() : slugDe(nombre));
    if (await db.get("SELECT 1 FROM clientes WHERE slug = ?", [slug])) {
      throw new HttpError(409, `Ya hay un cliente con la dirección «${slug}».`);
    }
    const id = uuid();
    await db.run(
      "INSERT INTO clientes (id, slug, nombre, handle, activo, cambiado_en, creado_en) VALUES (?,?,?,?,1,?,?)",
      [id, slug, nombre, handleDe(body.handle), Date.now(), nowIso()],
    );
    return { id, slug };
  });

  r.add("PUT", "/api/admin/clientes/:id", A, async ({ params, body }) => {
    const c = await db.get("SELECT * FROM clientes WHERE id = ?", [params.id]);
    if (!c) throw new HttpError(404, "El cliente no existe.");
    const nombre = body.nombre !== undefined ? str(body.nombre, 80) : c.nombre;
    if (!nombre) throw new HttpError(400, "Escribe el nombre del cliente.");
    await db.run("UPDATE clientes SET nombre = ?, handle = ?, activo = ? WHERE id = ?", [
      nombre,
      body.handle !== undefined ? handleDe(body.handle) : c.handle,
      body.activo !== undefined ? (body.activo ? 1 : 0) : c.activo,
      c.id,
    ]);
    await tocar(c.id);
    return { ok: true };
  });

  // Borrar un cliente y TODO lo suyo: hay que escribir su nombre exacto.
  r.add("DELETE", "/api/admin/clientes/:id", A, async ({ params, body }) => {
    const c = await db.get("SELECT id, nombre FROM clientes WHERE id = ?", [params.id]);
    if (!c) throw new HttpError(404, "El cliente no existe.");
    if (String(body.nombre ?? "").trim() !== c.nombre.trim()) {
      throw new HttpError(400, "El nombre escrito no coincide con el del cliente.");
    }
    await db.tx(async (t) => {
      for (const tabla of ["imagenes", "objetivos", "publicaciones", "accesos"]) {
        await t.run(`DELETE FROM ${tabla} WHERE cliente_id = ?`, [c.id]);
      }
      await t.run("DELETE FROM clientes WHERE id = ?", [c.id]);
    });
    return { ok: true };
  });

  // ── Equipo ──
  r.add("POST", "/api/admin/usuarios", A, async ({ body }) => {
    const email = str(body.email, 160).toLowerCase();
    if (!esEmail(email)) throw new HttpError(400, "El correo no es válido.");
    const nombre = str(body.nombre, 80);
    const hash = await hashPassword(validarPassword(body.password));
    if (await db.get("SELECT 1 FROM usuarios WHERE email = ?", [email])) {
      throw new HttpError(409, "Ya hay una persona con ese correo.");
    }
    const id = uuid();
    await db.run(
      "INSERT INTO usuarios (id, email, nombre, password_hash, es_admin, activo, creado_en) VALUES (?,?,?,?,?,1,?)",
      [id, email, nombre, hash, body.es_admin ? 1 : 0, nowIso()],
    );
    return { id };
  });

  r.add("PUT", "/api/admin/usuarios/:id", A, async ({ params, body, usuario }) => {
    const u = await db.get("SELECT * FROM usuarios WHERE id = ?", [params.id]);
    if (!u) throw new HttpError(404, "La persona no existe.");
    const yo = u.id === usuario.id;
    if (yo && (body.activo === false || body.es_admin === false)) {
      throw new HttpError(400, "No puedes quitarte a ti mismo el acceso de administrador.");
    }
    const cambios = [];
    const valores = [];
    if (body.nombre !== undefined) {
      cambios.push("nombre = ?");
      valores.push(str(body.nombre, 80));
    }
    if (body.activo !== undefined) {
      cambios.push("activo = ?");
      valores.push(body.activo ? 1 : 0);
    }
    if (body.es_admin !== undefined) {
      cambios.push("es_admin = ?");
      valores.push(body.es_admin ? 1 : 0);
    }
    if (body.password) {
      // Contraseña nueva: además se cierran todas sus sesiones abiertas.
      cambios.push("password_hash = ?", "sesion_version = COALESCE(sesion_version, 0) + 1");
      valores.push(await hashPassword(validarPassword(body.password)));
    }
    if (body.activo === false) cambios.push("sesion_version = COALESCE(sesion_version, 0) + 1");
    if (cambios.length) {
      await db.run(`UPDATE usuarios SET ${[...new Set(cambios)].join(", ")} WHERE id = ?`, [
        ...valores,
        u.id,
      ]);
    }
    return { ok: true };
  });

  // { usuario_id, cliente_id, rol: 'editor' | 'lector' | null }  (null = quitar el acceso)
  r.add("PUT", "/api/admin/accesos", A, async ({ body }) => {
    const u = await db.get("SELECT id FROM usuarios WHERE id = ?", [body.usuario_id]);
    const c = await db.get("SELECT id FROM clientes WHERE id = ?", [body.cliente_id]);
    if (!u || !c) throw new HttpError(404, "La persona o el cliente no existen.");
    if (body.rol === null || body.rol === "") {
      await db.run("DELETE FROM accesos WHERE usuario_id = ? AND cliente_id = ?", [u.id, c.id]);
    } else {
      if (!["editor", "lector"].includes(body.rol)) {
        throw new HttpError(400, "El papel debe ser editor o solo lectura.");
      }
      await db.run(
        "INSERT INTO accesos (usuario_id, cliente_id, rol) VALUES (?,?,?) ON CONFLICT (usuario_id, cliente_id) DO UPDATE SET rol = excluded.rol",
        [u.id, c.id, body.rol],
      );
    }
    return { ok: true };
  });

  // ── Importar una Parrilla de Contenido (exportación del artefacto) en un cliente ──
  // { cliente_id, datos: { formato: 'parrilla-v1', cuenta: { handle }, posts: [...], goals: [...], imagenes: [{ id, tipo, datos }] } }
  r.add("POST", "/api/admin/importar", { ...A, maxBody: 8_000_000 }, async ({ body, usuario }) => {
    const c = await db.get("SELECT id, handle FROM clientes WHERE id = ?", [body.cliente_id]);
    if (!c) throw new HttpError(404, "El cliente no existe.");
    const d = body.datos || {};
    if (d.formato !== "parrilla-v1") {
      throw new HttpError(400, "El archivo no es una exportación de la Parrilla de Contenido.");
    }
    const posts = Array.isArray(d.posts) ? d.posts.slice(0, 2000) : [];
    const goals = Array.isArray(d.goals) ? d.goals.slice(0, 500) : [];
    const imagenes = Array.isArray(d.imagenes) ? d.imagenes.slice(0, 300) : [];

    // Imágenes primero: cada una recibe un id nuevo y las publicaciones apuntan a él.
    const nuevoId = {};
    for (const img of imagenes) {
      const { tipo, bytes } = decodificar(img.datos, img.tipo);
      nuevoId[img.id] =
        (await guardarImagen({ clienteId: c.id, tipo, bytes, usuarioId: usuario.id })).id;
    }
    const ahora = Date.now();
    let nPosts = 0;
    for (const p of posts) {
      const datos = validarCambiosPublicacion(p);
      if (Array.isArray(datos.refImgs)) {
        datos.refImgs = datos.refImgs.filter((x) => nuevoId[x.id]).map((x) => ({
          ...x,
          id: nuevoId[x.id],
        }));
      }
      let id = esIdPublicacion(p.id) ? p.id : `p${uuid().replace(/-/g, "").slice(0, 16)}`;
      if (await db.get("SELECT 1 FROM publicaciones WHERE id = ?", [id])) {
        id = `p${uuid().replace(/-/g, "").slice(0, 16)}`;
      }
      const creado = Number(p.createdAt) || ahora;
      await db.run(
        "INSERT INTO publicaciones (id, cliente_id, datos, creado_en, creado_por, actualizado_en, actualizado_por) VALUES (?,?,?,?,?,?,?)",
        [
          id,
          c.id,
          JSON.stringify(unir({}, datos, "publicacion")),
          creado,
          usuario.id,
          Number(p.updatedAt) || creado,
          usuario.id,
        ],
      );
      nPosts++;
    }
    let nGoals = 0;
    for (const g of goals) {
      if (!esClaveObjetivo(g.id)) continue;
      const datos = unir({}, validarCambiosObjetivo(g), "objetivo");
      const creado = Number(g.createdAt) || ahora;
      await db.run(
        `INSERT INTO objetivos (cliente_id, clave, datos, creado_en, creado_por, actualizado_en, actualizado_por) VALUES (?,?,?,?,?,?,?)
         ON CONFLICT (cliente_id, clave) DO UPDATE SET datos = excluded.datos, actualizado_en = excluded.actualizado_en, actualizado_por = excluded.actualizado_por`,
        [
          c.id,
          g.id,
          JSON.stringify(datos),
          creado,
          usuario.id,
          Number(g.updatedAt) || creado,
          usuario.id,
        ],
      );
      nGoals++;
    }
    const handle = d.cuenta && typeof d.cuenta.handle === "string" ? str(d.cuenta.handle, 60) : "";
    if (handle && !c.handle) {
      await db.run("UPDATE clientes SET handle = ? WHERE id = ?", [handle, c.id]);
    }
    await tocar(c.id);
    return { publicaciones: nPosts, objetivos: nGoals, imagenes: Object.keys(nuevoId).length };
  });
}
