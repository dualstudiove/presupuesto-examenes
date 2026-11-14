// Paso propio de la central al compilar (lo llama herramientas/construir.js):
//  • genera el catálogo de apps de index.html a partir de apps.json;
//  • publica el catálogo visual del sistema de diseño en dualstudio.app/diseno.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ESTADOS = {
  publicada: { texto: "Disponible", clase: "ok", enlace: true },
  pruebas: { texto: "En pruebas", clase: "ok", enlace: true },
  proximamente: { texto: "Próximamente", clase: "off", enlace: false },
};

const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]),
  );

export function tarjetas(apps, ICONOS) {
  return apps.map((a) => {
    const est = ESTADOS[a.estado];
    if (!est) {
      throw new Error(
        `apps.json: estado no válido en «${a.nombre}»: ${a.estado} (usa ${
          Object.keys(ESTADOS).join(", ")
        }).`,
      );
    }
    if (!/^cat-[1-5]$/.test(a.color || "")) {
      throw new Error(`apps.json: color no válido en «${a.nombre}»: usa cat-1…cat-5.`);
    }
    if (!ICONOS[a.icono]) {
      throw new Error(
        `apps.json: el ícono «${a.icono}» de «${a.nombre}» no existe en packages/diseno/js/iconos.js.`,
      );
    }
    if (est.enlace && !/^(\/[a-z0-9-]+|https:\/\/[^\s"<>]+)$/.test(a.ruta || "")) {
      throw new Error(`apps.json: ruta no válida en «${a.nombre}».`);
    }
    const ico =
      `<span class="ico ${a.color}" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${
        ICONOS[a.icono]
      }</svg></span>`;
    const txt = `<span class="txt"><b>${esc(a.nombre)}</b><span>${
      esc(a.descripcion)
    }</span></span>`;
    const st = `<span class="badge ${est.clase}">${est.texto}</span>`;
    return est.enlace
      ? `      <a class="app" href="${
        esc(a.ruta)
      }">\n        ${ico}\n        ${txt}\n        ${st}\n        <span class="go" aria-hidden="true">→</span>\n      </a>`
      : `      <div class="app off" aria-disabled="true">\n        ${ico}\n        ${txt}\n        ${st}\n      </div>`;
  }).join("\n");
}

export default async function ({ app, raizBase, raiz }) {
  const { ICONOS } = await import(
    pathToFileURL(path.join(raiz, "packages/diseno/js/iconos.js")).href
  );
  const { apps } = JSON.parse(fs.readFileSync(path.join(app, "apps.json"), "utf8"));
  const index = path.join(raizBase, "index.html");
  const html = fs.readFileSync(index, "utf8");
  if (!html.includes("<!-- APPS -->")) {
    throw new Error("public/index.html no tiene la marca <!-- APPS -->.");
  }
  fs.writeFileSync(index, html.replace("<!-- APPS -->", tarjetas(apps, ICONOS)));

  const catalogo = path.join(raiz, "packages/diseno/docs/catalogo.html");
  if (fs.existsSync(catalogo)) {
    fs.mkdirSync(path.join(raizBase, "diseno"), { recursive: true });
    fs.copyFileSync(catalogo, path.join(raizBase, "diseno/index.html"));
  }
}
