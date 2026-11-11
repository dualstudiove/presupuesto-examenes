// Piezas neutrales (sin Node ni Hono): el enrutador declarativo que usan los módulos de rutas y la respuesta "cruda".
export class Raw {
  constructor(body, type, headers = {}) {
    this.body = body;
    this.type = type;
    this.headers = headers;
  }
}

/** Registro de rutas. server.js lo traduce a rutas de Hono (cada ruta conserva su patrón "/x/:param"). */
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
    this.routes.push({ method, path, opts, handler });
  }
}
