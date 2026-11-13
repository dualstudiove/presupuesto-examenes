// Cambios de esquema que la app aplica sola (sin terminal ni `wrangler d1 migrations`).
//
// Solo columnas NUEVAS y opcionales: se comprueba si existen y, si no, se añaden con ALTER TABLE.
// Es idempotente y se revisa una vez por instancia del Worker. El esquema base sigue en
// migrations/0001_schema.sql; aquí van las ampliaciones posteriores.
import { db } from './db.js';

const COLUMNAS = [
  // RIF del negocio (aparece en el presupuesto)
  ['configuracion_negocio', 'rif', 'TEXT'],
  // Al borrar datos antiguos, el código correlativo no debe volver a empezar: se sigue desde aquí.
  ['configuracion_negocio', 'secuencia_base', 'INTEGER NOT NULL DEFAULT 0'],
  // Máximo de exámenes sueltos de la categoría en un mismo presupuesto (NULL = sin límite; 1 = solo uno)
  ['categorias', 'max_examenes', 'INTEGER'],
];

// Una revisión por base de datos (el binding D1) y por instancia del Worker.
const revisadas = new WeakMap();

export function asegurarEsquema(binding) {
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

async function aplicar() {
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
