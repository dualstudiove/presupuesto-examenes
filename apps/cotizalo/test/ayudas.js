// Arranca la aplicación (Worker de Hono) sobre un D1 local para probarla con peticiones HTTP reales.
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { crearD1Local } from "@dualstudio/comun/servidor/d1-local";

const PUBLIC = fileURLToPath(new URL("../public/", import.meta.url));
const DISENO = fileURLToPath(new URL("../../../packages/diseno/", import.meta.url));
const COMUN_WEB = fileURLToPath(new URL("../../../packages/comun/web/", import.meta.url));
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
};

/**
 * Imita el binding ASSETS de Cloudflare sobre lo que publicaría herramientas/construir.js
 * (<base>/… = public, <base>/_ds/diseno = packages/diseno, <base>/_ds/comun/web = packages/comun/web),
 * sin tener que compilar: sirve los archivos con ETag y responde 304.
 */
const crearAssets = (basePath = "") => ({
  fetch: async (req) => {
    let p = new URL(req.url).pathname;
    if (basePath) {
      if (p !== basePath && !p.startsWith(`${basePath}/`)) {
        return new Response("no", { status: 404 });
      }
      p = p.slice(basePath.length);
    }
    let dir = PUBLIC;
    if (p.startsWith("/_ds/diseno/")) {
      dir = DISENO;
      p = p.slice("/_ds/diseno".length);
    } else if (p.startsWith("/_ds/comun/web/")) {
      dir = COMUN_WEB;
      p = p.slice("/_ds/comun/web".length);
    }
    const f = path.join(dir, p);
    if (!f.startsWith(dir) || !fs.existsSync(f) || !fs.statSync(f).isFile()) {
      return new Response("no", { status: 404 });
    }
    const st = fs.statSync(f);
    const etag = `"${st.size}-${Math.floor(st.mtimeMs)}"`;
    const h = { "content-type": MIME[path.extname(f)] || "application/octet-stream", etag };
    if (req.headers.get("if-none-match") === etag) {
      return new Response(null, { status: 304, headers: h });
    }
    return new Response(fs.readFileSync(f), { status: 200, headers: h });
  },
});

/** vacia: true → base sin tablas (como una base D1 recién creada), para probar que la app las crea sola. */
export async function crearEntorno(extra = {}, { vacia = false } = {}) {
  const d1 = crearD1Local(":memory:");
  if (!vacia) {
    await d1.exec(
      fs.readFileSync(new URL("../migrations/0001_schema.sql", import.meta.url), "utf8"),
    );
  }
  const base = extra.BASE_PATH ? `/${String(extra.BASE_PATH).replace(/^\/+|\/+$/g, "")}` : "";
  return {
    DB: d1,
    ASSETS: crearAssets(base),
    SESSION_SECRET: "test-secret-test-secret-test-secret-1234",
    BCV_DISABLED: "true",
    ...extra,
  };
}

/** Servidor Node que reenvía cada petición a worker.fetch(request, env). */
export async function levantar(worker, bindings) {
  const server = http.createServer(async (rq, rs) => {
    const chunks = [];
    for await (const c of rq) chunks.push(c);
    const cuerpo = Buffer.concat(chunks);
    const headers = new Headers();
    for (const [k, v] of Object.entries(rq.headers)) {
      headers.set(k, Array.isArray(v) ? v.join(", ") : v);
    }
    const req = new Request(`http://${rq.headers.host}${rq.url}`, {
      method: rq.method,
      headers,
      body: cuerpo.length && rq.method !== "GET" && rq.method !== "HEAD" ? cuerpo : undefined,
    });
    const res = await worker.fetch(req, bindings, { waitUntil: () => {} });
    const out = {};
    res.headers.forEach((v, k) => {
      if (k !== "set-cookie") out[k] = v;
    });
    const cookies = res.headers.getSetCookie();
    if (cookies.length) out["set-cookie"] = cookies;
    rs.writeHead(res.status, out);
    rs.end(Buffer.from(await res.arrayBuffer()));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { server, port: server.address().port };
}
