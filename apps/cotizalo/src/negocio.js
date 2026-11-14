// Lógica de negocio compartida: negocios (tenants), configuración, tasa y presupuestos.
import { db, hashPassword } from "@dualstudio/comun/servidor";
import { tasaGlobal } from "./bcv.js";
import { hoy, HttpError, nowIso, parteFecha, placeholders, sumarDias, uuid } from "./util.js";

// Primeros segmentos de ruta que usa la plataforma: no pueden ser la dirección de un negocio.
export const RESERVADOS = new Set([
  "www",
  "api",
  "admin",
  "super",
  "app",
  "mail",
  "static",
  "assets",
  "cdn",
  "localhost",
  "ftp",
  "smtp",
  "css",
  "js",
  "img",
  "healthz",
  "favicon.ico",
  "robots.txt",
]);
export const CATEGORIAS_BASE = [
  "Hematología",
  "Coagulación",
  "Química sanguínea",
  "Orina",
  "Heces",
  "Hormonas",
  "Inmunología",
];
export const ORIGENES_BASE = [
  "Instagram",
  "Recomendación de un conocido",
  "Referido por mi médico",
  "Búsqueda en Google",
  "Otro",
];

/** La opción «Otro» (u «Otros», «Otra»…) de «¿Cómo se enteró?» pide que el paciente escriba dónde. */
export const esOrigenOtro = (nombre) =>
  /^otr[oa]s?$/.test(
    String(nombre ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase(),
  );

// ── Negocios ──
const cacheNegocios = new Map();
export async function negocioPorSlug(slug) {
  const c = cacheNegocios.get(slug);
  if (c && Date.now() - c.at < 20_000) return c.row;
  const row =
    (await db.get("SELECT id, slug, nombre, activo FROM negocios WHERE slug = ?", [slug])) || null;
  cacheNegocios.set(slug, { at: Date.now(), row });
  return row;
}
export const invalidarNegocios = () => cacheNegocios.clear();

export const getConfig = (negocioId) =>
  db.get("SELECT * FROM configuracion_negocio WHERE negocio_id = ?", [negocioId]);

export function validarSlug(slug) {
  if (
    typeof slug !== "string" || slug.length > 28 || !(/^[a-z0-9][a-z0-9-]*$/.test(slug)) ||
    RESERVADOS.has(slug)
  ) {
    throw new HttpError(
      400,
      "La dirección del negocio debe tener entre 2 y 30 letras minúsculas, números o guiones, y no puede ser una palabra reservada.",
    );
  }
  return slug;
}

export async function crearNegocio({ nombre, slug, adminEmail, adminPassword, color }) {
  validarSlug(slug);
  const hash = await hashPassword(adminPassword);
  const id = uuid();
  const ahora = nowIso();
  const prefijo = (slug.replace(/[^a-z0-9]/g, "").slice(0, 3) || "PE").toUpperCase();
  await db.tx(async (t) => {
    if (await t.get("SELECT id FROM negocios WHERE slug = ?", [slug])) {
      throw new HttpError(409, "Esa dirección ya está en uso.");
    }
    await t.run("INSERT INTO negocios (id, slug, nombre, activo, creado_en) VALUES (?,?,?,1,?)", [
      id,
      slug,
      nombre,
      ahora,
    ]);
    await t.run(
      `INSERT INTO configuracion_negocio (negocio_id, nombre_publico, color_principal, prefijo_codigo, dias_vigencia, precios_actualizados_en)
       VALUES (?,?,?,?,7,?)`,
      [id, nombre, color || "#0e7c86", prefijo, ahora],
    );
    for (const [i, c] of CATEGORIAS_BASE.entries()) {
      await t.run(
        "INSERT INTO categorias (id, negocio_id, nombre, orden, activo) VALUES (?,?,?,?,1)",
        [uuid(), id, c, i],
      );
    }
    for (const [i, o] of ORIGENES_BASE.entries()) {
      await t.run(
        "INSERT INTO origenes (id, negocio_id, nombre, orden, activo) VALUES (?,?,?,?,1)",
        [uuid(), id, o, i],
      );
    }
    await t.run(
      "INSERT INTO usuarios_admin (id, negocio_id, email, nombre, password_hash, activo, creado_en) VALUES (?,?,?,?,?,1,?)",
      [uuid(), id, adminEmail.toLowerCase(), "Administrador", hash, ahora],
    );
  });
  invalidarNegocios();
  return { id, slug };
}

export const tocarPrecios = (t, negocioId) =>
  t.run("UPDATE configuracion_negocio SET precios_actualizados_en = ? WHERE negocio_id = ?", [
    nowIso(),
    negocioId,
  ]);

// ── Tasa BCV aplicable a un negocio ──
export async function resolverTasa(cfg) {
  if (cfg.usar_tasa_manual && cfg.tasa_manual > 0) {
    return {
      valor: cfg.tasa_manual,
      fecha_valor: hoy(),
      fuente: "manual",
      manual: true,
      desactualizada: false,
    };
  }
  const g = await tasaGlobal();
  if (g) return g;
  if (cfg.tasa_manual > 0) {
    return {
      valor: cfg.tasa_manual,
      fecha_valor: hoy(),
      fuente: "manual",
      manual: true,
      desactualizada: false,
    };
  }
  return null;
}

// ── Presupuestos ──
/**
 * Valida y registra un presupuesto. Reglas:
 *  - cada examen aparece UNA sola vez (suelto o dentro de un perfil);
 *  - solo exámenes/perfiles activos del negocio;
 *  - guarda únicamente datos para estadísticas (nunca datos del paciente).
 */
export async function crearPresupuesto(negocio, input, opts = {}) {
  // D1 no tiene transacciones interactivas: dos presupuestos simultáneos pueden calcular la misma
  // secuencia. La restricción UNIQUE (negocio_id, secuencia) lo detecta y aquí se reintenta.
  for (let intento = 0;; intento++) {
    try {
      return await crearPresupuestoUnaVez(negocio, input, opts);
    } catch (e) {
      const choque = /UNIQUE constraint failed: presupuestos\./i.test(String(e?.message || e));
      if (!choque || intento >= 9) throw e;
      await new Promise((r) => setTimeout(r, Math.random() * 25 * (intento + 1))); // espera aleatoria para desempatar
    }
  }
}

async function crearPresupuestoUnaVez(negocio, input, opts = {}) {
  const items = Array.isArray(input?.items) ? input.items : [];
  if (!items.length) throw new HttpError(400, "Agrega al menos un examen o un perfil.");
  if (items.length > 80) throw new HttpError(400, "El presupuesto tiene demasiados ítems.");
  const exIds = [];
  const pfIds = [];
  const cantidades = new Map(); // examen → cantidad pedida (1 si no se indica)
  for (const it of items) {
    if (!it || typeof it.id !== "string" || it.id.length > 64) {
      throw new HttpError(400, "Ítem inválido.");
    }
    const cant = it.cantidad === undefined ? 1 : Number(it.cantidad);
    if (!Number.isInteger(cant) || cant < 1 || cant > 99 || (it.tipo !== "examen" && cant !== 1)) {
      throw new HttpError(400, "Cantidad inválida.");
    }
    if (it.tipo === "examen") {
      exIds.push(it.id);
      cantidades.set(it.id, cant);
    } else if (it.tipo === "perfil") pfIds.push(it.id);
    else throw new HttpError(400, "Ítem inválido.");
  }
  if (new Set(exIds).size !== exIds.length || new Set(pfIds).size !== pfIds.length) {
    throw new HttpError(409, "Hay ítems repetidos en el presupuesto.");
  }

  const cfg = await getConfig(negocio.id);
  const tasa = await resolverTasa(cfg);
  const ahora = opts.fecha ? new Date(opts.fecha) : new Date();
  const { dia, hora, dow } = parteFecha(ahora);
  const dispositivo = input.dispositivo === "escritorio" ? "escritorio" : "movil";

  return db.tx(async (t) => {
    const examenes = exIds.length
      ? await t.all(
        `SELECT e.id, e.nombre, e.precio_cent, e.categoria_id, c.nombre AS categoria, c.max_por_examen
             FROM examenes e JOIN categorias c ON c.id = e.categoria_id
            WHERE e.negocio_id = ? AND e.activo = 1 AND c.activo = 1 AND e.id IN (${
          placeholders(exIds)
        })`,
        [negocio.id, ...exIds],
      )
      : [];
    const perfiles = pfIds.length
      ? await t.all(
        `SELECT id, nombre, precio_cent FROM perfiles WHERE negocio_id = ? AND activo = 1 AND id IN (${
          placeholders(pfIds)
        })`,
        [negocio.id, ...pfIds],
      )
      : [];
    if (examenes.length !== exIds.length || perfiles.length !== pfIds.length) {
      throw new HttpError(
        409,
        "Algún examen o perfil ya no está disponible. Actualiza la página e inténtalo de nuevo.",
      );
    }
    const miembros = pfIds.length
      ? await t.all(
        `SELECT pe.perfil_id, e.id, e.nombre, c.nombre AS categoria
             FROM perfil_examenes pe
             JOIN examenes e ON e.id = pe.examen_id
             JOIN categorias c ON c.id = e.categoria_id
            WHERE pe.perfil_id IN (${placeholders(pfIds)})
            ORDER BY e.nombre`,
        pfIds,
      )
      : [];

    // Regla anti-duplicados (también se valida en el servidor, no solo en la pantalla).
    const visto = new Map();
    const registrar = (id, nombre, donde) => {
      if (visto.has(id)) {
        throw new HttpError(
          409,
          `«${nombre}» está repetido: ya está incluido en ${visto.get(id)}.`,
        );
      }
      visto.set(id, donde);
    };
    for (const p of perfiles) {
      for (const m of miembros.filter((x) => x.perfil_id === p.id)) {
        registrar(m.id, m.nombre, `«${p.nombre}»`);
      }
    }
    for (const e of examenes) registrar(e.id, e.nombre, "el presupuesto");

    // ¿Cuántas veces se puede pedir el mismo examen? Lo decide su categoría (por defecto, una sola vez).
    for (const e of examenes) {
      const max = Number(e.max_por_examen) > 1 ? Number(e.max_por_examen) : 1;
      const cant = cantidades.get(e.id);
      if (cant > max) {
        throw new HttpError(
          409,
          max === 1
            ? `«${e.nombre}» solo se puede pedir una vez.`
            : `«${e.nombre}» se puede pedir hasta ${max} veces.`,
        );
      }
    }

    const exMap = new Map(examenes.map((e) => [e.id, e]));
    const pfMap = new Map(perfiles.map((p) => [p.id, p]));
    const lineas = items.map((it) => {
      if (it.tipo === "examen") {
        const e = exMap.get(it.id);
        const cantidad = cantidades.get(e.id);
        return {
          tipo: "examen",
          id: e.id,
          nombre: e.nombre,
          categoria: e.categoria,
          cantidad,
          precio_unit_cent: e.precio_cent,
          precio_cent: e.precio_cent * cantidad,
          incluye: [],
        };
      }
      const p = pfMap.get(it.id);
      return {
        tipo: "perfil",
        id: p.id,
        nombre: p.nombre,
        categoria: null,
        cantidad: 1,
        precio_unit_cent: p.precio_cent,
        precio_cent: p.precio_cent,
        incluye: miembros.filter((m) => m.perfil_id === p.id).map((m) => m.nombre),
      };
    });
    const totalRef = lineas.reduce((s, l) => s + l.precio_cent, 0);
    const totalBs = tasa ? Math.round(totalRef * tasa.valor) : 0;

    let origen = null;
    if (typeof input.origen_id === "string" && input.origen_id) {
      origen = (await t.get(
        "SELECT id, nombre FROM origenes WHERE id = ? AND negocio_id = ? AND activo = 1",
        [input.origen_id, negocio.id],
      )) || null;
    }
    // Solo se guarda lo que escribió si eligió «Otro»
    const origenDetalle = origen && esOrigenOtro(origen.nombre)
      ? (String(input.origen_detalle ?? "").replace(/\s+/g, " ").trim().slice(0, 80) || null)
      : null;

    // secuencia_base: el último número usado antes de borrar datos antiguos, para que los códigos nunca se repitan.
    const ultima = Number(
      (await t.get(
        "SELECT COALESCE(MAX(secuencia), 0) AS n FROM presupuestos WHERE negocio_id = ?",
        [negocio.id],
      )).n,
    );
    const sec = Math.max(ultima, Number(cfg.secuencia_base) || 0) + 1;
    const codigo = `${cfg.prefijo_codigo}-${String(sec).padStart(6, "0")}`;
    const pid = uuid();
    const creado = ahora.toISOString();

    await t.run(
      `INSERT INTO presupuestos (id, negocio_id, secuencia, codigo, creado_en, dia, hora, dow, total_ref_cent, tasa_usada, total_bs_cent, origen_id, origen_nombre, origen_detalle, dispositivo, num_items)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        pid,
        negocio.id,
        sec,
        codigo,
        creado,
        dia,
        hora,
        dow,
        totalRef,
        tasa ? tasa.valor : 0,
        totalBs,
        origen?.id ?? null,
        origen?.nombre ?? null,
        origenDetalle,
        dispositivo,
        lineas.length,
      ],
    );
    for (const l of lineas) {
      await t.run(
        "INSERT INTO presupuesto_items (id, presupuesto_id, negocio_id, dia, tipo, ref_id, nombre, precio_cent, cantidad) VALUES (?,?,?,?,?,?,?,?,?)",
        [uuid(), pid, negocio.id, dia, l.tipo, l.id, l.nombre, l.precio_cent, l.cantidad],
      );
      // Para las estadísticas, cada unidad cuenta: «Biopsia ×3» son tres exámenes pedidos.
      const filas = l.tipo === "examen"
        ? Array.from(
          { length: l.cantidad },
          () => ({ id: l.id, nombre: l.nombre, categoria: l.categoria, perfil: null }),
        )
        : miembros.filter((m) => m.perfil_id === l.id).map((m) => ({
          id: m.id,
          nombre: m.nombre,
          categoria: m.categoria,
          perfil: l.nombre,
        }));
      for (const f of filas) {
        await t.run(
          "INSERT INTO presupuesto_examenes (id, presupuesto_id, negocio_id, dia, examen_id, examen_nombre, categoria_nombre, perfil_nombre) VALUES (?,?,?,?,?,?,?,?)",
          [uuid(), pid, negocio.id, dia, f.id, f.nombre, f.categoria, f.perfil],
        );
      }
    }

    return {
      codigo,
      creado_en: creado,
      dia,
      dias_vigencia: cfg.dias_vigencia,
      vigencia_hasta: sumarDias(dia, cfg.dias_vigencia),
      precios_actualizados_en: cfg.precios_actualizados_en,
      items: lineas,
      total_ref_cent: totalRef,
      tasa: tasa
        ? {
          valor: tasa.valor,
          fecha_valor: tasa.fecha_valor,
          fuente: tasa.fuente,
          manual: tasa.manual,
          desactualizada: tasa.desactualizada,
        }
        : null,
      total_bs_cent: tasa ? totalBs : null,
      negocio: {
        nombre: cfg.nombre_publico,
        rif: cfg.rif || null,
        telefono: cfg.telefono,
        direccion: cfg.direccion,
        horario: cfg.horario,
        pie: cfg.pie_presupuesto,
      },
    };
  });
}
