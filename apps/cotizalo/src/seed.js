// Datos iniciales para Cloudflare D1.
//
// D1 no se puede llenar desde un script de Node, así que este programa:
//   1. crea una base SQLite temporal en memoria con el mismo esquema (imitando la API de D1),
//   2. ejecuta sobre ella la misma lógica de siembra (superadministrador, negocios de ejemplo...),
//   3. vuelca el resultado como archivo SQL (seed.sql), que se carga con wrangler:
//        wrangler d1 execute presupuesto --local  --file=seed.sql     (desarrollo)
//        wrangler d1 execute presupuesto --remote --file=seed.sql     (producción)
//
// Uso:
//   npm run seed        -> seed.sql solo con el superadministrador (SUPER_EMAIL / SUPER_PASSWORD)
//   npm run seed:demo   -> además negocios de ejemplo con catálogo y estadísticas ficticias
// Solo para una base VACÍA (los INSERT fallarían si los datos ya existen).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env, configurarEnv } from './env.js';
import { db, bindD1, hashPassword } from '@dualstudio/comun/servidor';
import { crearNegocio, crearPresupuesto } from './negocio.js';
import { uuid, nowIso, parteFecha } from './util.js';
import { asegurarEsquema, COLUMNAS } from './esquema.js';
import { CATALOGO, PERFILES } from './datos-ejemplo.js';

const centavos = (n) => Math.round(n * 100);

async function cargarCatalogo(negocioId, { catalogo, perfiles }) {
  const ahora = nowIso();
  const cats = new Map((await db.all('SELECT id, nombre FROM categorias WHERE negocio_id = ?', [negocioId])).map((c) => [c.nombre, c.id]));
  const ids = new Map();
  for (const [cat, lista] of Object.entries(catalogo)) {
    for (const [nombre, precio, desc, ind] of lista) {
      const id = uuid();
      ids.set(nombre, id);
      await db.run(
        `INSERT INTO examenes (id, negocio_id, categoria_id, nombre, precio_cent, descripcion, indicaciones, activo, creado_en, actualizado_en)
         VALUES (?,?,?,?,?,?,?,1,?,?)`,
        [id, negocioId, cats.get(cat), nombre, centavos(precio), desc, ind, ahora, ahora],
      );
    }
  }
  for (const [nombre, precio, desc, miembros] of perfiles) {
    const id = uuid();
    await db.run('INSERT INTO perfiles (id, negocio_id, nombre, descripcion, precio_cent, activo, creado_en, actualizado_en) VALUES (?,?,?,?,?,1,?,?)', [id, negocioId, nombre, desc, centavos(precio), ahora, ahora]);
    for (const m of miembros) await db.run('INSERT INTO perfil_examenes (perfil_id, examen_id) VALUES (?,?)', [id, ids.get(m)]);
  }
}

function prng(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Genera presupuestos y visitas ficticios de los últimos 30 días para que el dashboard no esté vacío. */
async function generarActividad(negocio, { presupuestos, semilla }) {
  const rnd = prng(semilla);
  const examenes = await db.all('SELECT id FROM examenes WHERE negocio_id = ? AND activo = 1', [negocio.id]);
  const perfiles = await db.all('SELECT id FROM perfiles WHERE negocio_id = ? AND activo = 1', [negocio.id]);
  const miembros = await db.all('SELECT pe.perfil_id, pe.examen_id FROM perfil_examenes pe JOIN perfiles p ON p.id = pe.perfil_id WHERE p.negocio_id = ?', [negocio.id]);
  const origenes = await db.all('SELECT id, nombre FROM origenes WHERE negocio_id = ?', [negocio.id]);
  const pesos = [0.38, 0.22, 0.2, 0.14, 0.06];
  const elegirOrigen = () => {
    if (rnd() < 0.15) return null;
    let x = rnd();
    for (let i = 0; i < origenes.length; i++) { x -= pesos[i] ?? 0.05; if (x <= 0) return origenes[i].id; }
    return origenes[0].id;
  };
  const enPerfil = (pid) => miembros.filter((m) => m.perfil_id === pid).map((m) => m.examen_id);
  const ahora = Date.now();

  for (let i = 0; i < presupuestos; i++) {
    const dias = Math.floor((1 - Math.sqrt(rnd())) * 30);
    const horaLocal = Math.min(20, Math.max(7, Math.round(8 + rnd() * 6 + rnd() * 5)));
    const t = new Date(ahora - dias * 86400000);
    const dia = parteFecha(t).dia;
    const cuando = new Date(`${dia}T${String(horaLocal).padStart(2, '0')}:${String(Math.floor(rnd() * 60)).padStart(2, '0')}:00.000Z`);
    cuando.setUTCMinutes(cuando.getUTCMinutes() - env.tzOffsetMin);
    if (cuando.getTime() > ahora) continue;

    const items = [];
    const usados = new Set();
    const n = 1 + Math.floor(rnd() * 4);
    for (let k = 0; k < n; k++) {
      if (perfiles.length && rnd() < 0.3) {
        const p = perfiles[Math.floor(rnd() * perfiles.length)];
        const ex = enPerfil(p.id);
        if (items.some((x) => x.id === p.id) || ex.some((e) => usados.has(e))) continue;
        ex.forEach((e) => usados.add(e));
        items.push({ tipo: 'perfil', id: p.id });
      } else {
        const e = examenes[Math.floor(Math.pow(rnd(), 1.6) * examenes.length)];
        if (usados.has(e.id)) continue;
        usados.add(e.id);
        items.push({ tipo: 'examen', id: e.id });
      }
    }
    if (!items.length) continue;
    await crearPresupuesto(negocio, { items, origen_id: elegirOrigen(), dispositivo: rnd() < 0.78 ? 'movil' : 'escritorio' }, { fecha: cuando });
    // Visitas que no terminaron en presupuesto
    const extra = 1 + Math.floor(rnd() * 3);
    for (let v = 0; v < extra; v++) {
      const p = parteFecha(cuando);
      await db.run('INSERT INTO visitas (id, negocio_id, creado_en, dia, hora, dow, dispositivo) VALUES (?,?,?,?,?,?,?)',
        [uuid(), negocio.id, cuando.toISOString(), p.dia, p.hora, p.dow, rnd() < 0.78 ? 'movil' : 'escritorio']);
    }
  }
}

/** Siembra sobre la base enlazada con bindD1(). */
export async function sembrar({ demo = false } = {}) {
  await asegurarEsquema(); // las columnas que la app añade sola deben existir para sembrar
  const email = (env.superEmail || 'super@plataforma.test').toLowerCase();
  const password = env.superPassword || 'Super12345';
  const hash = await hashPassword(password);
  const existe = await db.get('SELECT id FROM superadmins WHERE email = ?', [email]);
  if (existe) await db.run('UPDATE superadmins SET password_hash = ? WHERE id = ?', [hash, existe.id]);
  else await db.run('INSERT INTO superadmins (id, email, password_hash, creado_en) VALUES (?,?,?,?)', [uuid(), email, hash, nowIso()]);
  const out = { superadmin: { email, password: env.superPassword ? '(la definida en SUPER_PASSWORD)' : password } };

  // Tasa de ejemplo para poder probar sin conexión (la consulta real la reemplaza al ejecutarse).
  if (demo && !(await db.get('SELECT id FROM tasa_bcv LIMIT 1'))) {
    const ahora = nowIso();
    await db.run('INSERT INTO tasa_bcv (id, fecha_valor, valor, fuente, obtenido_en, verificado_en) VALUES (?,?,?,?,?,?)', [uuid(), parteFecha().dia, 100, 'ejemplo', ahora, ahora]);
  }

  if (demo) {
    if (!(await db.get("SELECT id FROM negocios WHERE slug = 'demo'"))) {
      const { id } = await crearNegocio({ nombre: 'Laboratorio Demo', slug: 'demo', adminEmail: 'admin@demo.test', adminPassword: 'Demo12345', color: '#0e7c86' });
      await db.run("UPDATE configuracion_negocio SET telefono = '0212-555-0101', direccion = 'Av. Principal, Edif. Salud, Planta Baja', horario = 'Lunes a viernes 7:00 am – 4:00 pm · Sábados 7:00 am – 12:00 m', pie_presupuesto = 'Presenta este presupuesto en el laboratorio. Los exámenes pueden requerir ayuno o indicaciones previas.', prefijo_codigo = 'DEM' WHERE negocio_id = ?", [id]);
      await cargarCatalogo(id, { catalogo: CATALOGO, perfiles: PERFILES });
      await generarActividad({ id }, { presupuestos: 190, semilla: 7 });
    }
    if (!(await db.get("SELECT id FROM negocios WHERE slug = 'norte'"))) {
      const { id } = await crearNegocio({ nombre: 'Clínica Norte', slug: 'norte', adminEmail: 'admin@norte.test', adminPassword: 'Norte12345', color: '#2b6cb0' });
      await db.run("UPDATE configuracion_negocio SET telefono = '0414-555-0199', prefijo_codigo = 'CN' WHERE negocio_id = ?", [id]);
      await cargarCatalogo(id, {
        catalogo: { 'Hematología': [['Hematología completa', 5, null, null]], 'Química sanguínea': [['Glicemia', 3, null, 'Ayuno de 8 horas'], ['Colesterol total', 3.5, null, null]], 'Orina': [['Orina completa', 3.5, null, null]] },
        perfiles: [['Perfil rutina', 11, 'Chequeo básico.', ['Hematología completa', 'Glicemia', 'Orina completa']]],
      });
    }
    out.demo = [
      { negocio: 'demo', admin: 'admin@demo.test', password: 'Demo12345' },
      { negocio: 'norte', admin: 'admin@norte.test', password: 'Norte12345' },
    ];
  }
  return out;
}

// ── Volcado a SQL ──
const TABLAS = ['negocios', 'configuracion_negocio', 'superadmins', 'usuarios_admin', 'categorias', 'examenes', 'perfiles',
  'perfil_examenes', 'origenes', 'tasa_bcv', 'presupuestos', 'presupuesto_items', 'presupuesto_examenes', 'visitas']; // padres antes que hijos

const literal = (v) => (v === null || v === undefined ? 'NULL'
  : typeof v === 'number' || typeof v === 'bigint' ? String(v)
  : `'${String(v).replace(/'/g, "''")}'`);

export async function volcarSql() {
  const out = ['-- Generado por src/seed.js. Para una base vacía.'];
  // Las columnas de src/esquema.js no van: la base recién migrada aún no las tiene (la app las añade
  // sola al arrancar) y en los datos sembrados siempre llevan su valor por defecto.
  const nuevas = new Set(COLUMNAS.map(([t, c]) => `${t}.${c}`));
  for (const t of TABLAS) {
    const filas = await db.all(`SELECT * FROM ${t}`);
    for (const f of filas) {
      const cols = Object.keys(f).filter((c) => !nuevas.has(`${t}.${c}`));
      out.push(`INSERT INTO ${t} (${cols.join(', ')}) VALUES (${cols.map((c) => literal(f[c])).join(', ')});`);
    }
  }
  return `${out.join('\n')}\n`;
}

async function main() {
  configurarEnv({ ...process.env, ENVIRONMENT: 'development' }); // el seed no firma sesiones: no necesita SESSION_SECRET
  const { crearD1Local } = await import('@dualstudio/comun/servidor/d1-local');
  const d1 = crearD1Local(':memory:');
  await d1.exec(fs.readFileSync(new URL('../migrations/0001_schema.sql', import.meta.url), 'utf8'));
  bindD1(d1);
  const demo = process.argv.includes('--demo');
  // Sin contraseña propia, el seed crearía el superadministrador de ejemplo (Super12345, publicada en el README):
  // nunca para una base real. Solo se permite con --demo, que es para probar en local.
  if (!demo && !process.env.SUPER_PASSWORD) {
    throw new Error('Define SUPER_EMAIL y SUPER_PASSWORD (una contraseña propia de 8 caracteres o más) para crear el superadministrador. Los datos de ejemplo, solo con --demo y en local.');
  }
  const r = await sembrar({ demo });
  const i = process.argv.indexOf('--out');
  const destino = path.resolve(i > 0 ? process.argv[i + 1] : 'seed.sql');
  fs.writeFileSync(destino, await volcarSql());
  console.log(`\nSQL generado: ${destino}`);
  console.log('Cárgalo con:');
  console.log('  npx wrangler d1 execute presupuesto --local  --file=seed.sql   (desarrollo)');
  console.log('  npx wrangler d1 execute presupuesto --remote --file=seed.sql   (producción)');
  console.log(`\nSuperadministrador:  correo: ${r.superadmin.email}   clave: ${r.superadmin.password}`);
  if (r.demo) {
    console.log('\nNegocios de ejemplo (en desarrollo: http://localhost:8787/cotizalo/demo y /cotizalo/demo/admin):');
    for (const d of r.demo) console.log(`  ${d.negocio}  admin: ${d.admin} / ${d.password}`);
    console.log('\nOJO: son credenciales de ejemplo. No las uses en producción.');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}
