// Piezas neutrales (sin Node ni Hono): el enrutador declarativo que usan los módulos de rutas,
// la respuesta "cruda" y el error con código HTTP.

/** Error que llega al usuario tal cual, con su código HTTP. Cualquier otro error se muestra como genérico. */
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Respuesta que no es JSON (p. ej. un CSV): new Raw(cuerpo, 'text/csv', { cabeceras }). */
export class Raw {
  constructor(body, type, headers = {}) {
    this.body = body;
    this.type = type;
    this.headers = headers;
  }
}

/** Registro de rutas. crearServidor() lo traduce a rutas de Hono (cada ruta conserva su patrón "/x/:param"). */
export class Router {
  constructor() {
    this.routes = [];
  }

  /** add(método, '/ruta/:param', { auth, noCsrf, maxBody, ...opciones propias de la app }, handler) */
  add(method, path, opts, handler) {
    if (typeof opts === 'function') {
      handler = opts;
      opts = {};
    }
    this.routes.push({ method, path, opts, handler });
  }
}
