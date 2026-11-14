import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { crearEntorno } from "./ayudas.js";
import { configurarEnv } from "../src/env.js";
import { bindD1, db } from "@dualstudio/comun/servidor";
import { sembrar, volcarSql } from "../src/seed.js";
import { crearPresupuesto } from "../src/negocio.js";

const preparar = async () => {
  const b = await crearEntorno();
  configurarEnv(b);
  bindD1(b.DB);
  return b;
};

test("db.tx: las escrituras se aplican juntas y, si una falla, no se aplica ninguna", async () => {
  await preparar();
  await db.run(
    "INSERT INTO negocios (id, slug, nombre, activo, creado_en) VALUES ('1','a','A',1,'x')",
  );
  await assert.rejects(db.tx(async (t) => {
    await t.run(
      "INSERT INTO negocios (id, slug, nombre, activo, creado_en) VALUES ('2','b','B',1,'x')",
    );
    await t.run(
      "INSERT INTO negocios (id, slug, nombre, activo, creado_en) VALUES ('3','a','dup',1,'x')",
    ); // slug repetido
  }));
  assert.equal(
    (await db.all("SELECT id FROM negocios")).length,
    1,
    "la primera escritura debió revertirse",
  );
});

test("db.tx: las lecturas ven datos y las escrituras se confirman al terminar", async () => {
  await preparar();
  const r = await db.tx(async (t) => {
    await t.run(
      "INSERT INTO negocios (id, slug, nombre, activo, creado_en) VALUES ('1','a','A',1,'x')",
    );
    return (await t.all("SELECT id FROM negocios")).length; // aún no confirmado
  });
  assert.equal(r, 0);
  assert.equal((await db.all("SELECT id FROM negocios")).length, 1);
});

test("presupuestos simultáneos: cada uno recibe un código distinto (reintento por UNIQUE)", async () => {
  await preparar();
  await sembrar({ demo: true });
  const neg = await db.get("SELECT id, slug, nombre, activo FROM negocios WHERE slug = 'demo'");
  const ex = await db.all("SELECT id FROM examenes WHERE negocio_id = ? LIMIT 12", [neg.id]);
  const res = await Promise.all(
    ex.map((e) => crearPresupuesto(neg, { items: [{ tipo: "examen", id: e.id }] })),
  );
  const codigos = new Set(res.map((r) => r.codigo));
  assert.equal(codigos.size, ex.length, "códigos repetidos");
});

test("el SQL de seed se carga en una base nueva y deja los datos utilizables", async () => {
  await preparar();
  await sembrar({ demo: true });
  const sql = await volcarSql();
  const otra = await crearEntorno();
  await otra.DB.exec(sql);
  const n = await otra.DB.prepare("SELECT COUNT(*) AS n FROM presupuestos").first();
  const o = await otra.DB.prepare("SELECT COUNT(*) AS n FROM examenes").first();
  assert.ok(n.n > 100 && o.n > 30);
  assert.ok(sql.includes("INSERT INTO superadmins"));
});

test("contraseñas: PBKDF2 verifica bien y no acepta otras", async () => {
  const { hashPassword, verifyPassword, HASH_RELLENO } = await import("@dualstudio/comun/servidor");
  const h = await hashPassword("Clave-123");
  assert.ok(h.startsWith("s2$"));
  assert.equal(await verifyPassword("Clave-123", h), true);
  assert.equal(await verifyPassword("otra", h), false);
  assert.equal(await verifyPassword("x", HASH_RELLENO), false);
});

test("scheduled: el Cron Trigger consulta la tasa (con la fuente simulada)", async () => {
  const b = await preparar();
  const worker = (await import("../src/server.js")).default;
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ promedio: 123.45, fechaActualizacion: "2026-11-10T12:00:00Z" }), {
      headers: { "content-type": "application/json" },
    });
  let pendiente;
  try {
    await worker.scheduled({}, { ...b, BCV_DISABLED: "false" }, {
      waitUntil: (p) => {
        pendiente = p;
      },
    });
    const r = await pendiente;
    assert.equal(r.ok, true);
    assert.equal(
      (await db.get("SELECT valor FROM tasa_bcv ORDER BY obtenido_en DESC LIMIT 1")).valor,
      123.45,
    );
  } finally {
    globalThis.fetch = original;
  }
});

void fs;
