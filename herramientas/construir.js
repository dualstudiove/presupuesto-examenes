#!/usr/bin/env node
// Prepara los archivos que publica una app (la carpeta `assets` de su wrangler.jsonc).
//
//   node herramientas/construir.js apps/<app>        (o, dentro de la app: npm run construir)
//
// Wrangler lo ejecuta solo antes de `wrangler dev` y `wrangler deploy` (bloque "build" del wrangler.jsonc),
// también en las compilaciones de Cloudflare. Genera apps/<app>/.publicar/ (no se sube a Git):
//
//   .publicar/<BASE_PATH>/…              los archivos de apps/<app>/public
//   .publicar/<BASE_PATH>/_ds/diseno/    el sistema de diseño padre (packages/diseno)
//   .publicar/<BASE_PATH>/_ds/comun/web/ las utilidades del navegador (packages/comun/web)
//   .publicar/_headers                   cabeceras de seguridad de los archivos fijos
//
// Los archivos quedan bajo BASE_PATH (p. ej. /cotizalo/css/app.css) para que Cloudflare los sirva directamente,
// sin pasar por el Worker: así no gastan peticiones del plan gratuito (ver "run_worker_first" en wrangler.jsonc).
// Si la app tiene su propio construir.js, se ejecuta al final (p. ej. la central genera su catálogo de apps).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { basePathDe, leerWrangler } from "./wrangler.js";
import { CABECERAS_SEGURIDAD } from "../packages/comun/servidor/servidor.js";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DISENO = path.join(RAIZ, "packages/diseno");
const COMUN_WEB = path.join(RAIZ, "packages/comun/web");

/** Lo que se publica del sistema de diseño (docs y package.json no). */
const DE_DISENO = ["diseno.css", "tokens.css", "base.css", "componentes.css", "js"];

export async function construir(dirApp) {
  const app = path.resolve(dirApp);
  const cfg = leerWrangler(app);
  const base = basePathDe(cfg);
  const salida = path.join(app, ".publicar");
  const raizBase = path.join(salida, base);

  fs.rmSync(salida, { recursive: true, force: true });
  fs.mkdirSync(raizBase, { recursive: true });
  fs.cpSync(path.join(app, "public"), raizBase, { recursive: true });
  for (const f of DE_DISENO) {
    fs.cpSync(path.join(DISENO, f), path.join(raizBase, "_ds/diseno", f), { recursive: true });
  }
  fs.cpSync(COMUN_WEB, path.join(raizBase, "_ds/comun/web"), { recursive: true });

  const cabeceras = Object.entries(CABECERAS_SEGURIDAD).map(([k, v]) => `  ${k}: ${v}`).join("\n");
  fs.writeFileSync(
    path.join(salida, "_headers"),
    `# Generado por herramientas/construir.js\n/*\n${cabeceras}\n`,
  );

  const propio = path.join(app, "construir.js");
  if (fs.existsSync(propio)) {
    const mod = await import(pathToFileURL(propio).href);
    await mod.default({ app, salida, raizBase, base, cfg, raiz: RAIZ });
  }
  return { salida, base };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2] || process.cwd();
  construir(dir)
    .then(({ salida, base }) =>
      console.log(
        `Listo: ${path.relative(process.cwd(), salida) || "."} (BASE_PATH «${base || "/"}»)`,
      )
    )
    .catch((e) => {
      console.error(`No se pudo preparar la app: ${e.message}`);
      process.exit(1);
    });
}
