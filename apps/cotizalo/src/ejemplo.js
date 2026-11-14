// «Negocio de ejemplo» del sitio de pruebas: un laboratorio con catálogo, perfiles y un mes de actividad
// inventada, para probar la app sin cargar nada a mano.
//
// Se crea POR PASOS (un paso por petición): Cloudflare limita las consultas a la base por petición,
// así que cada paso hace pocas. La pantalla del superadministrador encadena los pasos con una barra
// de progreso. Solo está disponible si la variable DATOS_DE_EJEMPLO = "true" (sitio de pruebas).
import { db } from './db.js';
import { crearNegocio, crearPresupuesto } from './negocio.js';
import { CATALOGO, PERFILES, PATOLOGIA } from './datos-ejemplo.js';
import { HttpError, uuid, nowIso, parteFecha } from './util.js';
import { env } from './env.js';

const EXAMENES_POR_PASO = 8;
export const PRESUPUESTOS_EJEMPLO = 60;

// Todos los exámenes en un solo orden fijo: [categoría, nombre, precio, descripción, indicaciones]
const LISTA = [
  ...Object.entries(CATALOGO).flatMap(([cat, lista]) => lista.map((x) => [cat, ...x])),
  ...PATOLOGIA.examenes.map((x) => [PATOLOGIA.nombre, ...x]),
];
const centavos = (n) => Math.round(n * 100);
const totalPasos = 1 + Math.ceil(LISTA.length / EXAMENES_POR_PASO) + PERFILES.length + PRESUPUESTOS_EJEMPLO;

function prng(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function negocioDe(id) {
  const n = await db.get('SELECT id, slug, nombre FROM negocios WHERE id = ?', [id]);
  if (!n) throw new HttpError(404, 'El negocio de ejemplo ya no existe. Empieza de nuevo.');
  return n;
}

/**
 * Ejecuta un paso y dice cuál sigue.
 * { paso: 'negocio' } → { negocio, siguiente: { paso, negocio_id, i }, hecho, total }
 */
export async function pasoEjemplo({ paso = 'negocio', negocio_id: nid, i = 0 } = {}) {
  i = Number.isInteger(i) && i >= 0 ? i : 0;
  let hecho;
  let siguiente = null;

  if (paso === 'negocio') {
    // Dirección libre: ejemplo, ejemplo-2, ejemplo-3…
    let slug = 'ejemplo';
    for (let k = 2; await db.get('SELECT id FROM negocios WHERE slug = ?', [slug]); k++) {
      if (k > 30) throw new HttpError(409, 'Ya hay demasiados negocios de ejemplo. Borra alguno.');
      slug = `ejemplo-${k}`;
    }
    // El administrador lleva una contraseña al azar que nadie conoce: para entrar a su panel se usa
    // «Abrir panel» (superadministrador) o «Credenciales» para ponerle una.
    const azar = Array.from(crypto.getRandomValues(new Uint8Array(18)), (b) => b.toString(16).padStart(2, '0')).join('');
    const { id } = await crearNegocio({ nombre: 'Laboratorio de Ejemplo', slug, adminEmail: `admin@${slug}.test`, adminPassword: azar, color: '#0e7c86' });
    await db.run(
      `UPDATE configuracion_negocio SET rif = 'J-00000000-0', telefono = '0212-555-0101', direccion = 'Av. Principal, Edif. Salud, Planta Baja',
         horario = 'Lunes a viernes 7:00 am – 4:00 pm · Sábados 7:00 am – 12:00 m',
         pie_presupuesto = 'Presenta este presupuesto en el laboratorio. Datos de ejemplo.', prefijo_codigo = 'EJE' WHERE negocio_id = ?`,
      [id],
    );
    const orden = Number((await db.get('SELECT COALESCE(MAX(orden), 0) + 1 AS n FROM categorias WHERE negocio_id = ?', [id])).n);
    await db.run('INSERT INTO categorias (id, negocio_id, nombre, orden, activo, max_por_examen) VALUES (?,?,?,?,1,?)', [uuid(), id, PATOLOGIA.nombre, orden, PATOLOGIA.max_por_examen]);
    nid = id;
    hecho = 1;
    siguiente = { paso: 'examenes', negocio_id: id, i: 0 };
  } else if (paso === 'examenes') {
    await negocioDe(nid);
    const cats = new Map((await db.all('SELECT id, nombre FROM categorias WHERE negocio_id = ?', [nid])).map((c) => [c.nombre, c.id]));
    const ahora = nowIso();
    await db.tx(async (t) => {
      for (const [cat, nombre, precio, desc, ind] of LISTA.slice(i, i + EXAMENES_POR_PASO)) {
        await t.run(
          `INSERT INTO examenes (id, negocio_id, categoria_id, nombre, precio_cent, descripcion, indicaciones, activo, creado_en, actualizado_en)
           VALUES (?,?,?,?,?,?,?,1,?,?)`,
          [uuid(), nid, cats.get(cat), nombre, centavos(precio), desc, ind, ahora, ahora],
        );
      }
    });
    const fin = i + EXAMENES_POR_PASO;
    hecho = 1 + Math.ceil(fin / EXAMENES_POR_PASO);
    siguiente = fin < LISTA.length ? { paso: 'examenes', negocio_id: nid, i: fin } : { paso: 'perfiles', negocio_id: nid, i: 0 };
  } else if (paso === 'perfiles') {
    await negocioDe(nid);
    const [nombre, precio, desc, miembros] = PERFILES[i] || [];
    if (!nombre) throw new HttpError(400, 'Paso no válido.');
    const ids = new Map((await db.all('SELECT id, nombre FROM examenes WHERE negocio_id = ?', [nid])).map((e) => [e.nombre, e.id]));
    const ahora = nowIso();
    const pid = uuid();
    await db.tx(async (t) => {
      await t.run('INSERT INTO perfiles (id, negocio_id, nombre, descripcion, precio_cent, activo, creado_en, actualizado_en) VALUES (?,?,?,?,?,1,?,?)', [pid, nid, nombre, desc, centavos(precio), ahora, ahora]);
      for (const m of miembros) await t.run('INSERT INTO perfil_examenes (perfil_id, examen_id) VALUES (?,?)', [pid, ids.get(m)]);
    });
    hecho = 1 + Math.ceil(LISTA.length / EXAMENES_POR_PASO) + i + 1;
    siguiente = i + 1 < PERFILES.length ? { paso: 'perfiles', negocio_id: nid, i: i + 1 } : { paso: 'actividad', negocio_id: nid, i: 0 };
  } else if (paso === 'actividad') {
    const negocio = await negocioDe(nid);
    await presupuestoInventado(negocio, i);
    hecho = totalPasos - PRESUPUESTOS_EJEMPLO + i + 1;
    siguiente = i + 1 < PRESUPUESTOS_EJEMPLO ? { paso: 'actividad', negocio_id: nid, i: i + 1 } : null;
  } else {
    throw new HttpError(400, 'Paso no válido.');
  }

  const n = await db.get('SELECT slug, nombre FROM negocios WHERE id = ?', [nid]);
  return { negocio: n, siguiente, hecho: Math.min(hecho, totalPasos), total: totalPasos };
}

/** Un presupuesto inventado de los últimos 30 días (más una o dos visitas que no terminaron en presupuesto). */
async function presupuestoInventado(negocio, i) {
  const rnd = prng(1000 + i * 7919);
  const examenes = await db.all(
    'SELECT e.id, c.max_por_examen FROM examenes e JOIN categorias c ON c.id = e.categoria_id WHERE e.negocio_id = ? AND e.activo = 1 ORDER BY e.nombre',
    [negocio.id],
  );
  const perfiles = await db.all('SELECT id FROM perfiles WHERE negocio_id = ? AND activo = 1 ORDER BY nombre', [negocio.id]);
  const miembros = await db.all('SELECT pe.perfil_id, pe.examen_id FROM perfil_examenes pe JOIN perfiles p ON p.id = pe.perfil_id WHERE p.negocio_id = ?', [negocio.id]);
  const origenes = await db.all('SELECT id FROM origenes WHERE negocio_id = ? ORDER BY orden', [negocio.id]);
  if (!examenes.length) return;

  const ahora = Date.now();
  const dias = Math.floor((1 - Math.sqrt(rnd())) * 30);
  const horaLocal = Math.min(20, Math.max(7, Math.round(8 + rnd() * 6 + rnd() * 5)));
  const dia = parteFecha(new Date(ahora - dias * 86400000)).dia;
  const cuando = new Date(`${dia}T${String(horaLocal).padStart(2, '0')}:${String(Math.floor(rnd() * 60)).padStart(2, '0')}:00.000Z`);
  cuando.setUTCMinutes(cuando.getUTCMinutes() - env.tzOffsetMin);
  if (cuando.getTime() > ahora) cuando.setTime(ahora - 3600_000);

  const items = [];
  const usados = new Set();
  const n = 1 + Math.floor(rnd() * 4);
  for (let k = 0; k < n; k++) {
    if (perfiles.length && rnd() < 0.3) {
      const p = perfiles[Math.floor(rnd() * perfiles.length)];
      const ex = miembros.filter((m) => m.perfil_id === p.id).map((m) => m.examen_id);
      if (items.some((x) => x.id === p.id) || ex.some((e) => usados.has(e))) continue;
      ex.forEach((e) => usados.add(e));
      items.push({ tipo: 'perfil', id: p.id });
    } else {
      const e = examenes[Math.floor(Math.pow(rnd(), 1.6) * examenes.length)];
      if (usados.has(e.id)) continue;
      usados.add(e.id);
      const max = Number(e.max_por_examen) > 1 ? Number(e.max_por_examen) : 1;
      const cantidad = max > 1 ? 1 + Math.floor(rnd() * max) : 1;
      items.push(cantidad > 1 ? { tipo: 'examen', id: e.id, cantidad } : { tipo: 'examen', id: e.id });
    }
  }
  if (!items.length) items.push({ tipo: 'examen', id: examenes[0].id });
  const origen = rnd() < 0.15 || !origenes.length ? null : origenes[Math.min(origenes.length - 1, Math.floor(Math.pow(rnd(), 1.5) * origenes.length))].id;
  await crearPresupuesto(negocio, { items, origen_id: origen, dispositivo: rnd() < 0.78 ? 'movil' : 'escritorio' }, { fecha: cuando });
  const p = parteFecha(cuando);
  const extra = 1 + Math.floor(rnd() * 2);
  await db.tx(async (t) => {
    for (let v = 0; v < extra; v++) {
      await t.run('INSERT INTO visitas (id, negocio_id, creado_en, dia, hora, dow, dispositivo) VALUES (?,?,?,?,?,?,?)',
        [uuid(), negocio.id, cuando.toISOString(), p.dia, p.hora, p.dow, rnd() < 0.78 ? 'movil' : 'escritorio']);
    }
  });
}
