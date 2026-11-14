// La app montada bajo una ruta (BASE_PATH=/cotizalo), como en dualstudio.app/cotizalo.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { crearEntorno, levantar } from './ayudas.js';

let server;
let port;

const pedir = async (path, { method = 'GET', body, cookie } = {}) => {
  const headers = { 'x-app': '1' };
  if (body) headers['content-type'] = 'application/json';
  if (cookie) headers.cookie = cookie;
  const r = await fetch(`http://127.0.0.1:${port}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const texto = await r.text();
  let json = null;
  try { json = JSON.parse(texto); } catch { /* no es JSON */ }
  return { status: r.status, texto, json, headers: r.headers };
};

before(async () => {
  const bindings = await crearEntorno({ BASE_PATH: '/cotizalo/' }); // con barra final a propósito: se normaliza
  const { configurarEnv } = await import('../src/env.js');
  const { bindD1 } = await import('@dualstudio/comun/servidor');
  configurarEnv(bindings);
  bindD1(bindings.DB);
  const { sembrar } = await import('../src/seed.js');
  await sembrar({ demo: true });
  const worker = (await import('../src/server.js')).default;
  ({ server, port } = await levantar(worker, bindings));
});

after(() => server?.close());

test('BASE_PATH se normaliza y rechaza valores raros', async () => {
  const { normalizarBase } = await import('../src/env.js');
  assert.equal(normalizarBase('/cotizalo/'), '/cotizalo');
  assert.equal(normalizarBase('cotizalo'), '/cotizalo');
  assert.equal(normalizarBase('/'), '');
  assert.equal(normalizarBase(undefined), '');
  assert.throws(() => normalizarBase('/co tiza'));
});

test('las páginas y la API viven bajo la base', async () => {
  assert.match((await pedir('/cotizalo')).texto, /js\/inicio\.js/);
  assert.match((await pedir('/cotizalo/demo')).texto, /<div id="app">/);
  assert.match((await pedir('/cotizalo/demo/admin')).texto, /<div id="root">/);
  assert.match((await pedir('/cotizalo/super')).texto, /<div id="root">/);
  const cat = await pedir('/cotizalo/demo/api/publico/catalogo');
  assert.equal(cat.status, 200);
  assert.ok(cat.json.examenes.length > 0);
  assert.equal((await pedir('/cotizalo/css/app.css')).status, 200);
  assert.equal((await pedir('/cotizalo/js/common.js')).status, 200);
});

test('fuera de la base: la raíz redirige y lo demás no es de esta app', async () => {
  const raiz = await pedir('/');
  assert.equal(raiz.status, 302);
  assert.equal(raiz.headers.get('location'), '/cotizalo');
  assert.equal((await pedir('/demo')).status, 404);
  assert.equal((await pedir('/api/publico/catalogo')).status, 404);
  assert.equal((await pedir('/planifica')).status, 404);
  assert.equal((await pedir('/cotizalo-otra')).status, 404);
});

test('las redirecciones conservan la base', async () => {
  const a = await pedir('/cotizalo/');
  assert.equal(a.status, 301);
  assert.equal(a.headers.get('location'), '/cotizalo');
  const b = await pedir('/cotizalo/Demo/');
  assert.equal(b.status, 301);
  assert.equal(b.headers.get('location'), '/cotizalo/demo');
});

test('los HTML enlazan sus archivos con la base', async () => {
  const html = (await pedir('/cotizalo/demo')).texto;
  assert.match(html, /href="\/cotizalo\/css\/app\.css"/);
  assert.match(html, /src="\/cotizalo\/js\/app\.js"/);
  assert.ok(!/(href|src)="\/(css|js|img)\//.test(html), 'no quedan rutas sin base');
  assert.match(html, /fonts\.googleapis\.com/, 'los enlaces externos no se tocan');
  const msg = (await pedir('/cotizalo/noexiste')).texto;
  assert.match(msg, /href="\/cotizalo\/css\/app\.css"/);
});

test('las cookies de sesión quedan dentro de la base (no se mezclan con otras apps del dominio)', async () => {
  const a = await pedir('/cotizalo/demo/api/admin/login', { method: 'POST', body: { email: 'admin@demo.test', password: 'Demo12345' } });
  assert.equal(a.status, 200);
  assert.match(a.headers.get('set-cookie'), /^sid_admin=[^;]+;.*Path=\/cotizalo\/demo;/);
  const s = await pedir('/cotizalo/api/super/login', { method: 'POST', body: { email: 'super@plataforma.test', password: 'Super12345' } });
  assert.equal(s.status, 200);
  assert.match(s.headers.get('set-cookie'), /Path=\/cotizalo;/);
  const cookie = s.headers.get('set-cookie').split(';')[0];
  const lista = await pedir('/cotizalo/api/super/negocios', { cookie });
  assert.equal(lista.status, 200);
  assert.equal(lista.json.base_path, '/cotizalo');
});
