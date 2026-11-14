// Pruebas de @dualstudio/comun/web (las partes que no necesitan un navegador).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fmtNum, fmtFecha, diaLocal } from '../web/formatos.js';
import { crearApi, basePath } from '../web/api.js';
import { esc, norm } from '../web/dom.js';

test('formatos venezolanos', () => {
  assert.equal(fmtNum(123456789), '1.234.567,89');
  assert.equal(fmtNum(-5), '-0,05');
  assert.equal(fmtNum(0), '0,00');
  assert.equal(fmtFecha('2026-11-14'), '14/11/2026');
  assert.equal(fmtFecha(''), '');
  assert.equal(diaLocal('2026-01-02T02:30:00Z'), '2026-01-01');
});

test('esc y norm', () => {
  assert.equal(esc('<img src=x onerror="a">'), '&lt;img src=x onerror=&quot;a&quot;&gt;');
  assert.equal(norm('Química Sanguínea'), 'quimica sanguinea');
});

test('basePath se deduce de dónde se sirve el archivo', () => {
  assert.equal(basePath('https://dualstudio.app/cotizalo/js/common.js', 1), '/cotizalo');
  assert.equal(basePath('https://cotizalo.com/js/common.js', 1), '');
});

test('crearApi: ruta, cabecera x-app, JSON y errores con mensaje', async () => {
  const llamadas = [];
  const respuestas = [
    new Response(JSON.stringify({ ok: 1 }), { headers: { 'content-type': 'application/json' } }),
    new Response(JSON.stringify({ error: 'No autorizado.' }), { status: 401, headers: { 'content-type': 'application/json' } }),
  ];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, opt) => { llamadas.push({ url, opt }); return respuestas.shift(); };
  try {
    const api = crearApi((r) => `/planifica${r}`);
    assert.deepEqual(await api('/api/x', { method: 'POST', body: { a: 1 } }), { ok: 1 });
    assert.equal(llamadas[0].url, '/planifica/api/x');
    assert.equal(llamadas[0].opt.headers['x-app'], '1');
    assert.equal(llamadas[0].opt.body, '{"a":1}');
    await assert.rejects(api('/api/y'), (e) => e.status === 401 && e.message === 'No autorizado.');
    globalThis.fetch = async () => { throw new TypeError('sin red'); };
    await assert.rejects(api('/api/z'), (e) => e.status === 0 && /No hay conexión/.test(e.message));
  } finally {
    globalThis.fetch = original;
  }
});
