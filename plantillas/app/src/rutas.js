// API de __TITULO__. Cada ruta: r.add(método, '/api/…', { auth, noCsrf }, async (ctx) => respuesta).
// ctx trae: body (JSON), query, params, cookies, ip, setCookies; lo que devuelvas sale como JSON.
// Lanza HttpError(código, 'mensaje para el usuario') para responder con un error.
import { HttpError, nowIso, str } from "@dualstudio/comun/servidor";
import { env } from "./env.js";

export function registrarRutas(r) {
  r.add(
    "GET",
    "/api/estado",
    async () => ({ app: "__TITULO__", hora: nowIso(), base: env.basePath }),
  );

  r.add("POST", "/api/eco", async ({ body }) => {
    const texto = str(body.texto, 200);
    if (!texto) throw new HttpError(400, "Escribe algo.");
    return { texto };
  });
}
