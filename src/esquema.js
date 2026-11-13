// Cambios de esquema que la app aplica sola (sin terminal ni `wrangler d1 migrations`).
// En una base vacía crea primero las tablas del esquema base (src/esquema-base.js).
//
// Solo columnas NUEVAS y opcionales: se comprueba si existen y, si no, se añaden con ALTER TABLE.
// Es idempotente y se revisa una vez por instancia del Worker. El esquema base sigue en
// migrations/0001_schema.sql; aquí van las ampliaciones posteriores.
import { db, d1Actual } from './db.js';
import { ESQUEMA_BASE } from './esquema-base.js';

export const COLUMNAS = [
  // RIF del negocio (aparece en el presupuesto)
  ['configuracion_negocio', 'rif', 'TEXT'],
  // Al borrar datos antiguos, el código correlativo no debe volver a empezar: se sigue desde aquí.
  ['configuracion_negocio', 'secuencia_base', 'INTEGER NOT NULL DEFAULT 0'],
  // Cuántas veces se puede pedir un MISMO examen de la categoría en un presupuesto (NULL o 1 = una sola vez)
  ['categorias', 'max_por_examen', 'INTEGER'],
  // Cantidad de cada línea del presupuesto (p. ej. «Biopsia ×3»); precio_cent guarda el total de la línea
  ['presupuesto_items', 'cantidad', 'INTEGER NOT NULL DEFAULT 1'],
];

// Una revisión por base de datos (el binding D1) y por instancia del Worker.
const revisadas = new WeakMap();

/** binding: la base de datos (el binding D1); por defecto, la que tenga enlazada db.js. */
export function asegurarEsquema(binding = d1Actual()) {
  let listo = revisadas.get(binding);
  if (!listo) {
    listo = aplicar().catch((e) => {
      revisadas.delete(binding); // se reintenta en la próxima petición
      throw e;
    });
    revisadas.set(binding, listo);
  }
  return listo;
}

/** Las instrucciones del esquema base, sin comentarios (algunos comentarios llevan «;»). */
export function instruccionesBase() {
  return ESQUEMA_BASE.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n')
    .split(';').map((x) => x.trim()).filter(Boolean);
}

async function aplicar() {
  // Base vacía (p. ej. el sitio de pruebas): se crean las tablas del esquema base.
  // Todas usan IF NOT EXISTS, así que no tocan una base que ya las tenga.
  if (!(await db.all('PRAGMA table_info(negocios)')).length) {
    for (const sql of instruccionesBase()) await db.run(sql);
  }
  const tablas = [...new Set(COLUMNAS.map(([t]) => t))];
  for (const tabla of tablas) {
    const existentes = new Set((await db.all(`PRAGMA table_info(${tabla})`)).map((c) => c.name));
    for (const [t, col, tipo] of COLUMNAS) {
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
