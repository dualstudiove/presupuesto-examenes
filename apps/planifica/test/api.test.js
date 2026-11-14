// Planifica: cuentas, papeles, aislamiento entre clientes, publicaciones, objetivos, imágenes e importación.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { crearD1Local } from '@dualstudio/comun/servidor/d1-local';
import { olvidarCacheDeSecretos } from '@dualstudio/comun/servidor';
import worker from '../src/server.js';

const bindings = {
  DB: crearD1Local(':memory:'),
  SESSION_SECRET: 'secreto-de-prueba-secreto-de-prueba-123',
  BASE_PATH: '/planifica',
  SUPER_EMAIL: 'admin@dualstudio.app',
  SUPER_PASSWORD: 'AdminDePrueba1',
};

/** Navegador mínimo con cookies. */
function navegador() {
  const jar = {};
  return async function pedir(ruta, { method = 'GET', body, headers = {} } = {}) {
    const h = { 'x-app': '1', ...headers };
    if (body !== undefined) h['content-type'] = 'application/json';
    if (Object.keys(jar).length) h.cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
    const res = await worker.fetch(new Request(`http://localhost/planifica${ruta}`, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined }), bindings, { waitUntil: () => {} });
    for (const c of res.headers.getSetCookie()) { const [par] = c.split(';'); const i = par.indexOf('='); jar[par.slice(0, i)] = par.slice(i + 1); }
    const tipo = res.headers.get('content-type') || '';
    return { status: res.status, json: tipo.includes('json') ? await res.json() : null, res };
  };
}

const admin = navegador();
const editora = navegador();
const lectora = navegador();
const ajena = navegador();
let ids = {};

before(async () => {
  olvidarCacheDeSecretos();
  assert.equal((await admin('/api/login', { method: 'POST', body: { email: 'admin@dualstudio.app', password: 'AdminDePrueba1' } })).status, 200);
  const a = await admin('/api/admin/clientes', { method: 'POST', body: { nombre: 'Laboratorio RH', handle: 'laboratoriorh' } });
  const b = await admin('/api/admin/clientes', { method: 'POST', body: { nombre: 'Café Ávila' } });
  ids.a = a.json.id;
  ids.b = b.json.id;
  assert.equal(a.json.slug, 'laboratorio-rh');
  assert.equal(b.json.slug, 'cafe-avila');
  for (const [k, email] of [['ed', 'ana@x.co'], ['lec', 'luis@x.co'], ['otra', 'otra@x.co']]) {
    ids[k] = (await admin('/api/admin/usuarios', { method: 'POST', body: { email, nombre: k, password: 'Clave12345' } })).json.id;
  }
  await admin('/api/admin/accesos', { method: 'PUT', body: { usuario_id: ids.ed, cliente_id: ids.a, rol: 'editor' } });
  await admin('/api/admin/accesos', { method: 'PUT', body: { usuario_id: ids.lec, cliente_id: ids.a, rol: 'lector' } });
  await admin('/api/admin/accesos', { method: 'PUT', body: { usuario_id: ids.otra, cliente_id: ids.b, rol: 'editor' } });
  await editora('/api/login', { method: 'POST', body: { email: 'ana@x.co', password: 'Clave12345' } });
  await lectora('/api/login', { method: 'POST', body: { email: 'luis@x.co', password: 'Clave12345' } });
  await ajena('/api/login', { method: 'POST', body: { email: 'otra@x.co', password: 'Clave12345' } });
});

test('hay que iniciar sesión para todo', async () => {
  const anon = navegador();
  assert.deepEqual((await anon('/api/sesion')).json, { usuario: null });
  assert.equal((await anon('/laboratorio-rh/api/datos')).status, 401);
  assert.equal((await anon('/api/admin/resumen')).status, 401);
  assert.equal((await anon('/api/login', { method: 'POST', body: { email: 'ana@x.co', password: 'mala' } })).status, 401);
});

test('con un solo cliente se entra directo; el administrador elige', async () => {
  const n = navegador();
  const r = await n('/api/login', { method: 'POST', body: { email: 'ana@x.co', password: 'Clave12345' } });
  assert.equal(r.json.destino, '/planifica/laboratorio-rh');
  const s = await admin('/api/sesion');
  assert.equal(s.json.usuario.es_admin, true);
  assert.equal(s.json.clientes.length, 2);
  assert.equal(s.json.secretos_recuperacion, true);
});

test('cada quien ve solo sus clientes', async () => {
  assert.equal((await editora('/laboratorio-rh/api/datos')).status, 200);
  assert.equal((await editora('/cafe-avila/api/datos')).status, 404, 'sin acceso: no se revela que existe');
  assert.equal((await ajena('/laboratorio-rh/api/datos')).status, 404);
  assert.equal((await editora('/api/admin/resumen')).status, 403);
  const s = await lectora('/api/sesion');
  assert.deepEqual(s.json.clientes.map((c) => [c.slug, c.rol]), [['laboratorio-rh', 'lector']]);
});

test('publicaciones: crear, cambiar, ver cambios y borrar', async () => {
  const c = await editora('/laboratorio-rh/api/publicaciones', { method: 'POST', body: { id: 'pprueba01', datos: { title: 'Reel de bienvenida', format: 'reel', platforms: ['ig', 'tt'], date: '2026-11-20', status: 'idea', createdBy: 'falso' } } });
  assert.equal(c.status, 200);
  assert.equal(c.json.id, 'pprueba01');
  const d1 = await editora('/laboratorio-rh/api/datos');
  const p = d1.json.publicaciones.find((x) => x.id === 'pprueba01');
  assert.equal(p.title, 'Reel de bienvenida');
  assert.equal(p.createdBy, ids.ed, 'el autor lo pone el servidor');
  assert.equal(d1.json.nombres[ids.ed], 'ed');
  assert.equal((await editora(`/laboratorio-rh/api/datos?desde=${d1.json.version}`)).json.sin_cambios, true);
  assert.equal((await editora('/laboratorio-rh/api/publicaciones/pprueba01', { method: 'PATCH', body: { cambios: { status: 'listo', copy: 'Hola' } } })).status, 200);
  const d2 = await editora(`/laboratorio-rh/api/datos?desde=${d1.json.version}`);
  assert.equal(d2.json.sin_cambios, undefined);
  assert.equal(d2.json.publicaciones.find((x) => x.id === 'pprueba01').status, 'listo');
  assert.equal((await editora('/laboratorio-rh/api/publicaciones/pprueba01', { method: 'POST', body: {} })).status, 404);
  assert.equal((await editora('/laboratorio-rh/api/publicaciones', { method: 'POST', body: { id: 'pprueba01', datos: {} } })).status, 409);
  assert.equal((await editora('/laboratorio-rh/api/publicaciones/noexiste1', { method: 'PATCH', body: { cambios: { title: 'x' } } })).status, 404);
  assert.equal((await editora('/laboratorio-rh/api/publicaciones/pprueba01', { method: 'DELETE' })).status, 200);
  assert.equal((await editora('/laboratorio-rh/api/datos')).json.publicaciones.length, 0);
});

test('validación de publicaciones', async () => {
  const mal = (datos) => editora('/laboratorio-rh/api/publicaciones', { method: 'POST', body: { datos } });
  assert.equal((await mal({ format: 'tiktokdance' })).status, 400);
  assert.equal((await mal({ status: 'casi' })).status, 400);
  assert.equal((await mal({ platforms: ['fb'] })).status, 400);
  assert.equal((await mal({ date: 'mañana' })).status, 400);
  assert.equal((await mal({ copy: 'x'.repeat(20_001) })).status, 400);
  assert.equal((await editora('/laboratorio-rh/api/publicaciones', { method: 'POST', body: { id: '../x', datos: {} } })).status, 400);
  const ok = await mal({ title: 'Campo desconocido se ignora', inventado: 1 });
  const d = await editora('/laboratorio-rh/api/datos');
  assert.equal(d.json.publicaciones.find((x) => x.id === ok.json.id).inventado, undefined);
});

test('solo lectura no puede escribir nada', async () => {
  assert.equal((await lectora('/laboratorio-rh/api/datos')).json.rol, 'lector');
  assert.equal((await lectora('/laboratorio-rh/api/publicaciones', { method: 'POST', body: { datos: { title: 'x' } } })).status, 403);
  assert.equal((await lectora('/laboratorio-rh/api/objetivos/m-2026-11', { method: 'PATCH', body: { cambios: { theme: 'x' } } })).status, 403);
  assert.equal((await lectora('/laboratorio-rh/api/ajustes', { method: 'PATCH', body: { handle: '@x' } })).status, 403);
  assert.equal((await lectora('/laboratorio-rh/api/imagenes', { method: 'POST', body: { tipo: 'image/webp', datos: 'AAAA' } })).status, 403);
});

test('objetivos y ajustes', async () => {
  assert.equal((await editora('/laboratorio-rh/api/objetivos/m-2026-11', { method: 'PATCH', body: { cambios: { theme: 'Trending', postTarget: 8 } } })).status, 200);
  assert.equal((await editora('/laboratorio-rh/api/objetivos/m-2026-11', { method: 'PATCH', body: { cambios: { objectives: 'Uno\nDos' } } })).status, 200);
  assert.equal((await editora('/laboratorio-rh/api/objetivos/q-2026-4', { method: 'PATCH', body: { cambios: { metrics: { ig: [{ id: 'm1', name: 'Seguidores', cur: 1, tar: 2, real: [1, null, null] }] } } } })).status, 200);
  assert.equal((await editora('/laboratorio-rh/api/objetivos/x-2026', { method: 'PATCH', body: { cambios: {} } })).status, 400);
  assert.equal((await editora('/laboratorio-rh/api/ajustes', { method: 'PATCH', body: { handle: '@labrh' } })).status, 200);
  const d = await editora('/laboratorio-rh/api/datos');
  const m = d.json.objetivos.find((g) => g.id === 'm-2026-11');
  assert.deepEqual([m.theme, m.postTarget, m.objectives], ['Trending', 8, 'Uno\nDos']);
  assert.equal(d.json.ajustes.handle, '@labrh');
});

// WebP mínimo de 1x1 (válido) en base64
const WEBP = 'UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=';

test('imágenes: subir, ver (solo su cliente), tope y se borran con su publicación', async () => {
  const s = await editora('/laboratorio-rh/api/imagenes', { method: 'POST', body: { datos: `data:image/webp;base64,${WEBP}` } });
  assert.equal(s.status, 200);
  const img = await editora(`/laboratorio-rh/api/imagenes/${s.json.id}`);
  assert.equal(img.status, 200);
  assert.equal(img.res.headers.get('content-type'), 'image/webp');
  assert.match(img.res.headers.get('cache-control'), /immutable/);
  assert.equal((await img.res.arrayBuffer()).byteLength, Buffer.from(WEBP, 'base64').length);
  assert.equal((await ajena(`/cafe-avila/api/imagenes/${s.json.id}`)).status, 404, 'otro cliente no la ve');
  assert.equal((await editora('/laboratorio-rh/api/imagenes', { method: 'POST', body: { datos: 'data:text/html;base64,PGI+' } })).status, 400);
  const p = await editora('/laboratorio-rh/api/publicaciones', { method: 'POST', body: { datos: { title: 'Con imagen', refImgs: [{ id: s.json.id }] } } });
  const r = await admin('/api/admin/resumen');
  assert.ok(r.json.clientes.find((c) => c.id === ids.a).uso_bytes > 0);
  await editora(`/laboratorio-rh/api/publicaciones/${p.json.id}`, { method: 'DELETE' });
  assert.equal((await editora(`/laboratorio-rh/api/imagenes/${s.json.id}`)).status, 404);
});

test('cerrar sesión en los demás dispositivos y desactivar a alguien', async () => {
  const otra = navegador();
  await otra('/api/login', { method: 'POST', body: { email: 'ana@x.co', password: 'Clave12345' } });
  assert.equal((await editora('/api/cuenta/sesiones/cerrar', { method: 'POST' })).status, 200);
  assert.equal((await editora('/laboratorio-rh/api/datos')).status, 200);
  assert.equal((await otra('/laboratorio-rh/api/datos')).status, 401);
  assert.equal((await admin('/api/admin/usuarios/' + ids.lec, { method: 'PUT', body: { activo: false } })).status, 200);
  assert.equal((await lectora('/laboratorio-rh/api/datos')).status, 401);
  assert.equal((await admin(`/api/admin/usuarios/${ids.lec}`, { method: 'PUT', body: { activo: true } })).status, 200);
  assert.equal((await admin('/api/admin/usuarios/' + (await admin('/api/sesion')).json.usuario.id, { method: 'PUT', body: { es_admin: false } })).status, 400);
});

test('un cliente archivado solo lo ve el administrador', async () => {
  await admin(`/api/admin/clientes/${ids.b}`, { method: 'PUT', body: { activo: false } });
  assert.equal((await ajena('/cafe-avila/api/datos')).status, 404);
  assert.equal((await admin('/cafe-avila/api/datos')).status, 200);
  await admin(`/api/admin/clientes/${ids.b}`, { method: 'PUT', body: { activo: true } });
});

test('importar una Parrilla de Contenido', async () => {
  const datos = {
    formato: 'parrilla-v1',
    cuenta: { handle: '@cafeavila' },
    posts: [{ id: 'pmwbjh2fw758u', title: 'Nuestras mascoticas', format: 'reel', platforms: ['ig', 'tt'], date: '2026-11-13', status: 'porproducir', refImgs: [{ id: 'abc123' }], createdAt: 1794366481820, createdBy: 'u_x' }],
    goals: [{ id: 'm-2026-11', theme: 'Contenido trending', postTarget: 8 }, { id: 'raro', theme: 'x' }],
    imagenes: [{ id: 'abc123', tipo: 'image/webp', datos: WEBP }],
  };
  const r = await admin('/api/admin/importar', { method: 'POST', body: { cliente_id: ids.b, datos } });
  assert.deepEqual(r.json, { publicaciones: 1, objetivos: 1, imagenes: 1 });
  const d = await ajena('/cafe-avila/api/datos');
  const p = d.json.publicaciones[0];
  assert.equal(p.title, 'Nuestras mascoticas');
  assert.notEqual(p.refImgs[0].id, 'abc123', 'la imagen recibe un id nuevo');
  assert.equal((await ajena(`/cafe-avila/api/imagenes/${p.refImgs[0].id}`)).status, 200);
  assert.equal(d.json.ajustes.handle, '@cafeavila');
  assert.equal((await admin('/api/admin/importar', { method: 'POST', body: { cliente_id: ids.b, datos: { formato: 'otro' } } })).status, 400);
});

test('borrar un cliente pide su nombre exacto y se lleva todo lo suyo', async () => {
  assert.equal((await admin(`/api/admin/clientes/${ids.b}`, { method: 'DELETE', body: { nombre: 'Cafe' } })).status, 400);
  assert.equal((await admin(`/api/admin/clientes/${ids.b}`, { method: 'DELETE', body: { nombre: 'Café Ávila' } })).status, 200);
  const n = await bindings.DB.prepare('SELECT COUNT(*) AS n FROM imagenes WHERE cliente_id = ?').bind(ids.b).first();
  assert.equal(n.n, 0);
});

test('páginas: inicio, admin, parrilla y direcciones reservadas', async () => {
  const anon = navegador();
  const r = await anon('/Laboratorio-RH');
  assert.equal(r.status, 301);
  assert.equal(r.res.headers.get('location'), '/planifica/laboratorio-rh');
  assert.equal((await anon('/api')).status, 404);
});
