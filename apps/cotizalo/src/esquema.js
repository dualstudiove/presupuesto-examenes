// Esquema de Cotízalo que la app aplica sola (mecanismo de @dualstudio/comun: crearEsquema).
// En una base vacía crea las tablas del esquema base (src/esquema-base.js = migrations/0001_schema.sql);
// después añade las columnas posteriores de COLUMNAS si faltan.
//
// Solo columnas NUEVAS y opcionales. El esquema base sigue en migrations/0001_schema.sql; aquí van las ampliaciones.
import { crearEsquema } from '@dualstudio/comun/servidor';
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
  // Lo que escribió el paciente al elegir «Otro» en «¿Cómo se enteró de nosotros?»
  ['presupuestos', 'origen_detalle', 'TEXT'],
  // Versión de sesión: al subirla («Cerrar sesión en los demás dispositivos») las cookies anteriores dejan de valer
  ['superadmins', 'sesion_version', 'INTEGER NOT NULL DEFAULT 0'],
  ['usuarios_admin', 'sesion_version', 'INTEGER NOT NULL DEFAULT 0'],
];

export const asegurarEsquema = crearEsquema({ base: ESQUEMA_BASE, testigo: 'negocios', columnas: COLUMNAS });



