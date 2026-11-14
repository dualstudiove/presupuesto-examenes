// Protecciones añadidas en la revisión de seguridad: sesiones que se cierran a distancia, secretos de
// recuperación de un solo uso, topes diarios, seed sin contraseña de ejemplo y restos eliminados.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { crearEntorno, levantar } from './ayudas.js';

let server;
let port;
let D1;

async function pedir(path, { method = 'GET', body, jar, cookie } = {}) {
  const headers = { 'x-app': '1' };
  if (body) headers['content-type'] = 'application/json';
  if (jar && Object.keys(jar).length) headers.cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
  if (cookie) headers.cookie = cookie;
  const r = await fetch(`http://127.0.0.1:${port}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' });
  if (jar) for (const c of r.headers.getSetCookie()) { const [par] = c.split(';'); const i = par.indexOf('='); jar[par.slice(0, i)] = par.slice(i + 1); }
  const texto = await r.text();
  let json = null;
  try { json = JSON.parse(texto); } catch { /* no es JSON */ }
  return { status: r.status, json, texto };
}
const login = (email, password, jar) => pedir('/cotizalo/api/login', { method: 'POST', body: { email, password }, jar });

before(async () => {
  const bindings = await crearEntorno({ BASE_PATH: '/cotizalo', SUPER_EMAIL: 'rescate@dualstudio.app', SUPER_PASSWORD: 'ClaveDeRescate1' });
  D1 = bindings.DB;
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

test('superadministrador: cerrar sesión en los demás dispositivos', async () => {
  const a = {};
  const b = {};
  // (con SUPER_EMAIL/SUPER_PASSWORD en el entorno, el seed crea ese superadministrador)
  await login('rescate@dualstudio.app', 'ClaveDeRescate1', a);
  await login('rescate@dualstudio.app', 'ClaveDeRescate1', b);
  assert.equal((await pedir('/cotizalo/api/super/me', { jar: b })).status, 200);
  assert.equal((await pedir('/cotizalo/api/super/sesiones/cerrar', { method: 'POST', jar: a })).status, 200);
  assert.equal((await pedir('/cotizalo/api/super/me', { jar: a })).status, 200, 'esta sesión sigue abierta');
  assert.equal((await pedir('/cotizalo/api/super/me', { jar: b })).status, 401, 'la otra queda cerrada');
});

test('administrador: cerrar sesión en los demás dispositivos', async () => {
  const a = {};
  const b = {};
  await login('admin@demo.test', 'Demo12345', a);
  await login('admin@demo.test', 'Demo12345', b);
  assert.equal((await pedir('/cotizalo/demo/api/admin/sesiones/cerrar', { method: 'POST', jar: a })).status, 200);
  assert.equal((await pedir('/cotizalo/demo/api/admin/me', { jar: a })).status, 200);
  assert.equal((await pedir('/cotizalo/demo/api/admin/me', { jar: b })).status, 401);
});

test('los secretos de recuperación se aplican una sola vez y el panel avisa', async () => {
  const jar = {};
  assert.equal((await login('rescate@dualstudio.app', 'ClaveDeRescate1', jar)).status, 200);
  const me = await pedir('/cotizalo/api/super/me', { jar });
  assert.equal(me.json.secretos_recuperacion, true);
  await pedir('/cotizalo/api/super/password', { method: 'POST', body: { actual: 'ClaveDeRescate1', nueva: 'MiClavePropia2026' }, jar });
  // Una instancia nueva del Worker (sin caché) no vuelve a poner la contraseña de los secretos.
  const { olvidarCacheDeSecretos } = await import('../src/routes/super.js');
  olvidarCacheDeSecretos();
  assert.equal((await login('rescate@dualstudio.app', 'MiClavePropia2026')).status, 200);
  assert.equal((await login('rescate@dualstudio.app', 'ClaveDeRescate1')).status, 401);
});

test('pasado el tope diario, la visita no se cuenta y el paciente no ve un error', async () => {
  const { TOPE_VISITAS_DIA } = await import('../src/routes/public.js');
  const { hoy } = await import('@dualstudio/comun/servidor');
  const neg = await D1.prepare("SELECT id FROM negocios WHERE slug = 'norte'").first();
  await D1.prepare('INSERT INTO _cuotas (clave, dia, n) VALUES (?, ?, ?)').bind(`visitas|${neg.id}`, hoy(), TOPE_VISITAS_DIA).run();
  const antes = (await D1.prepare('SELECT COUNT(*) AS n FROM visitas WHERE negocio_id = ?').bind(neg.id).first()).n;
  const r = await pedir('/cotizalo/norte/api/publico/visita', { method: 'POST', body: { dispositivo: 'movil' } });
  assert.equal(r.status, 200);
  assert.equal(r.json.contada, false);
  const despues = (await D1.prepare('SELECT COUNT(*) AS n FROM visitas WHERE negocio_id = ?').bind(neg.id).first()).n;
  assert.equal(despues, antes);
});

test('pasado el tope diario, no se generan más presupuestos', async () => {
  const { TOPE_PRESUPUESTOS_DIA } = await import('../src/routes/public.js');
  const { hoy } = await import('@dualstudio/comun/servidor');
  const neg = await D1.prepare("SELECT id FROM negocios WHERE slug = 'norte'").first();
  await D1.prepare('INSERT INTO _cuotas (clave, dia, n) VALUES (?, ?, ?)').bind(`presupuestos|${neg.id}`, hoy(), TOPE_PRESUPUESTOS_DIA).run();
  const r = await pedir('/cotizalo/norte/api/publico/presupuesto', { method: 'POST', body: { examenes: [], perfiles: [] } });
  assert.equal(r.status, 429);
  assert.match(r.json.error, /demasiados presupuestos/);
});

test('la ruta de cron externa ya no existe', async () => {
  assert.equal((await pedir('/cotizalo/api/cron/tasa', { method: 'POST' })).status, 404);
});

test('una cookie mal formada no rompe la app', async () => {
  assert.equal((await pedir('/cotizalo/api/sesion', { cookie: 'sid_super=%E0%A4%A' })).status, 200);
});

test('el seed no crea el superadministrador de ejemplo sin una contraseña propia', () => {
  const seed = fileURLToPath(new URL('../src/seed.js', import.meta.url));
  const entorno = { ...process.env };
  delete entorno.SUPER_PASSWORD;
  assert.throws(
    () => execFileSync(process.execPath, ['--disable-warning=ExperimentalWarning', seed, '--out', '/dev/null'], { env: entorno, stdio: 'pipe' }),
    (e) => /Define SUPER_EMAIL y SUPER_PASSWORD/.test(String(e.stderr)),
  );
});
