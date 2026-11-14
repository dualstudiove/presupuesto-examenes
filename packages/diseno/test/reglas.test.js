// Las reglas del sistema de diseño (docs/DESIGN.md), comprobadas sobre el padre y sobre cada app de apps/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ICONOS, icon } from '../js/iconos.js';

const DISENO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APPS = path.resolve(DISENO, '../../apps');
const leer = (...p) => fs.readFileSync(path.join(...p), 'utf8');
const sinComentarios = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const apps = fs.readdirSync(APPS).filter((a) => fs.existsSync(path.join(APPS, a, 'public')));
const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/;

test('diseno.css fija el orden de las capas: padre → tema → app', () => {
  const css = leer(DISENO, 'diseno.css');
  assert.match(css, /@layer diseno\.tokens, diseno\.base, diseno\.componentes, app\.tema, app;/);
  for (const [f, capa] of [['tokens.css', 'diseno.tokens'], ['base.css', 'diseno.base'], ['componentes.css', 'diseno.componentes']]) {
    assert.match(css, new RegExp(`@import url\\("${f.replace('.', '\\.')}"\\) layer\\(${capa.replace('.', '\\.')}\\);`), f);
    assert.ok(fs.existsSync(path.join(DISENO, f)), f);
  }
});

test('los tokens existen en claro y en los dos bloques oscuros', () => {
  const css = sinComentarios(leer(DISENO, 'tokens.css'));
  const bloques = [
    css.match(/^:root \{([\s\S]*?)\n\}/m)?.[1],
    css.match(/@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme="light"\]\) \{([\s\S]*?)\}/)?.[1],
    css.match(/^:root\[data-theme="dark"\] \{([\s\S]*?)\}/m)?.[1],
  ];
  bloques.forEach((b, i) => assert.ok(b, `falta el bloque ${i}`));
  const nombres = (b) => new Set([...b.matchAll(/(--[a-z0-9-]+):/g)].map((m) => m[1]).filter((n) => !n.startsWith('--font')));
  const claro = nombres(bloques[0]);
  for (const t of ['--bg', '--surface', '--ink', '--line', '--accent', '--ok', '--warn', '--danger', '--cat-1', '--cat-5']) assert.ok(claro.has(t), t);
  assert.deepEqual([...nombres(bloques[1])].sort(), [...claro].sort(), 'oscuro automático');
  assert.deepEqual([...nombres(bloques[2])].sort(), [...claro].sort(), 'oscuro manual');
});

test('los componentes del padre no usan colores sueltos', () => {
  assert.doesNotMatch(sinComentarios(leer(DISENO, 'componentes.css')), COLOR_LITERAL);
});

for (const app of apps) {
  test(`${app}: tema.css y app.css van en sus capas y sin colores sueltos`, () => {
    const dir = path.join(APPS, app, 'public/css');
    const tema = sinComentarios(leer(dir, 'tema.css'));
    const propio = sinComentarios(leer(dir, 'app.css'));
    assert.match(tema.trim(), /^@layer app\.tema \{[\s\S]*\}$/, 'tema.css debe ser un único @layer app.tema { … }');
    assert.match(propio.trim(), /^@layer app \{[\s\S]*\}$/, 'app.css debe ser un único @layer app { … }');
    assert.doesNotMatch(propio, COLOR_LITERAL, 'app.css: usa var(--…), los colores van en tema.css');
    // Hojas propias de una sola página (p. ej. parrilla.css): mismas reglas que app.css
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.css') && !['tema.css', 'app.css'].includes(x))) {
      const css = sinComentarios(leer(dir, f));
      assert.match(css.trim(), /^@layer app \{[\s\S]*\}$/, `${f} debe ser un único @layer app { … }`);
      assert.doesNotMatch(css, COLOR_LITERAL, `${f}: usa var(--…)`);
    }
  });

  test(`${app}: sus páginas cargan el padre antes que sus hojas`, () => {
    const pub = path.join(APPS, app, 'public');
    for (const f of fs.readdirSync(pub).filter((x) => x.endsWith('.html'))) {
      const html = leer(pub, f);
      const i = [html.indexOf('/_ds/diseno/diseno.css'), html.indexOf('/css/tema.css'), html.indexOf('/css/app.css')];
      assert.ok(i[0] > 0 && i[0] < i[1] && i[1] < i[2], `${f}: orden diseno.css → tema.css → app.css`);
    }
  });

  test(`${app}: los íconos que usa existen`, () => {
    const js = path.join(APPS, app, 'public/js');
    if (!fs.existsSync(js)) return;
    for (const f of fs.readdirSync(js)) {
      for (const m of leer(js, f).matchAll(/icon\('([a-z]+)'\)/g)) assert.ok(ICONOS[m[1]], `${f}: icon('${m[1]}')`);
    }
  });
}

test('icon() devuelve un SVG accesible y vacío si el nombre no existe', () => {
  assert.match(icon('check'), /^<svg class="i"[^>]*aria-hidden="true">/);
  assert.match(icon('no-existe'), /<svg[^>]*><\/svg>/);
});
