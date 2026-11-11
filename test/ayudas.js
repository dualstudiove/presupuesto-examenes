// Arranca la aplicación (Worker de Hono) sobre un D1 local para probarla con peticiones HTTP reales.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { crearD1Local } from '../src/db.local.js';

const PUBLIC = fileURLToPath(new URL('../public/', import.meta.url));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };

/** Imita el binding ASSETS de Cloudflare: sirve /public con ETag y responde 304. */
const ASSETS = {
  fetch: async (req) => {
    const f = path.join(PUBLIC, new URL(req.url).pathname);
    if (!f.startsWith(PUBLIC) || !fs.existsSync(f) || !fs.statSync(f).isFile()) return new Response('no', { status: 404 });
    const st = fs.statSync(f);
    const etag = `"${st.size}-${Math.floor(st.mtimeMs)}"`;
    const h = { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', etag };
    if (req.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers: h });
    return new Response(fs.readFileSync(f), { status: 200, headers: h });
  },
};

export async function crearEntorno(extra = {}) {
  const d1 = crearD1Local(':memory:');
  await d1.exec(fs.readFileSync(new URL('../migrations/0001_schema.sql', import.meta.url), 'utf8'));
  return { DB: d1, ASSETS, BASE_DOMAIN: 'localhost', SESSION_SECRET: 'test-secret-test-secret-test-secret-1234', BCV_DISABLED: 'true', ...extra };
}

/** Servidor Node que reenvía cada petición a worker.fetch(request, env). */
export async function levantar(worker, bindings) {
  const server = http.createServer(async (rq, rs) => {
    const chunks = [];
    for await (const c of rq) chunks.push(c);
    const cuerpo = Buffer.concat(chunks);
    const headers = new Headers();
    for (const [k, v] of Object.entries(rq.headers)) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
    const req = new Request(`http://${rq.headers.host}${rq.url}`, { method: rq.method, headers, body: cuerpo.length && rq.method !== 'GET' && rq.method !== 'HEAD' ? cuerpo : undefined });
    const res = await worker.fetch(req, bindings, { waitUntil: () => {} });
    const out = {};
    res.headers.forEach((v, k) => { if (k !== 'set-cookie') out[k] = v; });
    const cookies = res.headers.getSetCookie();
    if (cookies.length) out['set-cookie'] = cookies;
    rs.writeHead(res.status, out);
    rs.end(Buffer.from(await res.arrayBuffer()));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, port: server.address().port };
}
