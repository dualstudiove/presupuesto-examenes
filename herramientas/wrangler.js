// Lectura del wrangler.jsonc de una app (JSON con comentarios) para las herramientas del monorepo.
import fs from 'node:fs';
import path from 'node:path';
import { normalizarBase } from '../packages/comun/servidor/env.js';

/** Quita comentarios // y /* *\/ y comas finales, respetando el texto entre comillas (las URL llevan //). */
export function jsonc(texto) {
  let out = '';
  let enTexto = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    const sig = texto[i + 1];
    if (enTexto) {
      out += c;
      if (c === '\\') { out += sig ?? ''; i++; } else if (c === '"') enTexto = false;
      continue;
    }
    if (c === '"') { enTexto = true; out += c; continue; }
    if (c === '/' && sig === '/') { while (i < texto.length && texto[i] !== '\n') i++; out += '\n'; continue; }
    if (c === '/' && sig === '*') { i += 2; while (i < texto.length && !(texto[i] === '*' && texto[i + 1] === '/')) i++; i++; continue; }
    out += c;
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1'));
}

export function leerWrangler(dirApp) {
  const f = path.join(dirApp, 'wrangler.jsonc');
  if (!fs.existsSync(f)) throw new Error(`No existe ${f}`);
  return jsonc(fs.readFileSync(f, 'utf8'));
}

/** BASE_PATH de la app. La versión de pruebas (previews) debe usar la misma: los archivos se publican bajo ella. */
export function basePathDe(cfg) {
  const base = normalizarBase(cfg.vars?.BASE_PATH ?? '');
  const prev = cfg.previews?.vars?.BASE_PATH;
  if (prev !== undefined && normalizarBase(prev) !== base) {
    throw new Error(`BASE_PATH de "previews" («${prev}») no coincide con el de "vars" («${base}»). Deben ser iguales.`);
  }
  return base;
}
