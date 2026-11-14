// Paso propio de Planifica al compilar (lo llama herramientas/construir.js): copia jsPDF (para la pauta en PDF)
// a /vendor. La política de seguridad solo deja cargar scripts propios, así que no se usa una CDN.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

export default function ({ app, raizBase }) {
  const require = createRequire(path.join(app, "package.json"));
  const origen = path.join(
    path.dirname(require.resolve("jspdf/package.json")),
    "dist",
    "jspdf.umd.min.js",
  );
  fs.mkdirSync(path.join(raizBase, "vendor"), { recursive: true });
  fs.copyFileSync(origen, path.join(raizBase, "vendor", "jspdf.umd.min.js"));
}
