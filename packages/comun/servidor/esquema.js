// Cambios de esquema que cada app aplica sola (sin terminal ni `wrangler d1 migrations`).
//
//   const asegurarEsquema = crearEsquema({ base: ESQUEMA_BASE, testigo: 'negocios', columnas: [...] });
//   await asegurarEsquema(c.env.DB);   // crearServidor() lo hace en cada petición (barato: una vez por instancia)
//
//  • En una base vacía (p. ej. el sitio de pruebas) crea las tablas del esquema base de la app.
//  • Crea siempre las tablas comunes de la plataforma (_cuotas, _ajustes; ver TABLAS_COMUNES).
//  • Añade las columnas NUEVAS y opcionales que falten (ALTER TABLE). Es idempotente.
import { d1Actual, db } from "./db.js";

/** Tablas que usa la propia librería, iguales en todas las apps. */
export const TABLAS_COMUNES = `
-- Contadores diarios para topes de uso (cuotaDiaria en cuotas.js)
CREATE TABLE IF NOT EXISTS _cuotas (
  clave TEXT NOT NULL,
  dia   TEXT NOT NULL,
  n     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (clave, dia)
);
-- Ajustes internos de la plataforma (clave → valor)
CREATE TABLE IF NOT EXISTS _ajustes (
  clave          TEXT PRIMARY KEY,
  valor          TEXT,
  actualizado_en TEXT NOT NULL
);
`;

/** Las instrucciones de un esquema SQL, sin comentarios (algunos comentarios llevan «;»). */
export function instrucciones(sql) {
  return String(sql).split("\n").map((l) => l.replace(/--.*$/, "")).join("\n")
    .split(";").map((x) => x.trim()).filter(Boolean);
}

/**
 * base: SQL del esquema base de la app (CREATE TABLE IF NOT EXISTS …).
 * testigo: una tabla del esquema base; si no existe, la base está vacía y se crea el esquema base.
 * columnas: [[tabla, columna, tipo], …] ampliaciones posteriores al esquema base.
 */
export function crearEsquema({ base = "", testigo = null, columnas = [] } = {}) {
  // Una revisión por base de datos (el binding D1) y por instancia del Worker.
  const revisadas = new WeakMap();

  async function aplicar() {
    if (base && testigo && !(await db.all(`PRAGMA table_info(${testigo})`)).length) {
      for (const sql of instrucciones(base)) await db.run(sql);
    }
    for (const sql of instrucciones(TABLAS_COMUNES)) await db.run(sql);
    const tablas = [...new Set(columnas.map(([t]) => t))];
    for (const tabla of tablas) {
      const existentes = new Set((await db.all(`PRAGMA table_info(${tabla})`)).map((c) => c.name));
      for (const [t, col, tipo] of columnas) {
        if (t !== tabla || existentes.has(col)) continue;
        try {
          await db.run(`ALTER TABLE ${t} ADD COLUMN ${col} ${tipo}`);
        } catch (e) {
          // Otra instancia pudo añadirla a la vez: no es un error.
          if (!/duplicate column/i.test(String(e?.message || e))) throw e;
        }
      }
    }
  }

  /** binding: la base de datos (el binding D1); por defecto, la que tenga enlazada db.js. */
  return function asegurarEsquema(binding = d1Actual()) {
    let listo = revisadas.get(binding);
    if (!listo) {
      listo = aplicar().catch((e) => {
        revisadas.delete(binding); // se reintenta en la próxima petición
        throw e;
      });
      revisadas.set(binding, listo);
    }
    return listo;
  };
}
