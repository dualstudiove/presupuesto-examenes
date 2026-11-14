// Planifica en Cloudflare Workers, sobre crearServidor() de @dualstudio/comun.
// Páginas: <base> (iniciar sesión / elegir cliente), <base>/admin (clientes y equipo), <base>/<cliente> (la parrilla).
// API: ver rutas.js (cuenta y cliente) y admin.js.
import { crearServidor, env, Router } from "@dualstudio/comun/servidor";
import { configurarEnv } from "./env.js";
import { asegurarEsquema } from "./esquema.js";
import { registrarRutas } from "./rutas.js";
import { registrarAdmin } from "./admin.js";
import { asegurarAdminDesdeSecretos, RESERVADOS } from "./sesion.js";

const router = new Router();
registrarRutas(router);
registrarAdmin(router);

export const { app, fetch, scheduled } = crearServidor({
  router,
  configurar: configurarEnv,
  asegurarEsquema,
  alIniciar: () => asegurarAdminDesdeSecretos(),
  // Las rutas de un cliente cuelgan de /:cliente (p. ej. /laboratorio-rh/api/datos); las demás, de la raíz.
  rutaApi: (r) => (r.opts.cliente ? `/:cliente${r.path}` : r.path),
  estaticos: ["/css/*", "/js/*", "/img/*", "/vendor/*", "/_ds/*"],
  paginas(app, { asset, noEncontrada }) {
    app.get("/", (c) => asset(c, "/index.html"));
    app.get("/admin", (c) => asset(c, "/admin.html"));
    // La parrilla de un cliente. Quién puede verla lo decide la API (sin sesión, la página lleva a iniciar sesión).
    const parrilla = (c) => {
      const url = new URL(c.req.url);
      const slug = String(c.req.param("cliente") || "");
      if (RESERVADOS.has(slug.toLowerCase()) || !/^[a-z0-9-]{2,40}$/i.test(slug)) {
        return noEncontrada();
      }
      if (url.pathname !== `/${slug.toLowerCase()}`) {
        return new Response(null, {
          status: 301,
          headers: { location: `${env.basePath}/${slug.toLowerCase()}${url.search}` },
        });
      }
      return asset(c, "/parrilla.html");
    };
    app.get("/:cliente", parrilla);
    app.get("/:cliente/", parrilla);
  },
});

export default { fetch, scheduled };
