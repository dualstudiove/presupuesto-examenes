// La app sobre una base de datos completamente vacía (como la del sitio de pruebas):
// crea sus tablas sola y el superadministrador de las variables puede entrar y crear un negocio.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { crearEntorno, levantar } from './ayudas.js';
import { ESQUEMA_BASE } from '../src/esquema-base.js';

let server;
let port;
let D1;
const jar = {};

async function pedir(path, { method = 'GET', body } = {}) {
  const headers = { 'x-app': '1' };
  if (body) headers['content-type'] = 'application/json';
  if (Object.keys(jar).length) headers.cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
  const r = await fetch(`http://127.0.0.1:${port}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' });
  for (const c of r.headers.getSetCookie()) { const [par] = c.split(';'); const i = par.indexOf('='); jar[par.slice(0, i)] = par.slice(i + 1); }
  const texto = await r.text();
  let json = null;
  try { json = JSON.parse(texto); } catch { /* no es JSON */ }
  return { status: r.status, json, texto };
}

before(async () => {
  const bindings = await crearEntorno({ BASE_PATH: '/cotizalo', SUPER_EMAIL: 'pruebas@dualstudio.app', SUPER_PASSWORD: 'ClaveDePrueba123', DATOS_DE_EJEMPLO: 'true' }, { vacia: true });
  D1 = bindings.DB;
  const worker = (await import('../src/server.js')).default;
  ({ server, port } = await levantar(worker, bindings));
});

after(() => server?.close());

test('src/esquema-base.js es idéntico a migrations/0001_schema.sql', () => {
  assert.equal(ESQUEMA_BASE, fs.readFileSync(new URL('../migrations/0001_schema.sql', import.meta.url), 'utf8'));
});

test('con una base vacía, la app crea las tablas y deja entrar al superadministrador de las variables', async () => {
  const antes = (await D1.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table'").first()).n;
  assert.equal(antes, 0, 'la base empieza sin tablas');
  const login = await pedir('/cotizalo/api/login', { method: 'POST', body: { email: 'pruebas@dualstudio.app', password: 'ClaveDePrueba123' } });
  assert.equal(login.status, 200, login.texto);
  assert.equal(login.json.rol, 'super');
  const cols = (await D1.prepare('PRAGMA table_info(presupuesto_items)').all()).results.map((c) => c.name);
  assert.ok(cols.includes('cantidad'), 'también añade las columnas nuevas');
});

test('en la base nueva se crea un negocio y su app funciona', async () => {
  const r = await pedir('/cotizalo/api/super/negocios', { method: 'POST', body: { nombre: 'Laboratorio Pruebas', slug: 'pruebas', admin_email: 'admin@pruebas.test', admin_password: 'Pruebas12345' } });
  assert.equal(r.status, 200, r.texto);
  const cat = await pedir('/cotizalo/pruebas/api/publico/catalogo');
  assert.equal(cat.status, 200);
  assert.ok(cat.json.categorias.length > 0, 'trae las categorías base');
  assert.equal((await pedir('/cotizalo/pruebas')).status, 200);
});

test('negocio de ejemplo: se crea por pasos con catálogo, perfiles, Patología repetible y actividad', async () => {
  assert.equal((await pedir('/cotizalo/api/super/me')).json.ejemplo, true);
  let paso = { paso: 'negocio' };
  let ultimo;
  let pasos = 0;
  while (paso) {
    const r = await pedir('/cotizalo/api/super/ejemplo', { method: 'POST', body: paso });
    assert.equal(r.status, 200, r.texto);
    ultimo = r.json;
    paso = r.json.siguiente;
    pasos += 1;
    assert.ok(pasos <= 200, 'termina');
  }
  assert.equal(ultimo.hecho, ultimo.total);
  assert.equal(pasos, ultimo.total);
  const slug = ultimo.negocio.slug;
  assert.equal(slug, 'ejemplo');
  const cat = (await pedir(`/cotizalo/${slug}/api/publico/catalogo`)).json;
  assert.ok(cat.examenes.length >= 30);
  assert.equal(cat.perfiles.length, 4);
  assert.equal(cat.categorias.find((c) => c.nombre === 'Patología').max_por_examen, 3);
  const cfg = (await pedir(`/cotizalo/${slug}/api/publico/config`)).json;
  assert.equal(cfg.negocio.rif, 'J-00000000-0');
  const hasta = new Date(Date.now() - 4 * 3600_000).toISOString().slice(0, 10);
  const desde = new Date(Date.now() - 40 * 86400_000).toISOString().slice(0, 10);
  const d = (await pedir(`/cotizalo/${slug}/api/admin/dashboard?desde=${desde}&hasta=${hasta}`)).json;
  assert.ok(d.resumen.presupuestos >= 50, `presupuestos: ${d.resumen.presupuestos}`);
  assert.ok(d.resumen.visitas > 0);
  // Un segundo negocio de ejemplo toma otra dirección
  const otro = await pedir('/cotizalo/api/super/ejemplo', { method: 'POST', body: { paso: 'negocio' } });
  assert.equal(otro.json.negocio.slug, 'ejemplo-2');
});
