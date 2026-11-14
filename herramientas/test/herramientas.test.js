// Pruebas de las herramientas del monorepo: lectura de wrangler.jsonc y compilación de una app.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { jsonc, basePathDe } from '../wrangler.js';
import { construir } from '../construir.js';
import { crearApp, leerArgs } from '../nueva-app.js';
import { execFileSync } from 'node:child_process';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-herramientas-'));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('jsonc: quita comentarios y comas finales sin romper las URL', () => {
  const v = jsonc('{\n // comentario\n "url": "https://a.b/c", /* otro */ "x": [1, 2,],\n "s": "a\\"//b",\n}');
  assert.deepEqual(v, { url: 'https://a.b/c', x: [1, 2], s: 'a"//b' });
});

test('basePathDe: normaliza y exige que previews use la misma ruta', () => {
  assert.equal(basePathDe({ vars: { BASE_PATH: 'planifica/' } }), '/planifica');
  assert.equal(basePathDe({}), '');
  assert.throws(() => basePathDe({ vars: { BASE_PATH: '/a' }, previews: { vars: { BASE_PATH: '/b' } } }), /no coincide/);
});

test('construir: publica la app y las librerías bajo BASE_PATH, con _headers', async () => {
  const app = path.join(tmp, 'mi-app');
  fs.mkdirSync(path.join(app, 'public/css'), { recursive: true });
  fs.writeFileSync(path.join(app, 'public/index.html'), '<!doctype html>');
  fs.writeFileSync(path.join(app, 'public/css/app.css'), '@layer app {}');
  fs.writeFileSync(path.join(app, 'wrangler.jsonc'), '{ "vars": { "BASE_PATH": "/mi-app" } // ruta\n}');
  const { salida, base } = await construir(app);
  assert.equal(base, '/mi-app');
  for (const f of ['mi-app/index.html', 'mi-app/css/app.css', 'mi-app/_ds/diseno/diseno.css', 'mi-app/_ds/diseno/js/iconos.js', 'mi-app/_ds/comun/web/api.js']) {
    assert.ok(fs.existsSync(path.join(salida, f)), f);
  }
  assert.ok(!fs.existsSync(path.join(salida, 'mi-app/_ds/diseno/docs')), 'la documentación no se publica');
  assert.match(fs.readFileSync(path.join(salida, '_headers'), 'utf8'), /X-Content-Type-Options: nosniff/);
  // Compilar de nuevo empieza de cero (no quedan archivos viejos)
  fs.rmSync(path.join(app, 'public/css'), { recursive: true });
  await construir(app);
  assert.ok(!fs.existsSync(path.join(salida, 'mi-app/css')));
});

test('la central genera su catálogo desde apps.json', async () => {
  const central = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../apps/central');
  const { tarjetas } = await import(path.join(central, 'construir.js'));
  const { ICONOS } = await import('../../packages/diseno/js/iconos.js');
  const html = tarjetas([
    { nombre: 'A<b>', ruta: '/a', descripcion: 'Uno', estado: 'pruebas', icono: 'flask', color: 'cat-1' },
    { nombre: 'B', ruta: '/b', descripcion: 'Dos', estado: 'proximamente', icono: 'calendar', color: 'cat-2' },
  ], ICONOS);
  assert.match(html, /<a class="app" href="\/a">/);
  assert.match(html, /A&lt;b&gt;/);
  assert.match(html, /<div class="app off"/);
  assert.throws(() => tarjetas([{ nombre: 'X', ruta: '/x', estado: 'otro', icono: 'flask', color: 'cat-1' }], ICONOS), /estado no válido/);
  assert.throws(() => tarjetas([{ nombre: 'X', ruta: 'javascript:x', estado: 'pruebas', icono: 'flask', color: 'cat-1' }], ICONOS), /ruta no válida/);
  const real = JSON.parse(fs.readFileSync(path.join(central, 'apps.json'), 'utf8'));
  assert.ok(tarjetas(real.apps, ICONOS).length > 0, 'apps.json real es válido');
});

// ── nueva-app ──
const RAIZ_REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');

test('nueva-app: valida el nombre, el ícono y el color', () => {
  assert.throws(() => crearApp({ nombre: 'Mi App' }), /minúsculas/);
  assert.throws(() => crearApp({ nombre: 'diseno' }), /reservado/);
  assert.throws(() => crearApp({ nombre: 'otra', icono: 'nada', destino: path.join(tmp, 'x') }), /ícono/);
  assert.throws(() => crearApp({ nombre: 'otra', color: 'rojo', destino: path.join(tmp, 'x') }), /color/);
  assert.throws(() => crearApp({ nombre: 'cotizalo' }), /Ya existe/);
  const a = leerArgs(['planifica', '--titulo', 'Planifica', '--sin-base']);
  assert.equal(a.nombre, 'planifica');
  assert.equal(a.titulo, 'Planifica');
  assert.ok(a.flags.has('sin-base'));
});

for (const sinBase of [false, true]) {
  test(`nueva-app: la app generada${sinBase ? ' sin base' : ''} compila y pasa sus pruebas`, async () => {
    const nombre = `zz-prueba${sinBase ? '-sb' : ''}`;
    const destino = path.join(RAIZ_REPO, 'apps', nombre);
    try {
      crearApp({ nombre, titulo: 'Prueba', color: 'cat-4', flags: new Set(['sin-catalogo', ...(sinBase ? ['sin-base'] : [])]) });
      const wr = jsonc(fs.readFileSync(path.join(destino, 'wrangler.jsonc'), 'utf8'));
      assert.equal(wr.name, nombre);
      assert.equal(wr.vars.BASE_PATH, `/${nombre}`);
      assert.equal(Boolean(wr.d1_databases), !sinBase);
      assert.equal(Boolean(wr.previews.d1_databases), !sinBase);
      assert.ok(wr.assets.run_worker_first.includes(`!/${nombre}/_ds/*`));
      assert.match(fs.readFileSync(path.join(destino, 'public/css/tema.css'), 'utf8'), /--accent: #a86208/);
      for (const f of fs.readdirSync(destino, { recursive: true })) {
        const p = path.join(destino, f);
        if (fs.statSync(p).isFile()) assert.doesNotMatch(fs.readFileSync(p, 'utf8'), /__[A-Z_]+__/, f);
      }
      await construir(destino);
      execFileSync(process.execPath, ['--disable-warning=ExperimentalWarning', '--test', 'test/app.test.js'], { cwd: destino, stdio: 'pipe' });
    } finally {
      fs.rmSync(destino, { recursive: true, force: true });
    }
  });
}
