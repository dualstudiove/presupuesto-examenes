// Prueba mínima de __TITULO__: el Worker responde bajo su ruta, con sus cabeceras de seguridad.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearD1Local } from '@dualstudio/comun/servidor/d1-local';
import worker from '../src/server.js';

const bindings = { DB: crearD1Local(':memory:'), SESSION_SECRET: 'secreto-de-prueba-secreto-de-prueba-123', BASE_PATH: '/__APP__' };
const pedir = (ruta, init) => worker.fetch(new Request(`http://localhost${ruta}`, init), bindings, { waitUntil: () => {} });

test('la API responde bajo /__APP__', async () => {
  const r = await pedir('/__APP__/api/estado');
  assert.equal(r.status, 200);
  assert.equal((await r.json()).app, '__TITULO__');
  assert.match(r.headers.get('content-security-policy'), /script-src 'self'/);
});

test('crea sus tablas sola en una base vacía', async () => {
  await pedir('/__APP__/api/estado');
  const cols = await bindings.DB.prepare('PRAGMA table_info(ejemplos)').all();
  assert.ok(cols.results.length > 0);
});

test('lo que no es GET necesita la cabecera x-app (protección CSRF)', async () => {
  const init = { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ texto: 'hola' }) };
  assert.equal((await pedir('/__APP__/api/eco', init)).status, 403);
  const ok = await pedir('/__APP__/api/eco', { ...init, headers: { ...init.headers, 'x-app': '1' } });
  assert.deepEqual(await ok.json(), { texto: 'hola' });
});
