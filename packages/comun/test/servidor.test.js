// Pruebas de @dualstudio/comun/servidor: configuración, contraseñas, sesiones, utilidades,
// esquema, topes diarios y crearServidor() (montaje, CSRF, errores y cabeceras).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  env, configurarEnv, normalizarBase, hashPassword, verifyPassword, HASH_RELLENO, firmarToken, leerToken,
  parseCookies, cookie, igualesTexto, csv, escHtml, parteFecha, crearEsquema, cuotaDiaria, cuotaDeHoy,
  leerAjuste, guardarAjuste, bindD1, db, Router, HttpError, Raw, crearServidor,
} from '../servidor/index.js';
import { crearD1Local } from '../servidor/d1-local.js';

const SECRETO = 'secreto-de-prueba-secreto-de-prueba-123';

test('SESSION_SECRET es obligatorio salvo en desarrollo', () => {
  assert.throws(() => configurarEnv({}), /Falta el secreto SESSION_SECRET/);
  assert.throws(() => configurarEnv({ ENVIRONMENT: 'production' }), /Falta el secreto/);
  assert.throws(() => configurarEnv({ SESSION_SECRET: 'corto' }), /demasiado corto/);
  configurarEnv({ ENVIRONMENT: 'development' });
  assert.ok(env.sessionSecret.length >= 32);
  assert.equal(env.cookieSecure, false);
  configurarEnv({ SESSION_SECRET: SECRETO });
  assert.equal(env.production, true);
  assert.equal(env.cookieSecure, true);
});

test('las variables propias de la app se añaden al mismo env', () => {
  configurarEnv({ SESSION_SECRET: SECRETO, MI_VAR: 'x' }, (b, e) => { e.miVar = b.MI_VAR; });
  assert.equal(env.miVar, 'x');
});

test('BASE_PATH se normaliza y se valida', () => {
  assert.equal(normalizarBase('/cotizalo/'), '/cotizalo');
  assert.equal(normalizarBase('planifica'), '/planifica');
  assert.equal(normalizarBase(''), '');
  assert.equal(normalizarBase('/'), '');
  assert.throws(() => normalizarBase('/a b'), /no válido/);
});

test('contraseñas: formato s2 (100 000) y s3 (iteraciones propias)', async () => {
  configurarEnv({ SESSION_SECRET: SECRETO });
  const h = await hashPassword('Clave12345');
  assert.match(h, /^s2\$/);
  assert.equal(await verifyPassword('Clave12345', h), true);
  assert.equal(await verifyPassword('otra', h), false);
  configurarEnv({ SESSION_SECRET: SECRETO, PBKDF2_ITER: '20000' });
  const h3 = await hashPassword('Clave12345');
  assert.match(h3, /^s3\$20000\$/);
  assert.equal(await verifyPassword('Clave12345', h3), true);
  assert.equal(await verifyPassword('Clave12345', h), true, 'los hashes anteriores siguen valiendo');
  assert.equal(await verifyPassword('x', HASH_RELLENO), false);
  assert.equal(await verifyPassword('x', 's3$5$00$00'), false, 'no acepta iteraciones absurdas');
  assert.equal(await verifyPassword('x', 'basura'), false);
  configurarEnv({ SESSION_SECRET: SECRETO });
});

test('sesiones firmadas: válidas, alteradas, vencidas y con otro secreto', () => {
  configurarEnv({ SESSION_SECRET: SECRETO });
  const t = firmarToken({ uid: 'u1', sv: 3 });
  assert.equal(leerToken(t).uid, 'u1');
  assert.equal(leerToken(t).sv, 3);
  const [body, sig] = t.split('.');
  const otro = Buffer.from(JSON.stringify({ uid: 'admin', exp: 9e9 })).toString('base64url');
  assert.equal(leerToken(`${otro}.${sig}`), null);
  assert.equal(leerToken(`${body}.x${sig.slice(1)}`), null);
  assert.equal(leerToken(firmarToken({ uid: 'u1' }, -10)), null);
  assert.equal(leerToken(undefined), null);
  configurarEnv({ SESSION_SECRET: `${SECRETO}-distinto` });
  assert.equal(leerToken(t), null);
  configurarEnv({ SESSION_SECRET: SECRETO });
});

test('cookies: una mal codificada se ignora; las nuevas van limitadas a la ruta de la app', () => {
  assert.deepEqual(parseCookies('a=1; b=%E0%A4%A; c=%20x'), { a: '1', c: ' x' });
  configurarEnv({ SESSION_SECRET: SECRETO, BASE_PATH: '/planifica' });
  const c = cookie('sid', 'v');
  assert.match(c, /Path=\/planifica/);
  assert.match(c, /HttpOnly/);
  assert.match(c, /SameSite=Lax/);
  assert.match(c, /Secure/);
  configurarEnv({ SESSION_SECRET: SECRETO });
});

test('igualesTexto compara en tiempo constante sin fallar con largos distintos', () => {
  assert.equal(igualesTexto('abc', 'abc'), true);
  assert.equal(igualesTexto('abc', 'abd'), false);
  assert.equal(igualesTexto('abc', 'abcd'), false);
  assert.equal(igualesTexto(undefined, ''), true);
});

test('CSV: evita fórmulas de Excel y escapa separadores', () => {
  const s = csv([{ a: '=1+1', b: 'x;y' }, { a: '-5', b: '+cmd' }], [{ titulo: 'A', valor: 'a' }, { titulo: 'B', valor: 'b' }]);
  assert.ok(s.startsWith('﻿'));
  assert.match(s, /'=1\+1/);
  assert.match(s, /"x;y"/);
  assert.match(s, /-5;'\+cmd/);
});

test('escHtml y fechas en el huso de la app', () => {
  assert.equal(escHtml('<a href="x">\'&'), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;');
  configurarEnv({ SESSION_SECRET: SECRETO, TZ_OFFSET_MIN: '-240' });
  assert.deepEqual(parteFecha(new Date('2026-01-02T02:30:00Z')), { dia: '2026-01-01', hora: 22, dow: 4 });
});

test('esquema: crea base, tablas comunes y columnas nuevas, una sola vez', async () => {
  const d1 = crearD1Local(':memory:');
  bindD1(d1);
  const asegurar = crearEsquema({
    base: 'CREATE TABLE IF NOT EXISTS cosas (id TEXT PRIMARY KEY); -- comentario; con punto y coma',
    testigo: 'cosas',
    columnas: [['cosas', 'nombre', 'TEXT'], ['cosas', 'n', 'INTEGER NOT NULL DEFAULT 0']],
  });
  await asegurar(d1);
  await asegurar(d1);
  const cols = (await db.all('PRAGMA table_info(cosas)')).map((c) => c.name);
  assert.deepEqual(cols, ['id', 'nombre', 'n']);
  assert.ok((await db.all('PRAGMA table_info(_cuotas)')).length);
  assert.ok((await db.all('PRAGMA table_info(_ajustes)')).length);
});

test('topes diarios en la base y ajustes', async () => {
  const d1 = crearD1Local(':memory:');
  bindD1(d1);
  await crearEsquema({})(d1);
  configurarEnv({ SESSION_SECRET: SECRETO });
  assert.equal(await cuotaDiaria('x', 2), 1);
  assert.equal(await cuotaDiaria('x', 2), 2);
  await assert.rejects(cuotaDiaria('x', 2, 'Basta por hoy.'), (e) => e instanceof HttpError && e.status === 429 && e.message === 'Basta por hoy.');
  assert.equal(await cuotaDeHoy('x'), 3);
  assert.equal(await cuotaDeHoy('otra'), 0);
  assert.equal(await leerAjuste('k'), null);
  await guardarAjuste('k', 'v1');
  await guardarAjuste('k', 'v2');
  assert.equal(await leerAjuste('k'), 'v2');
});

// ── crearServidor() ──
function servidorDePrueba() {
  const router = new Router();
  router.add('GET', '/api/hola', async ({ query }) => ({ hola: query.n || 'mundo' }));
  router.add('POST', '/api/eco', async ({ body }) => ({ eco: body }));
  router.add('GET', '/api/error', async () => { throw new HttpError(418, 'Soy una tetera <b>'); });
  router.add('GET', '/api/roto', async () => { throw new Error('detalle interno'); });
  router.add('GET', '/api/csv', async () => new Raw('a;b\n', 'text/csv'));
  router.add('GET', '/api/privado', { auth: async () => { throw new HttpError(401, 'Inicia sesión.'); } }, async () => ({}));
  return crearServidor({ router, configurar: (b) => configurarEnv(b) });
}
const BINDINGS = { SESSION_SECRET: SECRETO, BASE_PATH: '/planifica' };
const pedir = (srv, ruta, init = {}, bindings = BINDINGS) =>
  srv.fetch(new Request(`http://localhost${ruta}`, init), bindings, { waitUntil: () => {} });

test('crearServidor monta la app bajo BASE_PATH', async () => {
  const srv = servidorDePrueba();
  const r = await pedir(srv, '/planifica/api/hola?n=Ana');
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { hola: 'Ana' });
  assert.equal((await pedir(srv, '/api/hola')).status, 404, 'fuera de la base no es de esta app');
  const raiz = await pedir(srv, '/', { redirect: 'manual' });
  assert.equal(raiz.status, 302);
  assert.equal(raiz.headers.get('location'), '/planifica');
  assert.equal((await pedir(srv, '/planifica/')).headers.get('location'), '/planifica');
});

test('crearServidor exige la cabecera x-app en lo que no es GET (CSRF) y JSON', async () => {
  const srv = servidorDePrueba();
  const sin = await pedir(srv, '/planifica/api/eco', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"a":1}' });
  assert.equal(sin.status, 403);
  const con = await pedir(srv, '/planifica/api/eco', { method: 'POST', headers: { 'content-type': 'application/json', 'x-app': '1' }, body: '{"a":1}' });
  assert.deepEqual(await con.json(), { eco: { a: 1 } });
  const texto = await pedir(srv, '/planifica/api/eco', { method: 'POST', headers: { 'content-type': 'text/plain', 'x-app': '1' }, body: 'hola' });
  assert.equal(texto.status, 415);
});

test('crearServidor: errores con su código, los inesperados sin detalles', async () => {
  const srv = servidorDePrueba();
  const e = await pedir(srv, '/planifica/api/error');
  assert.equal(e.status, 418);
  assert.deepEqual(await e.json(), { error: 'Soy una tetera <b>' });
  const original = console.error;
  console.error = () => {};
  const roto = await pedir(srv, '/planifica/api/roto');
  console.error = original;
  assert.equal(roto.status, 500);
  assert.doesNotMatch(await roto.text(), /detalle interno/);
  assert.equal((await pedir(srv, '/planifica/api/privado')).status, 401);
  assert.equal((await pedir(srv, '/planifica/api/nada')).status, 404);
  const csvR = await pedir(srv, '/planifica/api/csv');
  assert.equal(csvR.headers.get('content-type'), 'text/csv');
});

test('crearServidor: cabeceras de seguridad y página de error escapada', async () => {
  const srv = servidorDePrueba();
  const r = await pedir(srv, '/planifica/api/hola');
  assert.match(r.headers.get('content-security-policy'), /script-src 'self'/);
  assert.equal(r.headers.get('x-frame-options'), 'DENY');
  assert.equal(r.headers.get('cross-origin-opener-policy'), 'same-origin');
  assert.match(r.headers.get('strict-transport-security'), /max-age/);
  const html = await (await pedir(srv, '/planifica/no-existe')).text();
  assert.match(html, /No encontrado/);
});

test('crearServidor: sin SESSION_SECRET explica qué falta, escapado', async () => {
  const srv = servidorDePrueba();
  const r = await pedir(srv, '/planifica/api/hola', {}, { BASE_PATH: '/planifica' });
  assert.equal(r.status, 500);
  assert.match(await r.text(), /Falta el secreto SESSION_SECRET/);
  const raro = await pedir(srv, '/x', {}, { SESSION_SECRET: SECRETO, BASE_PATH: '<script>' });
  assert.doesNotMatch(await raro.text(), /<script>/);
});
