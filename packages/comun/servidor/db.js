// ─────────────────────────────────────────────────────────────────────────────
// ÚNICO módulo que toca la base de datos. El resto de la aplicación solo usa:
//   db.all(sql, params) -> filas      db.get(sql, params) -> fila | undefined
//   db.run(sql, params) -> { changes } db.tx(async (t) => { ... })
//
// Aquí el motor es Cloudflare D1. Diferencias importantes con una base "normal":
//  • D1 NO tiene transacciones interactivas (BEGIN/COMMIT). db.tx() funciona así:
//      - las LECTURAS (t.all / t.get) se ejecutan en el momento;
//      - las ESCRITURAS (t.run) se acumulan y, al terminar la función, se envían juntas con
//        D1.batch(), que es atómico (o se aplican todas o ninguna).
//    Por eso dentro de db.tx() no se debe leer algo que se acaba de escribir en la misma función,
//    y t.run() devuelve { changes: undefined } (no se conoce hasta confirmar).
//  • Máximo 100 parámetros "?" por consulta.
//  • Las claves foráneas siempre están activas.
// El adaptador es el mismo para pruebas locales: se le pasa cualquier objeto con la API de D1
// (ver d1-local.js, que la imita sobre node:sqlite).
// ─────────────────────────────────────────────────────────────────────────────

let d1 = null;

/** Enlaza la base de datos (binding D1). crearServidor() lo llama en cada petición. */
export function bindD1(binding) {
  if (!binding) throw new Error('Falta el binding D1 "DB" (revisa wrangler.jsonc → d1_databases).');
  d1 = binding;
}

/** El binding D1 enlazado ahora mismo (sirve de clave para recordar qué base ya se revisó). */
export const d1Actual = () => d1;

const norm = (p = []) => p.map((v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v));
const stmt = (sql, p) => {
  if (!d1) throw new Error('La base de datos no está enlazada.');
  const s = d1.prepare(sql);
  const v = norm(p);
  return v.length ? s.bind(...v) : s;
};

export const db = {
  dialect: 'd1',
  all: async (sql, p) => (await stmt(sql, p).all()).results ?? [],
  get: async (sql, p) => (await stmt(sql, p).first()) ?? undefined,
  run: async (sql, p) => {
    const r = await stmt(sql, p).run();
    return { changes: Number(r?.meta?.changes ?? 0) };
  },
  tx: async (fn) => {
    const pendientes = [];
    const t = {
      all: async (sql, p) => (await stmt(sql, p).all()).results ?? [],
      get: async (sql, p) => (await stmt(sql, p).first()) ?? undefined,
      run: async (sql, p) => { pendientes.push(stmt(sql, p)); return { changes: undefined }; },
    };
    const resultado = await fn(t);
    if (pendientes.length) await d1.batch(pendientes); // atómico
    return resultado;
  },
};
