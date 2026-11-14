// Tablas de __TITULO__. La app las crea sola en una base vacía (mecanismo de @dualstudio/comun).
// Para columnas nuevas más adelante, añádelas a COLUMNAS: [['tabla', 'columna', 'TIPO'], …].
import { crearEsquema } from '@dualstudio/comun/servidor';

export const ESQUEMA_BASE = `
CREATE TABLE IF NOT EXISTS ejemplos (
  id        TEXT PRIMARY KEY,
  texto     TEXT NOT NULL,
  creado_en TEXT NOT NULL
);
`;

export const COLUMNAS = [];

export const asegurarEsquema = crearEsquema({ base: ESQUEMA_BASE, testigo: 'ejemplos', columnas: COLUMNAS });
