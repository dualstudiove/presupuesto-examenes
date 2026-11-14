// Imita la API de Cloudflare D1 sobre node:sqlite. SOLO para desarrollo en Node: pruebas y generación
// del SQL de ejemplo (seed). En producción se usa el D1 real.
import { DatabaseSync } from "node:sqlite";

export function crearD1Local(file = ":memory:") {
  const conn = new DatabaseSync(file);
  conn.exec("PRAGMA foreign_keys = ON;");
  const preparar = (sql) => {
    let params = [];
    const o = {
      bind: (...p) => {
        params = p;
        return o;
      },
      all: async () => ({
        results: conn.prepare(sql).all(...params).map((r) => ({ ...r })),
        success: true,
      }),
      first: async () => {
        const r = conn.prepare(sql).get(...params);
        return r ? { ...r } : null;
      },
      run: async () => {
        const r = conn.prepare(sql).run(...params);
        return { success: true, meta: { changes: Number(r.changes) } };
      },
      _sync: () => conn.prepare(sql).run(...params),
    };
    return o;
  };
  return {
    prepare: preparar,
    // Como D1: el lote es atómico.
    batch: async (stmts) => {
      conn.exec("BEGIN");
      try {
        const out = [];
        for (const s of stmts) {
          const r = s._sync();
          out.push({ success: true, meta: { changes: Number(r.changes) } });
        }
        conn.exec("COMMIT");
        return out;
      } catch (e) {
        try {
          conn.exec("ROLLBACK");
        } catch { /* ya revertida */ }
        throw new Error(`D1_ERROR: ${e.message}`);
      }
    },
    exec: async (sql) => {
      conn.exec(sql);
      return { count: 1 };
    },
    _conn: conn,
  };
}
