// Pruebas de las cuentas compartidas: sesiones con versión, freno de intentos y secretos de recuperación.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aplicarSecretosDeRecuperacion,
  bindD1,
  cerrarOtrasSesiones,
  comprobarPassword,
  configurarEnv,
  crearEsquema,
  credenciales,
  db,
  frenoDeIntentos,
  hashPassword,
  HttpError,
  olvidarCacheDeSecretos,
  tipoDeSesion,
  verifyPassword,
} from "../servidor/index.js";
import { crearD1Local } from "../servidor/d1-local.js";

const SECRETO = "secreto-de-prueba-secreto-de-prueba-123";
const cookies = (setCookie) =>
  Object.fromEntries([
    setCookie.split(";")[0].split("=").map((x, i) => (i ? decodeURIComponent(x) : x)),
  ]);

async function base() {
  const d1 = crearD1Local(":memory:");
  bindD1(d1);
  await crearEsquema({
    base:
      "CREATE TABLE IF NOT EXISTS gente (id TEXT PRIMARY KEY, email TEXT, password_hash TEXT, sesion_version INTEGER NOT NULL DEFAULT 0)",
    testigo: "gente",
  })(d1);
  configurarEnv({ SESSION_SECRET: SECRETO, BASE_PATH: "/app" });
}

test("tipoDeSesion: emitir, leer y vigencia por contraseña y versión", async () => {
  await base();
  const S = tipoDeSesion({ cookie: "sid", tipo: "u", horas: 2 });
  const u = { id: "u1", password_hash: await hashPassword("Clave12345"), sesion_version: 0 };
  const c = S.emitir(u, { datos: { extra: 1 }, path: "/app/x" });
  assert.match(c, /^sid=/);
  assert.match(c, /Path=\/app\/x/);
  assert.match(c, /Max-Age=7200/);
  const tok = S.leer(cookies(c));
  assert.equal(tok.uid, "u1");
  assert.equal(tok.extra, 1);
  assert.equal(S.vigente(tok, u), true);
  assert.equal(S.vigente(tok, { ...u, sesion_version: 1 }), false, "otra versión de sesión");
  assert.equal(
    S.vigente(tok, { ...u, password_hash: await hashPassword("Otra12345") }),
    false,
    "otra contraseña",
  );
  assert.equal(S.vigente(tok, undefined), false);
  assert.equal(
    tipoDeSesion({ cookie: "sid", tipo: "otro" }).leer(cookies(c)),
    null,
    "otro tipo de sesión",
  );
  assert.match(S.cerrar(), /Max-Age=0/);
});

test("cerrarOtrasSesiones sube la versión en la base", async () => {
  await base();
  await db.run("INSERT INTO gente (id, email, password_hash) VALUES ('g1', 'a@b.co', 'x')");
  assert.equal(await cerrarOtrasSesiones("gente", { id: "g1", sesion_version: 0 }), 1);
  assert.equal(
    (await db.get("SELECT sesion_version FROM gente WHERE id = 'g1'")).sesion_version,
    1,
  );
  await assert.rejects(cerrarOtrasSesiones("gente; DROP TABLE gente", { id: "g1" }), /no válida/);
});

test("credenciales y comprobarPassword (sin delatar correos inexistentes)", async () => {
  assert.deepEqual(credenciales({ email: "  Ana@X.CO ", password: "p" }), {
    email: "ana@x.co",
    password: "p",
  });
  assert.deepEqual(credenciales({}), { email: "", password: "" });
  const h = await hashPassword("Clave12345");
  assert.equal(await comprobarPassword("Clave12345", h), true);
  assert.equal(await comprobarPassword("mala", h), false);
  assert.equal(await comprobarPassword("Clave12345", undefined), false);
});

test("frenoDeIntentos bloquea tras 5 fallos y limita por IP", () => {
  const clave = `prueba|${Math.random()}`;
  for (let i = 0; i < 5; i++) frenoDeIntentos(clave, "10.0.0.1", { prefijo: "p1" }).fallo();
  assert.throws(
    () => frenoDeIntentos(clave, "10.0.0.1", { prefijo: "p1" }),
    (e) => e instanceof HttpError && e.status === 429,
  );
  const ip = `10.9.${Math.floor(Math.random() * 200)}.1`;
  frenoDeIntentos("a", ip, { maxPorIp: 1, prefijo: "p2" });
  assert.throws(
    () => frenoDeIntentos("b", ip, { maxPorIp: 1, prefijo: "p2" }),
    /Demasiados intentos/,
  );
});

test("secretos de recuperación: crean, restablecen y se aplican una sola vez", async () => {
  await base();
  olvidarCacheDeSecretos();
  const ops = {
    clave: "recuperar_prueba",
    buscar: (email) => db.get("SELECT id, password_hash FROM gente WHERE email = ?", [email]),
    actualizar: (id, hash) => db.run("UPDATE gente SET password_hash = ? WHERE id = ?", [hash, id]),
    crear: (email, hash) =>
      db.run("INSERT INTO gente (id, email, password_hash) VALUES ('n1', ?, ?)", [email, hash]),
  };
  assert.equal(
    await aplicarSecretosDeRecuperacion({ ...ops, email: "Yo@X.co", password: "Rescate123" }),
    true,
  );
  const u = await db.get("SELECT password_hash FROM gente WHERE email = 'yo@x.co'");
  assert.equal(await verifyPassword("Rescate123", u.password_hash), true);
  // La persona cambia su contraseña; una instancia nueva con los mismos secretos no la deshace.
  await db.run("UPDATE gente SET password_hash = ? WHERE email = 'yo@x.co'", [
    await hashPassword("Propia2026"),
  ]);
  olvidarCacheDeSecretos();
  assert.equal(
    await aplicarSecretosDeRecuperacion({ ...ops, email: "yo@x.co", password: "Rescate123" }),
    false,
  );
  const u2 = await db.get("SELECT password_hash FROM gente WHERE email = 'yo@x.co'");
  assert.equal(await verifyPassword("Propia2026", u2.password_hash), true);
  // Secretos nuevos sí se aplican; una contraseña corta se ignora.
  olvidarCacheDeSecretos();
  assert.equal(
    await aplicarSecretosDeRecuperacion({ ...ops, email: "yo@x.co", password: "Nueva12345" }),
    true,
  );
  const original = console.error;
  console.error = () => {};
  assert.equal(
    await aplicarSecretosDeRecuperacion({ ...ops, email: "yo@x.co", password: "123" }),
    false,
  );
  console.error = original;
});
