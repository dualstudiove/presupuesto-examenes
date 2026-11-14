// Tasa oficial del BCV: se consulta a una fuente pública (configurable), se guarda
// en la base de datos y se usa la última conocida si la consulta falla.
import { db, rt } from "@dualstudio/comun/servidor";
import { env } from "./env.js";
import { nowIso, parteFecha, uuid } from "./util.js";

/** Extrae { valor, fechaValor } de las respuestas JSON más comunes. */
export function parseTasa(json) {
  const candidatos = [
    json?.promedio,
    json?.price,
    json?.precio,
    json?.usd,
    json?.rate,
    json?.valor,
    json?.venta,
    json?.monitors?.usd?.price,
    json?.data?.promedio,
    json?.data?.price,
  ];
  for (const c of candidatos) {
    const n = typeof c === "string" ? Number(c.replace(",", ".")) : c;
    if (typeof n === "number" && Number.isFinite(n) && n > 0 && n < 1e7) {
      const f = json?.fechaActualizacion || json?.last_update || json?.fecha || json?.datetime ||
        json?.data?.fechaActualizacion;
      const t = f ? Date.parse(f) : NaN;
      return { valor: n, fechaValor: parteFecha(Number.isNaN(t) ? new Date() : new Date(t)).dia };
    }
  }
  return null;
}

let ultimoIntento = 0;
let enCurso = null;
let ultimoError = null;

export function estadoConsulta() {
  return {
    ultimoIntento: ultimoIntento ? new Date(ultimoIntento).toISOString() : null,
    ultimoError,
  };
}

export function refrescarTasa({ forzar = false } = {}) {
  if (env.bcvDisabled && !forzar) {
    return Promise.resolve({ ok: false, error: "La consulta automática está desactivada." });
  }
  if (enCurso) return enCurso;
  enCurso = (async () => {
    try {
      const r = await fetch(env.bcvUrl, {
        signal: AbortSignal.timeout(8000),
        headers: { accept: "application/json", "user-agent": "presupuesto-examenes/1.0" },
      });
      if (!r.ok) throw new Error(`La fuente respondió ${r.status}`);
      const parsed = parseTasa(await r.json());
      if (!parsed) throw new Error("No se encontró la tasa en la respuesta de la fuente");
      const fuente = new URL(env.bcvUrl).hostname;
      const ahora = nowIso();
      const ult = await db.get(
        "SELECT id, valor, fecha_valor, fuente FROM tasa_bcv ORDER BY obtenido_en DESC LIMIT 1",
      );
      if (
        ult && ult.fuente === fuente && ult.valor === parsed.valor &&
        ult.fecha_valor === parsed.fechaValor
      ) {
        await db.run("UPDATE tasa_bcv SET verificado_en = ? WHERE id = ?", [ahora, ult.id]);
      } else {
        await db.run(
          "INSERT INTO tasa_bcv (id, fecha_valor, valor, fuente, obtenido_en, verificado_en) VALUES (?,?,?,?,?,?)",
          [uuid(), parsed.fechaValor, parsed.valor, fuente, ahora, ahora],
        );
      }
      ultimoError = null;
      return { ok: true, valor: parsed.valor, fecha_valor: parsed.fechaValor, fuente };
    } catch (e) {
      ultimoError = String(e.message || e).slice(0, 200);
      return { ok: false, error: ultimoError };
    } finally {
      ultimoIntento = Date.now();
      enCurso = null;
    }
  })();
  return enCurso;
}

/** Última tasa guardada (global) con su estado de frescura. */
export async function tasaGlobal() {
  const r = await db.get(
    "SELECT valor, fecha_valor, fuente, verificado_en FROM tasa_bcv ORDER BY obtenido_en DESC LIMIT 1",
  );
  if (!r) return null;
  const horas = (Date.now() - Date.parse(r.verificado_en)) / 36e5;
  return {
    valor: r.valor,
    fecha_valor: r.fecha_valor,
    fuente: r.fuente,
    verificado_en: r.verificado_en,
    desactualizada: horas > env.bcvStaleHours,
    manual: false,
    _horas: horas,
  };
}

/** Si la tasa lleva más de 6 h sin verificarse, reintenta en segundo plano (como máximo cada 10 min). */
export function refrescarSiHaceFalta(tasa) {
  if (env.bcvDisabled) return;
  const sinVerificar = !tasa || tasa._horas > 6;
  if (sinVerificar && Date.now() - ultimoIntento > 10 * 60 * 1000) rt.waitUntil(refrescarTasa());
}

export async function guardarTasaManualGlobal(valor, fuente = "manual (superadministrador)") {
  const ahora = nowIso();
  await db.run(
    "INSERT INTO tasa_bcv (id, fecha_valor, valor, fuente, obtenido_en, verificado_en) VALUES (?,?,?,?,?,?)",
    [uuid(), parteFecha().dia, valor, fuente, ahora, ahora],
  );
}

/** Se ejecuta con el Cron Trigger de Cloudflare (wrangler.jsonc → triggers.crons): una vez por hora. */
export const consultaProgramada = () => refrescarTasa();
