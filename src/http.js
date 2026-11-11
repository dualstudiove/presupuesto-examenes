import { HttpError } from './util.js';
import { env } from './env.js';

export class Raw {
  constructor(body, type, headers = {}) {
    this.body = body;
    this.type = type;
    this.headers = headers;
  }
}

export class Router {
  constructor() {
    this.routes = [];
  }

  /** add(método, '/ruta/:param', { tenant, root, auth, noCsrf }, handler) */
  add(method, path, opts, handler) {
    if (typeof opts === 'function') {
      handler = opts;
      opts = {};
    }
    const keys = [];
    const re = new RegExp(`^${path.replace(/:([a-z_]+)/gi, (_, k) => { keys.push(k); return '([^/]+)'; })}/?$`);
    this.routes.push({ method, re, keys, opts, handler });
  }

  match(method, pathname) {
    for (const r of this.routes) {
      if (r.method !== method) continue;
      const m = r.re.exec(pathname);
      if (!m) continue;
      const params = {};
      r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
      return { route: r, params };
    }
    return null;
  }
}

export function clientIp(req) {
  if (env.trustProxy) {
    const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (xff) return xff;
  }
  return req.socket.remoteAddress || 'desconocida';
}

export async function leerJson(req, max = 400_000) {
  const largo = Number(req.headers['content-length'] || 0);
  if (largo > max) throw new HttpError(413, 'La solicitud es demasiado grande.');
  const chunks = [];
  let total = 0;
  for await (const c of req) {
    total += c.length;
    if (total > max) throw new HttpError(413, 'La solicitud es demasiado grande.');
    chunks.push(c);
  }
  if (!total) return {};
  if (!String(req.headers['content-type'] || '').includes('application/json')) throw new HttpError(415, 'Formato no permitido.');
  try {
    const v = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return v && typeof v === 'object' ? v : {};
  } catch {
    throw new HttpError(400, 'La solicitud no es válida.');
  }
}
