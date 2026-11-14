// Rutas públicas (pacientes). Solo lectura del catálogo + generación de presupuestos.
import { cuotaDiaria, db, limite } from "@dualstudio/comun/servidor";
import { refrescarSiHaceFalta, tasaGlobal } from "../bcv.js";
import { crearPresupuesto, esOrigenOtro, getConfig, resolverTasa } from "../negocio.js";
import { HttpError, nowIso, parteFecha, uuid } from "../util.js";

// Topes diarios por negocio, guardados en la base (valen para todas las instancias del Worker). Frenan un abuso
// de estas rutas sin sesión antes de que agote la cuota gratuita de la cuenta de Cloudflare, que es de todas las apps.
export const TOPE_VISITAS_DIA = 5000;
export const TOPE_PRESUPUESTOS_DIA = 1000;

export function registrarPublicas(r) {
  r.add("GET", "/api/publico/config", { tenant: true }, async ({ negocio }) => {
    const cfg = await getConfig(negocio.id);
    refrescarSiHaceFalta(await tasaGlobal());
    const tasa = await resolverTasa(cfg);
    const origenes = (await db.all(
      "SELECT id, nombre FROM origenes WHERE negocio_id = ? AND activo = 1 ORDER BY orden, nombre",
      [negocio.id],
    ))
      .map((o) => ({ ...o, pide_detalle: esOrigenOtro(o.nombre) }));
    return {
      negocio: {
        slug: negocio.slug,
        nombre: cfg.nombre_publico,
        rif: cfg.rif || null,
        logo: cfg.logo,
        color: cfg.color_principal,
        telefono: cfg.telefono,
        direccion: cfg.direccion,
        horario: cfg.horario,
        pie: cfg.pie_presupuesto,
        dias_vigencia: cfg.dias_vigencia,
      },
      origenes,
      tasa: tasa
        ? {
          valor: tasa.valor,
          fecha_valor: tasa.fecha_valor,
          fuente: tasa.fuente,
          manual: tasa.manual,
          desactualizada: tasa.desactualizada,
        }
        : null,
      precios_actualizados_en: cfg.precios_actualizados_en,
    };
  });

  r.add("GET", "/api/publico/catalogo", { tenant: true }, async ({ negocio }) => {
    const categorias = await db.all(
      "SELECT id, nombre, max_por_examen FROM categorias WHERE negocio_id = ? AND activo = 1 ORDER BY orden, nombre",
      [negocio.id],
    );
    const examenes = await db.all(
      `SELECT e.id, e.nombre, e.categoria_id, e.precio_cent, e.descripcion, e.indicaciones
         FROM examenes e JOIN categorias c ON c.id = e.categoria_id
        WHERE e.negocio_id = ? AND e.activo = 1 AND c.activo = 1 ORDER BY e.nombre`,
      [negocio.id],
    );
    const perfiles = await db.all(
      "SELECT id, nombre, descripcion, precio_cent FROM perfiles WHERE negocio_id = ? AND activo = 1 ORDER BY nombre",
      [negocio.id],
    );
    const miembros = await db.all(
      `SELECT pe.perfil_id, e.id, e.nombre
         FROM perfil_examenes pe
         JOIN perfiles p ON p.id = pe.perfil_id
         JOIN examenes e ON e.id = pe.examen_id
        WHERE p.negocio_id = ? ORDER BY e.nombre`,
      [negocio.id],
    );
    const porPerfil = new Map();
    for (const m of miembros) {
      if (!porPerfil.has(m.perfil_id)) porPerfil.set(m.perfil_id, []);
      porPerfil.get(m.perfil_id).push({ id: m.id, nombre: m.nombre });
    }
    return {
      categorias,
      examenes,
      perfiles: perfiles.map((p) => ({ ...p, examenes: porPerfil.get(p.id) || [] })).filter((p) =>
        p.examenes.length > 0
      ),
    };
  });

  r.add("POST", "/api/publico/visita", { tenant: true }, async ({ negocio, body, ip }) => {
    if (!limite(`visita|${ip}`, 60, 60_000)) throw new HttpError(429, "Demasiadas solicitudes.");
    // Pasado el tope del día, la visita no se cuenta, sin molestar al paciente.
    try {
      await cuotaDiaria(`visitas|${negocio.id}`, TOPE_VISITAS_DIA);
    } catch (e) {
      if (e.status === 429) return { ok: true, contada: false };
      throw e;
    }
    const { dia, hora, dow } = parteFecha();
    await db.run(
      "INSERT INTO visitas (id, negocio_id, creado_en, dia, hora, dow, dispositivo) VALUES (?,?,?,?,?,?,?)",
      [
        uuid(),
        negocio.id,
        nowIso(),
        dia,
        hora,
        dow,
        body.dispositivo === "escritorio" ? "escritorio" : "movil",
      ],
    );
    return { ok: true };
  });

  r.add("POST", "/api/publico/presupuesto", { tenant: true }, async ({ negocio, body, ip }) => {
    if (!limite(`presupuesto|${ip}`, 30, 60_000)) {
      throw new HttpError(429, "Demasiados presupuestos en poco tiempo. Espera un momento.");
    }
    await cuotaDiaria(
      `presupuestos|${negocio.id}`,
      TOPE_PRESUPUESTOS_DIA,
      "Hoy ya se generaron demasiados presupuestos en este negocio. Intenta de nuevo mañana o comunícate con el laboratorio.",
    );
    return crearPresupuesto(negocio, body);
  });
}
