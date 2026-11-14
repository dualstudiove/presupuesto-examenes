// Recuperar el acceso del superadministrador con los secretos SUPER_EMAIL / SUPER_PASSWORD,
// y cambiar su contraseña desde el panel.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { crearEntorno, levantar } from "./ayudas.js";

const servidores = [];
after(() => servidores.forEach((s) => s.close()));

/** Base de datos sembrada SIN secretos (como una instalación existente) y servidor que arranca CON ellos. */
async function arrancar(secretos) {
  const bindings = await crearEntorno({ BASE_PATH: "/cotizalo" });
  const { configurarEnv } = await import("../src/env.js");
  const { bindD1 } = await import("@dualstudio/comun/servidor");
  configurarEnv(bindings);
  bindD1(bindings.DB);
  const { sembrar } = await import("../src/seed.js");
  await sembrar({ demo: false });
  const worker = (await import("../src/server.js")).default;
  const { server, port } = await levantar(worker, { ...bindings, ...secretos });
  servidores.push(server);
  return async (path, { method = "GET", body, cookie } = {}) => {
    const headers = { "x-app": "1" };
    if (body) headers["content-type"] = "application/json";
    if (cookie) headers.cookie = cookie;
    const r = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      redirect: "manual",
    });
    const texto = await r.text();
    let json = null;
    try {
      json = JSON.parse(texto);
    } catch { /* no es JSON */ }
    return { status: r.status, json, cookie: (r.headers.getSetCookie()[0] || "").split(";")[0] };
  };
}

const login = (pedir, email, password) =>
  pedir("/cotizalo/api/login", { method: "POST", body: { email, password } });

test("los secretos restablecen la contraseña de un superadministrador que ya existe", async () => {
  const pedir = await arrancar({
    SUPER_EMAIL: "super@plataforma.test",
    SUPER_PASSWORD: "Recuperada2026",
  });
  assert.equal((await login(pedir, "super@plataforma.test", "Recuperada2026")).status, 200);
  assert.equal(
    (await login(pedir, "super@plataforma.test", "Super12345")).status,
    401,
    "la contraseña vieja ya no sirve",
  );
});

test("los secretos crean un superadministrador nuevo", async () => {
  const pedir = await arrancar({
    SUPER_EMAIL: "Yo@DualStudio.app",
    SUPER_PASSWORD: "MiClaveNueva1",
  });
  const r = await login(pedir, "yo@dualstudio.app", "MiClaveNueva1");
  assert.equal(r.status, 200);
  assert.equal(r.json.rol, "super");
});

test("una contraseña demasiado corta en los secretos se ignora", async () => {
  const pedir = await arrancar({ SUPER_EMAIL: "corta@dualstudio.app", SUPER_PASSWORD: "123" });
  assert.equal((await login(pedir, "corta@dualstudio.app", "123")).status, 401);
  assert.equal(
    (await login(pedir, "super@plataforma.test", "Super12345")).status,
    200,
    "lo demás sigue igual",
  );
});

test("el superadministrador cambia su contraseña desde el panel", async () => {
  const pedir = await arrancar({});
  const { cookie } = await login(pedir, "super@plataforma.test", "Super12345");
  assert.equal(
    (await pedir("/cotizalo/api/super/password", {
      method: "POST",
      body: { actual: "mala", nueva: "OtraClave2026" },
      cookie,
    })).status,
    400,
  );
  assert.equal(
    (await pedir("/cotizalo/api/super/password", {
      method: "POST",
      body: { actual: "Super12345", nueva: "corta" },
      cookie,
    })).status,
    400,
  );
  const ok = await pedir("/cotizalo/api/super/password", {
    method: "POST",
    body: { actual: "Super12345", nueva: "OtraClave2026" },
    cookie,
  });
  assert.equal(ok.status, 200);
  assert.equal(
    (await pedir("/cotizalo/api/super/me", { cookie: ok.cookie })).status,
    200,
    "la sesión sigue abierta con la cookie nueva",
  );
  assert.equal(
    (await pedir("/cotizalo/api/super/me", { cookie })).status,
    401,
    "la cookie anterior deja de valer",
  );
  assert.equal((await login(pedir, "super@plataforma.test", "OtraClave2026")).status, 200);
});
