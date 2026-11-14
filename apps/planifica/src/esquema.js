// Tablas de Planifica. La app las crea sola en una base vacía (mecanismo de @dualstudio/comun).
// Para columnas nuevas más adelante, añádelas a COLUMNAS: [['tabla', 'columna', 'TIPO'], …].
//
// Multicliente: todo lo que se planifica cuelga de un cliente (cliente_id) y ninguna consulta cruza clientes.
// Las publicaciones y los objetivos guardan su contenido como JSON (datos) con campos permitidos y tamaño máximo
// (ver validar.js): así la interfaz puede evolucionar sin migraciones para cada campo nuevo.
import { crearEsquema } from "@dualstudio/comun/servidor";

export const ESQUEMA_BASE = `
CREATE TABLE IF NOT EXISTS usuarios (
  id             TEXT PRIMARY KEY,
  email          TEXT NOT NULL UNIQUE,
  nombre         TEXT NOT NULL DEFAULT '',
  password_hash  TEXT NOT NULL,
  es_admin       INTEGER NOT NULL DEFAULT 0,  -- administrador de Dual Studio: ve todos los clientes y gestiona el equipo
  activo         INTEGER NOT NULL DEFAULT 1,
  sesion_version INTEGER NOT NULL DEFAULT 0,  -- al subirla, las sesiones abiertas dejan de valer
  creado_en      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS clientes (
  id          TEXT PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,           -- dirección: /planifica/<slug>
  nombre      TEXT NOT NULL,
  handle      TEXT,                           -- cuenta de Instagram, p. ej. @laboratoriorh
  activo      INTEGER NOT NULL DEFAULT 1,     -- 0 = archivado (solo lo ven los administradores)
  cambiado_en INTEGER NOT NULL DEFAULT 0,     -- marca de tiempo del último cambio (para refrescar sin descargar todo)
  creado_en   TEXT NOT NULL
);

-- Qué usuario ve qué cliente y con qué papel
CREATE TABLE IF NOT EXISTS accesos (
  usuario_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  cliente_id TEXT NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  rol        TEXT NOT NULL CHECK (rol IN ('editor', 'lector')),
  PRIMARY KEY (usuario_id, cliente_id)
);

CREATE TABLE IF NOT EXISTS publicaciones (
  id              TEXT PRIMARY KEY,
  cliente_id      TEXT NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  datos           TEXT NOT NULL,                -- JSON: título, formato, fecha, estado, copy, tomas…
  creado_en       INTEGER NOT NULL,
  creado_por      TEXT,
  actualizado_en  INTEGER NOT NULL,
  actualizado_por TEXT
);
CREATE INDEX IF NOT EXISTS idx_publicaciones_cliente ON publicaciones (cliente_id);

-- Objetivos del mes (m-AAAA-MM) y del trimestre (q-AAAA-N)
CREATE TABLE IF NOT EXISTS objetivos (
  cliente_id      TEXT NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  clave           TEXT NOT NULL,
  datos           TEXT NOT NULL,
  creado_en       INTEGER NOT NULL,
  creado_por      TEXT,
  actualizado_en  INTEGER NOT NULL,
  actualizado_por TEXT,
  PRIMARY KEY (cliente_id, clave)
);

-- Imágenes de referencia. almacen dice dónde está el contenido: 'd1' (aquí mismo) o, más adelante, otro
-- almacenamiento (p. ej. Google Drive), con la misma tabla para los datos de la imagen.
CREATE TABLE IF NOT EXISTS imagenes (
  id         TEXT PRIMARY KEY,
  cliente_id TEXT NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  tipo       TEXT NOT NULL,
  bytes      INTEGER NOT NULL,
  almacen    TEXT NOT NULL DEFAULT 'd1',
  contenido  BLOB,
  creado_en  TEXT NOT NULL,
  creado_por TEXT
);
CREATE INDEX IF NOT EXISTS idx_imagenes_cliente ON imagenes (cliente_id);
`;

export const COLUMNAS = [];

export const asegurarEsquema = crearEsquema({
  base: ESQUEMA_BASE,
  testigo: "usuarios",
  columnas: COLUMNAS,
});
