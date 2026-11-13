// Inicio de sesión único en la página principal y el superadministrador con acceso a todo.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { crearEntorno, levantar } from './ayudas.js';

let server;
let port;

/** Petición con un "frasco" de cookies opcional ({}: se rellena con las que lleguen). */
async function pedir(path, { method = 'GET', body, jar } = {}) {
  const headers = { 'x-app': '1' };
  if (body) headers['content-type'] = 'application/json';
  if (jar && Object.keys(jar).length) headers.cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
  const r = await fetch(`http://127.0.0.1:${port}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const cookies = r.headers.getSetCookie();
  if (jar) for (const c of cookies) { const [par] = c.split(';'); const i = par.indexOf('='); jar[par.slice(0, i)] = par.slice(i + 1); }
  const texto = await r.text();
  let json = null;
  try { json = JSON.parse(texto); } catch { /* no es JSON */ }
  return { status: r.status, json, texto, cookies };
}

const login = (email, password, jar = {}) => pedir('/cotizalo/api/login', { method: 'POST', body: { email, password }, jar });

before(async () => {
  const bindings = await crearEntorno({ BASE_PATH: '/cotizalo' });
  const { configurarEnv } = await import('../src/env.js');
  const { bindD1 } = await import('../src/db.js');
  configurarEnv(bindings);
  bindD1(bindings.DB);
  const { sembrar } = await import('../src/seed.js');
  await sembrar({ demo: true });
  const worker = (await import('../src/server.js')).default;
  ({ server, port } = await levantar(worker, bindings));
});

after(() => server?.close());

test('la página principal es el inicio de sesión', async () => {
  const r = await pedir('/cotizalo');
  assert.equal(r.status, 200);
  assert.match(r.texto, /id="f"/);
  assert.match(r.texto, /src="\/cotizalo\/js\/inicio\.js"/);
});

test('el superadministrador entra a su panel', async () => {
  const jar = {};
  const r = await login('SUPER@plataforma.test', 'Super12345', jar);
  assert.equal(r.status, 200, r.texto);
  assert.deepEqual(r.json, { rol: 'super', destino: '/cotizalo/super' });
  assert.ok(r.cookies.some((c) => /^sid_super=.+Path=\/cotizalo;/.test(c)));
  assert.equal((await pedir('/cotizalo/api/sesion', { jar })).json.super.destino, '/cotizalo/super');
  assert.equal((await pedir('/cotizalo/api/sesion')).json.super, null);
});

test('el administrador entra a su negocio', async () => {
  const r = await login('admin@demo.test', 'Demo12345');
  assert.equal(r.status, 200, r.texto);
  assert.equal(r.json.rol, 'admin');
  assert.equal(r.json.destino, '/cotizalo/demo/admin');
  assert.deepEqual(r.json.negocios.map((n) => n.slug), ['demo']);
  assert.ok(r.cookies.some((c) => /^sid_admin=.+Path=\/cotizalo\/demo;/.test(c)));
});

test('datos incorrectos: mismo mensaje exista o no el correo', async () => {
  const a = await login('admin@demo.test', 'mala-clave');
  const b = await login('nadie@ningun.sitio', 'mala-clave');
  assert.equal(a.status, 401);
  assert.equal(b.status, 401);
  assert.equal(a.json.error, b.json.error);
  assert.equal((await login('', '')).status, 400);
});

test('un correo que administra varios negocios elige a cuál entrar', async () => {
  const sup = {};
  await login('super@plataforma.test', 'Super12345', sup);
  const negocios = (await pedir('/cotizalo/api/super/negocios', { jar: sup })).json.negocios;
  const norte = negocios.find((n) => n.slug === 'norte');
  // Mismo correo y contraseña que el administrador de demo, ahora también en norte
  const r0 = await pedir(`/cotizalo/api/super/negocios/${norte.id}/admin`, { method: 'POST', body: { email: 'admin@demo.test', password: 'Demo12345' }, jar: sup });
  assert.equal(r0.status, 200, r0.texto);
  const r = await login('admin@demo.test', 'Demo12345');
  assert.equal(r.json.rol, 'admin');
  assert.equal(r.json.destino, null);
  assert.deepEqual(r.json.negocios.map((n) => n.slug).sort(), ['demo', 'norte']);
  assert.equal(r.cookies.filter((c) => c.startsWith('sid_admin=')).length, 2);
});

test('el superadministrador administra cualquier negocio sin su contraseña', async () => {
  const jar = {};
  await login('super@plataforma.test', 'Super12345', jar);
  const me = await pedir('/cotizalo/norte/api/admin/me', { jar });
  assert.equal(me.status, 200, me.texto);
  assert.equal(me.json.super, true);
  assert.equal((await pedir('/cotizalo/norte/api/admin/catalogo', { jar })).status, 200);
  const cfg = await pedir('/cotizalo/norte/api/admin/config', { method: 'PUT', body: { telefono: '0212-000-0000' }, jar });
  assert.equal(cfg.status, 200, cfg.texto);
  // No tiene contraseña de negocio que cambiar
  assert.equal((await pedir('/cotizalo/norte/api/admin/password', { method: 'POST', body: { actual: 'x', nueva: 'NuevaClave123' }, jar })).status, 403);
  // Sin sesión, nada
  assert.equal((await pedir('/cotizalo/norte/api/admin/catalogo')).status, 401);
});

test('un negocio suspendido solo lo ve el superadministrador', async () => {
  const sup = {};
  await login('super@plataforma.test', 'Super12345', sup);
  const negocios = (await pedir('/cotizalo/api/super/negocios', { jar: sup })).json.negocios;
  const demo = negocios.find((n) => n.slug === 'demo');
  await pedir(`/cotizalo/api/super/negocios/${demo.id}`, { method: 'PUT', body: { activo: false }, jar: sup });
  try {
    assert.equal((await pedir('/cotizalo/demo')).status, 403);
    assert.equal((await pedir('/cotizalo/demo/api/publico/catalogo')).status, 403);
    assert.equal((await pedir('/cotizalo/demo/admin')).status, 403);
    assert.equal((await pedir('/cotizalo/demo', { jar: sup })).status, 200);
    assert.equal((await pedir('/cotizalo/demo/admin', { jar: sup })).status, 200);
    assert.equal((await pedir('/cotizalo/demo/api/publico/catalogo', { jar: sup })).status, 200);
    assert.equal((await pedir('/cotizalo/demo/api/admin/me', { jar: sup })).json.negocio.activo, false);
  } finally {
    await pedir(`/cotizalo/api/super/negocios/${demo.id}`, { method: 'PUT', body: { activo: true }, jar: sup });
  }
});

test('el administrador de un negocio suspendido recibe un aviso claro', async () => {
  const sup = {};
  await login('super@plataforma.test', 'Super12345', sup);
  const norte = (await pedir('/cotizalo/api/super/negocios', { jar: sup })).json.negocios.find((n) => n.slug === 'norte');
  await pedir(`/cotizalo/api/super/negocios/${norte.id}`, { method: 'PUT', body: { activo: false }, jar: sup });
  try {
    const r = await login('admin@norte.test', 'Norte12345');
    assert.equal(r.status, 403);
    assert.match(r.json.error, /suspendido/);
  } finally {
    await pedir(`/cotizalo/api/super/negocios/${norte.id}`, { method: 'PUT', body: { activo: true }, jar: sup });
  }
});
