// Estadísticas por negocio. Todas las consultas filtran por negocio_id y rango de días.
import { db } from '@dualstudio/comun/servidor';
import { csv, sumarDias } from './util.js';

const pct = (n, total) => (total > 0 ? Math.round((n / total) * 1000) / 10 : 0);

export async function calcularDashboard(negocioId, desde, hasta) {
  const p = [negocioId, desde, hasta];
  const W = 'negocio_id = ? AND dia BETWEEN ? AND ?';

  const tot = await db.get(`SELECT COUNT(*) AS n, COALESCE(SUM(total_ref_cent), 0) AS suma FROM presupuestos WHERE ${W}`, p);
  const vis = await db.get(`SELECT COUNT(*) AS n FROM visitas WHERE ${W}`, p);
  const diasP = await db.all(`SELECT dia, COUNT(*) AS n FROM presupuestos WHERE ${W} GROUP BY dia`, p);
  const diasV = await db.all(`SELECT dia, COUNT(*) AS n FROM visitas WHERE ${W} GROUP BY dia`, p);
  const topExamenes = await db.all(
    `SELECT examen_id, MAX(examen_nombre) AS nombre, MAX(categoria_nombre) AS categoria, COUNT(*) AS veces,
            SUM(CASE WHEN perfil_nombre IS NULL THEN 1 ELSE 0 END) AS sueltos
       FROM presupuesto_examenes WHERE ${W}
      GROUP BY examen_id ORDER BY veces DESC, nombre ASC LIMIT 15`,
    p,
  );
  const topPerfiles = await db.all(
    `SELECT ref_id, MAX(nombre) AS nombre, COUNT(*) AS veces
       FROM presupuesto_items WHERE ${W} AND tipo = 'perfil'
      GROUP BY ref_id ORDER BY veces DESC, nombre ASC LIMIT 15`,
    p,
  );
  const categorias = await db.all(
    `SELECT categoria_nombre AS nombre, COUNT(*) AS veces FROM presupuesto_examenes WHERE ${W}
      GROUP BY categoria_nombre ORDER BY veces DESC, nombre ASC`,
    p,
  );
  const origenes = await db.all(
    `SELECT COALESCE(origen_nombre, 'No indicó') AS nombre, COUNT(*) AS n FROM presupuestos WHERE ${W}
      GROUP BY COALESCE(origen_nombre, 'No indicó') ORDER BY n DESC, nombre ASC`,
    p,
  );
  // Lo que escribieron en «Otro», agrupado sin importar mayúsculas (los 10 más repetidos)
  const detalles = await db.all(
    `SELECT MIN(origen_detalle) AS texto, COUNT(*) AS n FROM presupuestos WHERE ${W} AND origen_detalle IS NOT NULL AND origen_detalle <> ''
      GROUP BY LOWER(origen_detalle) ORDER BY n DESC, texto ASC LIMIT 10`,
    p,
  );
  const dispP = await db.all(`SELECT dispositivo, COUNT(*) AS n FROM presupuestos WHERE ${W} GROUP BY dispositivo`, p);
  const dispV = await db.all(`SELECT dispositivo, COUNT(*) AS n FROM visitas WHERE ${W} GROUP BY dispositivo`, p);
  const horasV = await db.all(`SELECT hora, COUNT(*) AS n FROM visitas WHERE ${W} GROUP BY hora`, p);
  const horasP = await db.all(`SELECT hora, COUNT(*) AS n FROM presupuestos WHERE ${W} GROUP BY hora`, p);
  const semV = await db.all(`SELECT dow, COUNT(*) AS n FROM visitas WHERE ${W} GROUP BY dow`, p);
  const semP = await db.all(`SELECT dow, COUNT(*) AS n FROM presupuestos WHERE ${W} GROUP BY dow`, p);

  const mapa = (rows, k) => new Map(rows.map((r) => [r[k], Number(r.n)]));
  const mp = mapa(diasP, 'dia');
  const mv = mapa(diasV, 'dia');
  const por_dia = [];
  for (let d = desde; d <= hasta; d = sumarDias(d, 1)) por_dia.push({ dia: d, presupuestos: mp.get(d) || 0, visitas: mv.get(d) || 0 });

  const serie = (n, filasV, filasP, k) => {
    const v = mapa(filasV, k);
    const pr = mapa(filasP, k);
    return Array.from({ length: n }, (_, i) => ({ clave: i, visitas: v.get(i) || 0, presupuestos: pr.get(i) || 0 }));
  };
  const dispositivos = ['movil', 'escritorio'].map((d) => ({
    dispositivo: d,
    presupuestos: Number(dispP.find((x) => x.dispositivo === d)?.n || 0),
    visitas: Number(dispV.find((x) => x.dispositivo === d)?.n || 0),
  }));

  const nPres = Number(tot.n);
  const nVis = Number(vis.n);
  return {
    desde, hasta,
    resumen: {
      presupuestos: nPres,
      visitas: nVis,
      conversion: nVis > 0 ? pct(nPres, nVis) : null,
      ticket_promedio_cent: nPres > 0 ? Math.round(Number(tot.suma) / nPres) : 0,
      total_ref_cent: Number(tot.suma),
    },
    por_dia,
    top_examenes: topExamenes.map((r) => ({ ...r, veces: Number(r.veces), sueltos: Number(r.sueltos) })),
    top_perfiles: topPerfiles.map((r) => ({ ...r, veces: Number(r.veces) })),
    categorias: categorias.map((r) => ({ ...r, veces: Number(r.veces) })),
    origenes: origenes.map((r) => ({ nombre: r.nombre, n: Number(r.n), pct: pct(Number(r.n), nPres) })),
    origen_detalles: detalles.map((r) => ({ texto: r.texto, n: Number(r.n) })),
    dispositivos,
    horas: serie(24, horasV, horasP, 'hora'),
    dias_semana: serie(7, semV, semP, 'dow'),
  };
}

export function csvDashboard(tipo, d) {
  const ref = (c) => (c / 100).toFixed(2).replace('.', ',');
  switch (tipo) {
    case 'examenes':
      return csv(d.top_examenes, [
        { titulo: 'Examen', valor: 'nombre' }, { titulo: 'Categoría', valor: 'categoria' },
        { titulo: 'Veces presupuestado', valor: 'veces' }, { titulo: 'Como examen suelto', valor: 'sueltos' },
        { titulo: 'Dentro de un perfil', valor: (r) => r.veces - r.sueltos },
      ]);
    case 'perfiles':
      return csv(d.top_perfiles, [{ titulo: 'Perfil', valor: 'nombre' }, { titulo: 'Veces presupuestado', valor: 'veces' }]);
    case 'categorias':
      return csv(d.categorias, [{ titulo: 'Categoría', valor: 'nombre' }, { titulo: 'Exámenes presupuestados', valor: 'veces' }]);
    case 'origenes':
      return csv(d.origenes, [{ titulo: 'Origen', valor: 'nombre' }, { titulo: 'Presupuestos', valor: 'n' }, { titulo: 'Porcentaje', valor: (r) => `${String(r.pct).replace('.', ',')}%` }]);
    case 'dias':
      return csv(d.por_dia, [{ titulo: 'Día', valor: 'dia' }, { titulo: 'Visitas', valor: 'visitas' }, { titulo: 'Presupuestos', valor: 'presupuestos' }]);
    case 'resumen':
      return csv(
        [
          { k: 'Desde', v: d.desde }, { k: 'Hasta', v: d.hasta },
          { k: 'Presupuestos generados', v: d.resumen.presupuestos }, { k: 'Visitas', v: d.resumen.visitas },
          { k: 'Conversión (%)', v: d.resumen.conversion === null ? '' : String(d.resumen.conversion).replace('.', ',') },
          { k: 'Ticket promedio (REF)', v: ref(d.resumen.ticket_promedio_cent) },
        ],
        [{ titulo: 'Indicador', valor: 'k' }, { titulo: 'Valor', valor: 'v' }],
      );
    default:
      return null;
  }
}
