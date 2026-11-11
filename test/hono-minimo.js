// Sustituto MÍNIMO de Hono, solo para probar en un entorno sin acceso a npm. Cubre únicamente lo que usa
// src/server.js. Si 'hono' está instalado, test/registrar-hono.js lo ignora y se prueba con el Hono real.
export class Hono {
  constructor() { this.rutas = []; this.mws = []; this.nf = null; this.oe = null; }
  use(_p, mw) { this.mws.push(mw); }
  on(method, path, h) { this.rutas.push({ method, path, h }); return this; }
  get(path, h) { return this.on('GET', path, h); }
  notFound(h) { this.nf = h; }
  onError(h) { this.oe = h; }
  fetch = async (request, env = {}, executionCtx) => {
    const url = new URL(request.url);
    const c = { env, req: { raw: request, url: request.url, method: request.method, path: url.pathname, param: () => ({}) }, res: undefined };
    Object.defineProperty(c, 'executionCtx', { get() { if (!executionCtx) throw new Error('no ctx'); return executionCtx; } });
    const metodo = request.method === 'HEAD' ? 'GET' : request.method;
    let h = null;
    for (const r of this.rutas) {
      if (r.method !== metodo) continue;
      const keys = [];
      const re = new RegExp('^' + r.path.replace(/\*/g, '.*').replace(/:([a-zA-Z_]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
      const m = re.exec(url.pathname);
      if (m) { const p = {}; keys.forEach((k, i) => { p[k] = decodeURIComponent(m[i + 1]); }); c.req.param = () => p; h = r.h; break; }
    }
    const final = async () => { c.res = h ? await h(c) : await this.nf(c); };
    const correr = async (i) => {
      if (i < this.mws.length) await this.mws[i](c, () => correr(i + 1));
      else await final();
    };
    try { await correr(0); } catch (e) { c.res = await this.oe(e, c); }
    return request.method === 'HEAD' ? new Response(null, c.res) : c.res;
  };
}
