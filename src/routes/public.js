// Rutas públicas (pacientes). Solo lectura del catálogo + generación de presupuestos.
import { db } from '../db.js';
import { env } from '../env.js';
import { limite } from '../auth.js';
import { refrescarSiHaceFalta, refrescarTasa, tasaGlobal } from '../bcv.js';
import { getConfig, resolverTasa, crearPresupuesto } from '../negocio.js';
import { HttpError, uuid, nowIso, parteFecha } from '../util.js';

export function registrarPublicas(r) {
  r.add('GET', '/api/publico/config', { tenant: true }, async ({ negocio }) => {
    const cfg = await getConfig(negocio.id);
    refrescarSiHaceFalta(await tasaGlobal());
    const tasa = await resolverTasa(cfg);
    const origenes = await db.all('SELECT id, nombre FROM origenes WHERE negocio_id = ? AND activo = 1 ORDER BY orden, nombre', [negocio.id]);
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
        ? { valor: tasa.valor, fecha_valor: tasa.fecha_valor, fuente: tasa.fuente, manual: tasa.manual, desactualizada: tasa.desactualizada }
        : null,
      precios_actualizados_en: cfg.precios_actualizados_en,
    };
  });

  r.add('GET', '/api/publico/catalogo', { tenant: true }, async ({ negocio }) => {
    const categorias = await db.all('SELECT id, nombre, max_examenes FROM categorias WHERE negocio_id = ? AND activo = 1 ORDER BY orden, nombre', [negocio.id]);
    const examenes = await db.all(
      `SELECT e.id, e.nombre, e.categoria_id, e.precio_cent, e.descripcion, e.indicaciones
         FROM examenes e JOIN categorias c ON c.id = e.categoria_id
        WHERE e.negocio_id = ? AND e.activo = 1 AND c.activo = 1 ORDER BY e.nombre`,
      [negocio.id],
    );
    const perfiles = await db.all('SELECT id, nombre, descripcion, precio_cent FROM perfiles WHERE negocio_id = ? AND activo = 1 ORDER BY nombre', [negocio.id]);
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
      perfiles: perfiles.map((p) => ({ ...p, examenes: porPerfil.get(p.id) || [] })).filter((p) => p.examenes.length > 0),
    };
  });

  r.add('POST', '/api/publico/visita', { tenant: true }, async ({ negocio, body, ip }) => {
    if (!limite(`visita|${ip}`, 60, 60_000)) throw new HttpError(429, 'Demasiadas solicitudes.');
    const { dia, hora, dow } = parteFecha();
    await db.run(
      'INSERT INTO visitas (id, negocio_id, creado_en, dia, hora, dow, dispositivo) VALUES (?,?,?,?,?,?,?)',
      [uuid(), negocio.id, nowIso(), dia, hora, dow, body.dispositivo === 'escritorio' ? 'escritorio' : 'movil'],
    );
    return { ok: true };
  });

  r.add('POST', '/api/publico/presupuesto', { tenant: true }, async ({ negocio, body, ip }) => {
    if (!limite(`presupuesto|${ip}`, 30, 60_000)) throw new HttpError(429, 'Demasiados presupuestos en poco tiempo. Espera un momento.');
    return crearPresupuesto(negocio, body);
  });

  // Para hostings sin proceso permanente: un cron externo llama aquí una vez al día.
  r.add('POST', '/api/cron/tasa', { noCsrf: true }, async ({ req }) => {
    if (!env.cronSecret || req.headers['x-cron-secret'] !== env.cronSecret) throw new HttpError(403, 'No autorizado.');
    return refrescarTasa({ forzar: true });
  });
}
