// Sin SESSION_SECRET en producción, la app dice qué falta (en vez de caerse con el error 1101 de Cloudflare).
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { crearEntorno, levantar } from "./ayudas.js";

let server;
after(() => server?.close());

test("falta SESSION_SECRET: página que lo explica, sin caerse", async () => {
  const bindings = await crearEntorno({
    ENVIRONMENT: "production",
    SESSION_SECRET: "",
    BASE_PATH: "/cotizalo",
  });
  const worker = (await import("../src/server.js")).default;
  let port;
  ({ server, port } = await levantar(worker, bindings));
  for (const ruta of ["/", "/cotizalo", "/cotizalo/api/sesion"]) {
    const r = await fetch(`http://127.0.0.1:${port}${ruta}`, { redirect: "manual" });
    assert.equal(r.status, 500, ruta);
    assert.match(await r.text(), /Falta el secreto SESSION_SECRET/, ruta);
  }
});
