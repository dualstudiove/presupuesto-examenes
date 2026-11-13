// RIF, límite de exámenes por categoría, borrado de estadísticas y columnas nuevas que la app añade sola.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { crearEntorno, levantar } from './ayudas.js';

let server;
let port;
let D1;
const jar = {};

async function pedir(path, { method = 'GET', body, conSesion = true } = {}) {
  const headers = { 'x-app': '1' };
  if (body) headers['content-type'] = 'application/json';
  if (conSesion && Object.keys(jar).length) headers.cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
  const r = await fetch(`http://127.0.0.1:${port}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  for (const c of r.headers.getSetCookie()) { const [par] = c.split(';'); const i = par.indexOf('='); jar[par.slice(0, i)] = par.slice(i + 1); }
  const texto = await r.text();
  let json = null;
  try { json = JSON.parse(texto); } catch { /* no es JSON */ }
  return { status: r.status, json, texto };
}
const admin = (path, o = {}) => pedir(`/demo/api/admin${path}`, o);
const publico = (path, o = {}) => pedir(`/demo/api/publico${path}`, { ...o, conSesion: false });

before(async () => {
  const bindings = await crearEntorno();
  D1 = bindings.DB;
  const { configurarEnv } = await import('../src/env.js');
  const { bindD1 } = await import('../src/db.js');
  configurarEnv(bindings);
  bindD1(bindings.DB);
  const { sembrar } = await import('../src/seed.js');
  await sembrar({ demo: true });
  const worker = (await import('../src/server.js')).default;
  ({ server, port } = await levantar(worker, bindings));
  const r = await admin('/login', { method: 'POST', body: { email: 'admin@demo.test', password: 'Demo12345' } });
  assert.equal(r.status, 200);
});

after(() => server?.close());

test('la app añade sola las columnas nuevas a una base existente', async () => {
  const cols = async (t) => (await D1.prepare(`PRAGMA table_info(${t})`).all()).results.map((c) => c.name);
  assert.ok((await cols('configuracion_negocio')).includes('rif'));
  assert.ok((await cols('configuracion_negocio')).includes('secuencia_base'));
  assert.ok((await cols('categorias')).includes('max_examenes'));
});

test('RIF: se guarda normalizado, sale en la config pública y en el presupuesto', async () => {
  assert.equal((await admin('/config', { method: 'PUT', body: { rif: 'j-1234 5678-9' } })).status, 200);
  assert.equal((await admin('/config')).json.config.rif, 'J-12345678-9');
  assert.equal((await publico('/config')).json.negocio.rif, 'J-12345678-9');
  const cat = (await publico('/catalogo')).json;
  const r = await publico('/presupuesto', { method: 'POST', body: { items: [{ tipo: 'examen', id: cat.examenes[0].id }] } });
  assert.equal(r.json.negocio.rif, 'J-12345678-9');
  assert.equal((await admin('/config', { method: 'PUT', body: { rif: 'J/123' } })).status, 400);
  assert.equal((await admin('/config', { method: 'PUT', body: { rif: '' } })).status, 200);
  assert.equal((await admin('/config')).json.config.rif, null);
});

test('límite de exámenes por categoría: solo uno, hasta N y sin límite', async () => {
  const cat = (await admin('/catalogo')).json;
  const hormonas = cat.categorias.find((k) => k.nombre === 'Hormonas');
  const deHormonas = cat.examenes.filter((e) => e.categoria_id === hormonas.id && e.activo).slice(0, 3);
  assert.equal(deHormonas.length, 3);
  const pedirTres = () => publico('/presupuesto', { method: 'POST', body: { items: deHormonas.map((e) => ({ tipo: 'examen', id: e.id })) } });

  assert.equal((await admin(`/categorias/${hormonas.id}`, { method: 'PUT', body: { max_examenes: 1 } })).status, 200);
  assert.equal((await publico('/catalogo')).json.categorias.find((k) => k.id === hormonas.id).max_examenes, 1);
  const uno = await pedirTres();
  assert.equal(uno.status, 409);
  assert.match(uno.json.error, /solo puedes elegir un examen/);

  await admin(`/categorias/${hormonas.id}`, { method: 'PUT', body: { max_examenes: 2 } });
  assert.match((await pedirTres()).json.error, /hasta 2 exámenes/);

  await admin(`/categorias/${hormonas.id}`, { method: 'PUT', body: { max_examenes: null } });
  assert.equal((await pedirTres()).status, 200);
  assert.equal((await admin(`/categorias/${hormonas.id}`, { method: 'PUT', body: { max_examenes: 500 } })).status, 400);
  // Al editar otra cosa, el límite no se pierde
  await admin(`/categorias/${hormonas.id}`, { method: 'PUT', body: { max_examenes: 3 } });
  await admin(`/categorias/${hormonas.id}`, { method: 'PUT', body: { orden: 7 } });
  assert.equal((await admin('/catalogo')).json.categorias.find((k) => k.id === hormonas.id).max_examenes, 3);
  await admin(`/categorias/${hormonas.id}`, { method: 'PUT', body: { max_examenes: null } });
});

test('borrar estadísticas hasta una fecha: cuenta, borra y los códigos no se repiten', async () => {
  const hoy = new Date(Date.now() - 4 * 3600_000).toISOString().slice(0, 10); // hora de Venezuela
  const sim = await admin('/datos/borrar', { method: 'POST', body: { hasta: hoy, simular: true } });
  assert.equal(sim.status, 200);
  assert.equal(sim.json.borrado, false);
  assert.ok(sim.json.presupuestos > 0 && sim.json.visitas > 0);
  const cat = (await publico('/catalogo')).json;
  const antes = await publico('/presupuesto', { method: 'POST', body: { items: [{ tipo: 'examen', id: cat.examenes[1].id }] } });
  const ultimo = Number(antes.json.codigo.slice(-6));

  const ok = await admin('/datos/borrar', { method: 'POST', body: { hasta: hoy } });
  assert.equal(ok.json.borrado, true);
  const desde = new Date(Date.now() - 60 * 86400_000).toISOString().slice(0, 10);
  const d = (await admin(`/dashboard?desde=${desde}&hasta=${hoy}`)).json;
  assert.equal(d.resumen.presupuestos, 0);
  assert.equal(d.resumen.visitas, 0);
  const despues = await publico('/presupuesto', { method: 'POST', body: { items: [{ tipo: 'examen', id: cat.examenes[1].id }] } });
  assert.equal(Number(despues.json.codigo.slice(-6)), ultimo + 1, 'el código sigue desde el último, no vuelve a 1');
  // El catálogo sigue intacto
  assert.equal((await publico('/catalogo')).json.examenes.length, cat.examenes.length);
});

test('borrar estadísticas: fechas no válidas y solo con sesión', async () => {
  assert.equal((await admin('/datos/borrar', { method: 'POST', body: { hasta: 'ayer' } })).status, 400);
  assert.equal((await admin('/datos/borrar', { method: 'POST', body: { hasta: '2999-01-01' } })).status, 400);
  assert.equal((await pedir('/demo/api/admin/datos/borrar', { method: 'POST', body: { hasta: '2020-01-01' }, conSesion: false })).status, 401);
});
