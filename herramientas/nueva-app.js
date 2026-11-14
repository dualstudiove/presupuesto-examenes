#!/usr/bin/env node
// Crea una app nueva desde plantillas/app, lista para `npm run dev`.
//
//   npm run nueva-app -- planifica --titulo "Planifica" --descripcion "Planificación de…" --icono calendar --color cat-5
//
// Opciones:
//   --titulo       Nombre visible (por defecto, el nombre con mayúscula).
//   --descripcion  Una frase (aparece en la central y en la página).
//   --icono        Ícono de packages/diseno/js/iconos.js para la central (por defecto, flask).
//   --color        cat-1…cat-5: color de la app en la central y su acento (por defecto, cat-2).
//   --sin-base     La app no usa base de datos D1 (no ocupa ninguna de las 10 del plan gratuito).
//   --destino      Carpeta donde crearla (por defecto, apps/<nombre>). Solo para pruebas.
//   --sin-catalogo No la agrega a apps/central/apps.json.
//
// Hace: copia la plantilla con el nombre, la ruta (/<nombre>) y el acento; agrega la app a la central como
// «Próximamente» (si ya estaba, la deja como está). Después: npm install y npm run dev -w <nombre>.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ICONOS } from '../packages/diseno/js/iconos.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PLANTILLA = path.join(RAIZ, 'plantillas/app');

// Acento de cada color de categoría del padre (packages/diseno/tokens.css), en claro y en oscuro.
const ACENTOS = {
  'cat-1': ['#cf2f6c', '#ff7fae'],
  'cat-2': ['#2561d6', '#7aa8ff'],
  'cat-3': ['#0f7f64', '#4fd1ad'],
  'cat-4': ['#a86208', '#f2b455'],
  'cat-5': ['#6d3fd1', '#b095ff'],
};
// Rutas que no pueden ser una app (las usan la central o el sistema).
const RESERVADAS = new Set(['diseno', 'api', 'css', 'js', 'img', '_ds', 'admin', 'www', 'static', 'assets', 'cdn-cgi']);

export function leerArgs(argv) {
  const o = { flags: new Set() };
  const resto = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--sin-base' || a === '--sin-catalogo') o.flags.add(a.slice(2));
    else if (a.startsWith('--')) o[a.slice(2)] = argv[++i];
    else resto.push(a);
  }
  o.nombre = resto[0];
  return o;
}

export function crearApp(opciones) {
  const nombre = String(opciones.nombre || '').trim().toLowerCase();
  if (!/^[a-z][a-z0-9-]{1,30}$/.test(nombre)) throw new Error('El nombre debe ser corto, en minúsculas, sin espacios ni acentos (p. ej. planifica).');
  if (RESERVADAS.has(nombre)) throw new Error(`«${nombre}» está reservado.`);
  const titulo = opciones.titulo || nombre[0].toUpperCase() + nombre.slice(1);
  const descripcion = opciones.descripcion || 'Muy pronto.';
  const icono = opciones.icono || 'flask';
  const color = opciones.color || 'cat-2';
  if (!ICONOS[icono]) throw new Error(`El ícono «${icono}» no existe. Opciones: ${Object.keys(ICONOS).join(', ')}.`);
  if (!ACENTOS[color]) throw new Error('El color debe ser cat-1, cat-2, cat-3, cat-4 o cat-5.');
  const sinBase = opciones.flags?.has('sin-base');
  const destino = path.resolve(opciones.destino || path.join(RAIZ, 'apps', nombre));
  if (fs.existsSync(destino)) throw new Error(`Ya existe ${path.relative(RAIZ, destino) || destino}.`);

  const reemplazar = (t) => t
    .replaceAll('__APP__', nombre).replaceAll('__TITULO__', titulo).replaceAll('__DESCRIPCION__', descripcion)
    .replaceAll('__ACENTO_CLARO__', ACENTOS[color][0]).replaceAll('__ACENTO_OSCURO__', ACENTOS[color][1]);

  fs.cpSync(PLANTILLA, destino, { recursive: true });
  for (const f of fs.readdirSync(destino, { recursive: true })) {
    const p = path.join(destino, f);
    if (!fs.statSync(p).isFile() || p.endsWith('.svg')) continue;
    let t = reemplazar(fs.readFileSync(p, 'utf8'));
    if (f === 'wrangler.jsonc') {
      if (sinBase) {
        t = t.replace(/\n {2}\/\/__D1_INICIO__[\s\S]*?\/\/__D1_FIN__/, '').replace('//__D1_PREVIEWS__', '');
      } else {
        t = t.replace(/ *\/\/__D1_(INICIO|FIN)__\n/g, '').replace(
          '//__D1_PREVIEWS__',
          `,\n    // Base de datos APARTE para las pruebas:  npx wrangler d1 create ${nombre}-pruebas\n    "d1_databases": [\n      { "binding": "DB", "database_name": "${nombre}-pruebas", "database_id": "PENDIENTE-pega-aqui-el-id" }\n    ]`,
        );
      }
    }
    if (sinBase && f === path.join('src', 'server.js')) t = t.replace('  asegurarEsquema,\n', '').replace("import { asegurarEsquema } from './esquema.js';\n", '');
    if (sinBase && f === path.join('test', 'app.test.js')) {
      t = t.replace(/\ntest\('crea sus tablas sola[\s\S]*?\n\}\);\n/, '\n').replace("import { crearD1Local } from '@dualstudio/comun/servidor/d1-local';\n", '').replace('DB: crearD1Local(\':memory:\'), ', '');
    }
    fs.writeFileSync(p, t);
  }
  if (sinBase) fs.rmSync(path.join(destino, 'src/esquema.js'));

  let catalogo = 'no se tocó la central';
  if (!opciones.flags?.has('sin-catalogo')) {
    const f = path.join(RAIZ, 'apps/central/apps.json');
    const datos = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (datos.apps.some((a) => a.ruta === `/${nombre}`)) catalogo = 'ya estaba en apps/central/apps.json (se dejó igual)';
    else {
      datos.apps.push({ nombre: titulo, ruta: `/${nombre}`, descripcion, estado: 'proximamente', icono, color });
      fs.writeFileSync(f, `${JSON.stringify(datos, null, 2)}\n`);
      catalogo = 'agregada a apps/central/apps.json como «Próximamente»';
    }
  }
  return { nombre, titulo, destino, catalogo, sinBase };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const r = crearApp(leerArgs(process.argv.slice(2)));
    console.log(`\nApp «${r.titulo}» creada en ${path.relative(process.cwd(), r.destino)} (${r.catalogo}).\n`);
    console.log('Siguientes pasos:');
    console.log('  npm install');
    console.log(`  cp ${path.relative(process.cwd(), r.destino)}/.dev.vars.example ${path.relative(process.cwd(), r.destino)}/.dev.vars`);
    console.log(`  npm run dev -w ${r.nombre}          → http://localhost:8787/${r.nombre}`);
    console.log(`  npm test -w ${r.nombre}`);
    console.log(`\nPara publicarla: ${path.relative(process.cwd(), r.destino)}/README.md («Publicar por primera vez»).`);
  } catch (e) {
    console.error(`No se pudo crear la app: ${e.message}`);
    process.exit(1);
  }
}
