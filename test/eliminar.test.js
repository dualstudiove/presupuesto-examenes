// Eliminar un negocio: nombre exacto + contraseña del superadministrador; borra todos sus datos y nada más.
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
  if (conSesion) for (const c of r.headers.getSetCookie()) { const [par] = c.split(';'); const i = par.indexOf('='); jar[par.slice(0, i)] = par.slice(i + 1); }
  const texto = await r.text();
  let json = null;
  try { json = JSON.parse(texto); } catch { /* no es JSON */ }
  return { status: r.status, json, texto };
}

const TABLAS = ['configuracion_negocio', 'usuarios_admin', 'categorias', 'examenes', 'perfiles', 'origenes', 'presupuestos', 'presupuesto_items', 'presupuesto_examenes', 'visitas'];
const filasDe = async (nid) => {
  const out = {};
  for (const t of TABLAS) out[t] = (await D1.prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE negocio_id = ?`).bind(nid).first()).n;
  return out;
};

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
  assert.equal((await pedir('/api/login', { method: 'POST', body: { email: 'super@plataforma.test', password: 'Super12345' } })).status, 200);
});

after(() => server?.close());

test('eliminar un negocio exige su nombre exacto y la contraseña, y borra solo sus datos', async () => {
  const negocios = (await pedir('/api/super/negocios')).json.negocios;
  const demo = negocios.find((n) => n.slug === 'demo');
  const norte = negocios.find((n) => n.slug === 'norte');
  const antesNorte = await filasDe(norte.id);
  assert.ok((await filasDe(demo.id)).presupuestos > 0, 'demo tiene datos');

  const borrar = (body) => pedir(`/api/super/negocios/${demo.id}`, { method: 'DELETE', body });
  const malNombre = await borrar({ nombre: 'Laboratorio', password: 'Super12345' });
  assert.equal(malNombre.status, 400);
  assert.match(malNombre.json.error, /nombre/);
  const malaClave = await borrar({ nombre: 'Laboratorio Demo', password: 'otra' });
  assert.equal(malaClave.status, 400);
  assert.match(malaClave.json.error, /contraseña/);
  assert.equal((await pedir('/demo')).status, 200, 'sigue existiendo');

  const ok = await borrar({ nombre: '  Laboratorio Demo ', password: 'Super12345' });
  assert.equal(ok.status, 200, ok.texto);
  assert.deepEqual(Object.values(await filasDe(demo.id)), TABLAS.map(() => 0), 'no queda nada del negocio');
  assert.equal((await D1.prepare('SELECT COUNT(*) AS n FROM negocios WHERE id = ?').bind(demo.id).first()).n, 0);
  assert.equal((await pedir('/demo')).status, 404);
  assert.equal((await pedir('/demo/api/publico/catalogo')).status, 404);
  assert.deepEqual(await filasDe(norte.id), antesNorte, 'el otro negocio queda intacto');

  // La dirección queda libre
  const r = await pedir('/api/super/negocios', { method: 'POST', body: { nombre: 'Demo nuevo', slug: 'demo', admin_email: 'a@demo.test', admin_password: 'Nuevo12345' } });
  assert.equal(r.status, 200, r.texto);
});

test('eliminar: sin sesión no se puede y la contraseña se bloquea tras varios intentos', async () => {
  const norte = (await pedir('/api/super/negocios')).json.negocios.find((n) => n.slug === 'norte');
  assert.equal((await pedir(`/api/super/negocios/${norte.id}`, { method: 'DELETE', body: { nombre: 'Clínica Norte', password: 'Super12345' }, conSesion: false })).status, 401);
  let ultimo;
  for (let i = 0; i < 6; i++) ultimo = await pedir(`/api/super/negocios/${norte.id}`, { method: 'DELETE', body: { nombre: 'Clínica Norte', password: 'mala' } });
  assert.equal(ultimo.status, 429);
  assert.equal((await pedir(`/api/super/negocios/${norte.id}`, { method: 'DELETE', body: { nombre: 'Clínica Norte', password: 'Super12345' } })).status, 429, 'bloqueado aunque ahora acierte');
  assert.equal((await pedir('/norte')).status, 200);
});
