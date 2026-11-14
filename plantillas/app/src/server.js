// __TITULO__ en Cloudflare Workers, sobre crearServidor() de @dualstudio/comun.
// comun ya hace lo genérico: montar la app bajo BASE_PATH, la API (JSON, CSRF, sesión, errores),
// las cabeceras de seguridad y el «falta configuración». Aquí solo va lo propio de la app.
import { Router, crearServidor } from '@dualstudio/comun/servidor';
import { configurarEnv } from './env.js';
import { asegurarEsquema } from './esquema.js';
import { registrarRutas } from './rutas.js';

const router = new Router();
registrarRutas(router);

export const { app, fetch, scheduled } = crearServidor({
  router,
  configurar: configurarEnv,
  asegurarEsquema,
  paginas(app, { asset }) {
    app.get('/', (c) => asset(c, '/index.html'));
  },
});

export default { fetch, scheduled };
