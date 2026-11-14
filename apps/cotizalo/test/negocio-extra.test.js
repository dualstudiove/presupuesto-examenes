// RIF, límite de exámenes por categoría, borrado de estadísticas y columnas nuevas que la app añade sola.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { crearEntorno, levantar } from "./ayudas.js";

let server;
let port;
let D1;
const jar = {};

async function pedir(path, { method = "GET", body, conSesion = true } = {}) {
  const headers = { "x-app": "1" };
  if (body) headers["content-type"] = "application/json";
  if (conSesion && Object.keys(jar).length) {
    headers.cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
  }
  const r = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  for (const c of r.headers.getSetCookie()) {
    const [par] = c.split(";");
    const i = par.indexOf("=");
    jar[par.slice(0, i)] = par.slice(i + 1);
  }
  const texto = await r.text();
  let json = null;
  try {
    json = JSON.parse(texto);
  } catch { /* no es JSON */ }
  return { status: r.status, json, texto };
}
const admin = (path, o = {}) => pedir(`/demo/api/admin${path}`, o);
const publico = (path, o = {}) => pedir(`/demo/api/publico${path}`, { ...o, conSesion: false });

before(async () => {
  const bindings = await crearEntorno();
  D1 = bindings.DB;
  const { configurarEnv } = await import("../src/env.js");
  const { bindD1 } = await import("@dualstudio/comun/servidor");
  configurarEnv(bindings);
  bindD1(bindings.DB);
  const { sembrar } = await import("../src/seed.js");
  await sembrar({ demo: true });
  const worker = (await import("../src/server.js")).default;
  ({ server, port } = await levantar(worker, bindings));
  const r = await admin("/login", {
    method: "POST",
    body: { email: "admin@demo.test", password: "Demo12345" },
  });
  assert.equal(r.status, 200);
});

after(() => server?.close());

test("la app añade sola las columnas nuevas a una base existente", async () => {
  const cols = async (t) =>
    (await D1.prepare(`PRAGMA table_info(${t})`).all()).results.map((c) => c.name);
  assert.ok((await cols("configuracion_negocio")).includes("rif"));
  assert.ok((await cols("configuracion_negocio")).includes("secuencia_base"));
  assert.ok((await cols("categorias")).includes("max_por_examen"));
  assert.ok((await cols("presupuesto_items")).includes("cantidad"));
});

test("RIF: se guarda normalizado, sale en la config pública y en el presupuesto", async () => {
  assert.equal(
    (await admin("/config", { method: "PUT", body: { rif: "j-1234 5678-9" } })).status,
    200,
  );
  assert.equal((await admin("/config")).json.config.rif, "J-12345678-9");
  assert.equal((await publico("/config")).json.negocio.rif, "J-12345678-9");
  const cat = (await publico("/catalogo")).json;
  const r = await publico("/presupuesto", {
    method: "POST",
    body: { items: [{ tipo: "examen", id: cat.examenes[0].id }] },
  });
  assert.equal(r.json.negocio.rif, "J-12345678-9");
  assert.equal((await admin("/config", { method: "PUT", body: { rif: "J/123" } })).status, 400);
  assert.equal((await admin("/config", { method: "PUT", body: { rif: "" } })).status, 200);
  assert.equal((await admin("/config")).json.config.rif, null);
});

test("repetir un mismo examen: según su categoría (una vez por defecto, o hasta N veces)", async () => {
  const cat = (await admin("/catalogo")).json;
  const orina = cat.categorias.find((k) => k.nombre === "Orina"); // permitirá repetir
  const hema = cat.categorias.find((k) => k.nombre === "Hematología"); // una sola vez (por defecto)
  const uro = cat.examenes.find((e) => e.categoria_id === orina.id && e.activo);
  const hc = cat.examenes.find((e) => e.categoria_id === hema.id && e.activo);
  const pedirCon = (items) => publico("/presupuesto", { method: "POST", body: { items } });

  // Por defecto, cada examen una sola vez
  const no = await pedirCon([{ tipo: "examen", id: uro.id, cantidad: 2 }]);
  assert.equal(no.status, 409);
  assert.match(no.json.error, /solo se puede pedir una vez/);

  // Orina: hasta 3 veces el mismo examen; Hematología sigue en una
  assert.equal(
    (await admin(`/categorias/${orina.id}`, { method: "PUT", body: { max_por_examen: 3 } })).status,
    200,
  );
  assert.equal(
    (await publico("/catalogo")).json.categorias.find((k) => k.id === orina.id).max_por_examen,
    3,
  );
  const ok = await pedirCon([{ tipo: "examen", id: uro.id, cantidad: 3 }, {
    tipo: "examen",
    id: hc.id,
  }]);
  assert.equal(ok.status, 200, ok.texto);
  const linea = ok.json.items.find((i) => i.id === uro.id);
  assert.equal(linea.cantidad, 3);
  assert.equal(linea.precio_unit_cent, uro.precio_cent);
  assert.equal(linea.precio_cent, uro.precio_cent * 3);
  assert.equal(ok.json.total_ref_cent, uro.precio_cent * 3 + hc.precio_cent);
  assert.match(
    (await pedirCon([{ tipo: "examen", id: uro.id, cantidad: 4 }])).json.error,
    /hasta 3 veces/,
  );
  assert.equal((await pedirCon([{ tipo: "examen", id: hc.id, cantidad: 2 }])).status, 409);

  // Para las estadísticas, cada unidad cuenta
  const filas = (await D1.prepare(
    "SELECT COUNT(*) AS n FROM presupuesto_examenes pe JOIN presupuestos p ON p.id = pe.presupuesto_id WHERE p.codigo = ? AND pe.examen_id = ?",
  ).bind(ok.json.codigo, uro.id).first()).n;
  assert.equal(filas, 3);

  // Cantidades no válidas, ítems repetidos y perfiles con cantidad
  assert.equal((await pedirCon([{ tipo: "examen", id: uro.id, cantidad: 0 }])).status, 400);
  assert.equal((await pedirCon([{ tipo: "examen", id: uro.id, cantidad: 1.5 }])).status, 400);
  assert.equal(
    (await pedirCon([{ tipo: "examen", id: uro.id }, { tipo: "examen", id: uro.id }])).status,
    409,
  );
  assert.equal(
    (await pedirCon([{ tipo: "perfil", id: cat.perfiles[0].id, cantidad: 2 }])).status,
    400,
  );

  // Configuración: valores no válidos y que no se pierda al editar otra cosa
  assert.equal(
    (await admin(`/categorias/${orina.id}`, { method: "PUT", body: { max_por_examen: 500 } }))
      .status,
    400,
  );
  await admin(`/categorias/${orina.id}`, { method: "PUT", body: { orden: 9 } });
  assert.equal(
    (await admin("/catalogo")).json.categorias.find((k) => k.id === orina.id).max_por_examen,
    3,
  );
  await admin(`/categorias/${orina.id}`, { method: "PUT", body: { max_por_examen: 1 } });
  assert.equal(
    (await admin("/catalogo")).json.categorias.find((k) => k.id === orina.id).max_por_examen,
    null,
  );
});

test("borrar estadísticas hasta una fecha: cuenta, borra y los códigos no se repiten", async () => {
  const hoy = new Date(Date.now() - 4 * 3600_000).toISOString().slice(0, 10); // hora de Venezuela
  const sim = await admin("/datos/borrar", { method: "POST", body: { hasta: hoy, simular: true } });
  assert.equal(sim.status, 200);
  assert.equal(sim.json.borrado, false);
  assert.ok(sim.json.presupuestos > 0 && sim.json.visitas > 0);
  const cat = (await publico("/catalogo")).json;
  const antes = await publico("/presupuesto", {
    method: "POST",
    body: { items: [{ tipo: "examen", id: cat.examenes[1].id }] },
  });
  const ultimo = Number(antes.json.codigo.slice(-6));

  const ok = await admin("/datos/borrar", { method: "POST", body: { hasta: hoy } });
  assert.equal(ok.json.borrado, true);
  const desde = new Date(Date.now() - 60 * 86400_000).toISOString().slice(0, 10);
  const d = (await admin(`/dashboard?desde=${desde}&hasta=${hoy}`)).json;
  assert.equal(d.resumen.presupuestos, 0);
  assert.equal(d.resumen.visitas, 0);
  const despues = await publico("/presupuesto", {
    method: "POST",
    body: { items: [{ tipo: "examen", id: cat.examenes[1].id }] },
  });
  assert.equal(
    Number(despues.json.codigo.slice(-6)),
    ultimo + 1,
    "el código sigue desde el último, no vuelve a 1",
  );
  // El catálogo sigue intacto
  assert.equal((await publico("/catalogo")).json.examenes.length, cat.examenes.length);
});

test("borrar estadísticas: fechas no válidas y solo con sesión", async () => {
  assert.equal(
    (await admin("/datos/borrar", { method: "POST", body: { hasta: "ayer" } })).status,
    400,
  );
  assert.equal(
    (await admin("/datos/borrar", { method: "POST", body: { hasta: "2999-01-01" } })).status,
    400,
  );
  assert.equal(
    (await pedir("/demo/api/admin/datos/borrar", {
      method: "POST",
      body: { hasta: "2020-01-01" },
      conSesion: false,
    })).status,
    401,
  );
});

test("«Otro» en ¿Cómo se enteró?: se guarda lo que escriben y sale en el panel; con otra opción se ignora", async () => {
  const cfg = (await publico("/config")).json;
  const otro = cfg.origenes.find((o) => o.nombre === "Otro");
  const insta = cfg.origenes.find((o) => o.nombre === "Instagram");
  assert.equal(otro.pide_detalle, true);
  assert.equal(insta.pide_detalle, false);
  const cat = (await publico("/catalogo")).json;
  const pedir1 = (origen_id, origen_detalle) =>
    publico("/presupuesto", {
      method: "POST",
      body: { items: [{ tipo: "examen", id: cat.examenes[2].id }], origen_id, origen_detalle },
    });
  assert.equal((await pedir1(otro.id, "  Un   volante en la panadería ")).status, 200);
  assert.equal((await pedir1(otro.id, "un volante en la panadería")).status, 200);
  assert.equal((await pedir1(insta.id, "esto no se guarda")).status, 200);
  const guardados =
    (await D1.prepare("SELECT origen_detalle FROM presupuestos WHERE origen_detalle IS NOT NULL")
      .all()).results.map((r) => r.origen_detalle);
  assert.ok(guardados.includes("Un volante en la panadería"), "se guarda limpio");
  assert.ok(!guardados.includes("esto no se guarda"));
  const hoy = new Date(Date.now() - 4 * 3600_000).toISOString().slice(0, 10);
  const d = (await admin(`/dashboard?desde=${hoy}&hasta=${hoy}`)).json;
  const fila = d.origen_detalles.find((x) =>
    x.texto.toLowerCase() === "un volante en la panadería"
  );
  assert.equal(fila.n, 2, "agrupa sin importar mayúsculas");
});

test("reordenar las opciones de ¿Cómo se enteró?", async () => {
  const antes = (await admin("/config")).json.origenes;
  const nuevo = [...antes].reverse().map((o) => o.id);
  assert.equal(
    (await admin("/origenes/orden", { method: "POST", body: { ids: nuevo } })).status,
    200,
  );
  assert.deepEqual((await admin("/config")).json.origenes.map((o) => o.id), nuevo);
  assert.deepEqual(
    (await publico("/config")).json.origenes.map((o) => o.id),
    nuevo.filter((id) => antes.find((o) => o.id === id).activo),
  );
  assert.equal(
    (await admin("/origenes/orden", { method: "POST", body: { ids: nuevo.slice(1) } })).status,
    400,
    "faltan opciones",
  );
  assert.equal(
    (await admin("/origenes/orden", {
      method: "POST",
      body: { ids: [nuevo[0], ...nuevo.slice(0, -1)] },
    })).status,
    400,
    "repetidas",
  );
  assert.equal(
    (await pedir("/demo/api/admin/origenes/orden", {
      method: "POST",
      body: { ids: nuevo },
      conSesion: false,
    })).status,
    401,
  );
});
