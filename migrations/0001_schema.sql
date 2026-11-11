-- Esquema compatible con SQLite y PostgreSQL.
-- Convenciones para que sea portable:
--   * Identificadores: TEXT (UUID generado por la aplicación).
--   * Fechas/horas: TEXT en ISO-8601 UTC; "dia" es la fecha local (YYYY-MM-DD).
--   * Dinero: enteros en céntimos (precio_cent, total_ref_cent, total_bs_cent).
--   * Booleanos: INTEGER 0/1.

CREATE TABLE IF NOT EXISTS negocios (
  id          TEXT PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,          -- subdominio
  nombre      TEXT NOT NULL,
  activo      INTEGER NOT NULL DEFAULT 1,
  creado_en   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS configuracion_negocio (
  negocio_id               TEXT PRIMARY KEY REFERENCES negocios(id) ON DELETE CASCADE,
  nombre_publico           TEXT NOT NULL,
  logo                     TEXT,               -- data URL JPEG (<150 KB)
  color_principal          TEXT NOT NULL DEFAULT '#0e7c86',
  telefono                 TEXT,
  direccion                TEXT,
  horario                  TEXT,
  pie_presupuesto          TEXT,
  dias_vigencia            INTEGER NOT NULL DEFAULT 7,
  prefijo_codigo           TEXT NOT NULL DEFAULT 'PE',
  tasa_manual              DOUBLE PRECISION,
  usar_tasa_manual         INTEGER NOT NULL DEFAULT 0,
  precios_actualizados_en  TEXT
);

CREATE TABLE IF NOT EXISTS superadmins (
  id             TEXT PRIMARY KEY,
  email          TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  creado_en      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS usuarios_admin (
  id             TEXT PRIMARY KEY,
  negocio_id     TEXT NOT NULL REFERENCES negocios(id) ON DELETE CASCADE,
  email          TEXT NOT NULL,
  nombre         TEXT,
  password_hash  TEXT NOT NULL,
  activo         INTEGER NOT NULL DEFAULT 1,
  creado_en      TEXT NOT NULL,
  UNIQUE (negocio_id, email)
);

CREATE TABLE IF NOT EXISTS categorias (
  id          TEXT PRIMARY KEY,
  negocio_id  TEXT NOT NULL REFERENCES negocios(id) ON DELETE CASCADE,
  nombre      TEXT NOT NULL,
  orden       INTEGER NOT NULL DEFAULT 0,
  activo      INTEGER NOT NULL DEFAULT 1,
  UNIQUE (negocio_id, nombre)
);

CREATE TABLE IF NOT EXISTS examenes (
  id              TEXT PRIMARY KEY,
  negocio_id      TEXT NOT NULL REFERENCES negocios(id) ON DELETE CASCADE,
  categoria_id    TEXT NOT NULL REFERENCES categorias(id),
  nombre          TEXT NOT NULL,
  precio_cent     INTEGER NOT NULL CHECK (precio_cent >= 0),
  descripcion     TEXT,
  indicaciones    TEXT,
  activo          INTEGER NOT NULL DEFAULT 1,
  creado_en       TEXT NOT NULL,
  actualizado_en  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS perfiles (
  id              TEXT PRIMARY KEY,
  negocio_id      TEXT NOT NULL REFERENCES negocios(id) ON DELETE CASCADE,
  nombre          TEXT NOT NULL,
  descripcion     TEXT,
  precio_cent     INTEGER NOT NULL CHECK (precio_cent >= 0),
  activo          INTEGER NOT NULL DEFAULT 1,
  creado_en       TEXT NOT NULL,
  actualizado_en  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS perfil_examenes (
  perfil_id  TEXT NOT NULL REFERENCES perfiles(id) ON DELETE CASCADE,
  examen_id  TEXT NOT NULL REFERENCES examenes(id) ON DELETE CASCADE,
  PRIMARY KEY (perfil_id, examen_id)
);

CREATE TABLE IF NOT EXISTS origenes (
  id          TEXT PRIMARY KEY,
  negocio_id  TEXT NOT NULL REFERENCES negocios(id) ON DELETE CASCADE,
  nombre      TEXT NOT NULL,
  orden       INTEGER NOT NULL DEFAULT 0,
  activo      INTEGER NOT NULL DEFAULT 1
);

-- Tasa oficial BCV (global: es la misma para todos los negocios).
CREATE TABLE IF NOT EXISTS tasa_bcv (
  id            TEXT PRIMARY KEY,
  fecha_valor   TEXT NOT NULL,                -- fecha a la que corresponde la tasa
  valor         DOUBLE PRECISION NOT NULL,    -- Bs. por 1 REF
  fuente        TEXT NOT NULL,
  obtenido_en   TEXT NOT NULL,
  verificado_en TEXT NOT NULL
);

-- Estadísticas. NO contienen datos personales del paciente.
CREATE TABLE IF NOT EXISTS presupuestos (
  id              TEXT PRIMARY KEY,
  negocio_id      TEXT NOT NULL REFERENCES negocios(id) ON DELETE CASCADE,
  secuencia       INTEGER NOT NULL,
  codigo          TEXT NOT NULL,
  creado_en       TEXT NOT NULL,
  dia             TEXT NOT NULL,
  hora            INTEGER NOT NULL,
  dow             INTEGER NOT NULL,            -- 0 = domingo
  total_ref_cent  INTEGER NOT NULL,
  tasa_usada      DOUBLE PRECISION NOT NULL,
  total_bs_cent   INTEGER NOT NULL,
  origen_id       TEXT,
  origen_nombre   TEXT,
  dispositivo     TEXT NOT NULL,
  num_items       INTEGER NOT NULL,
  UNIQUE (negocio_id, secuencia)
);

CREATE TABLE IF NOT EXISTS presupuesto_items (
  id              TEXT PRIMARY KEY,
  presupuesto_id  TEXT NOT NULL REFERENCES presupuestos(id) ON DELETE CASCADE,
  negocio_id      TEXT NOT NULL,
  dia             TEXT NOT NULL,
  tipo            TEXT NOT NULL,               -- 'examen' | 'perfil'
  ref_id          TEXT,
  nombre          TEXT NOT NULL,               -- copia del nombre al generar
  precio_cent     INTEGER NOT NULL             -- copia del precio al generar
);

-- Exámenes "expandidos": un perfil aporta una fila por cada examen que incluye.
CREATE TABLE IF NOT EXISTS presupuesto_examenes (
  id                TEXT PRIMARY KEY,
  presupuesto_id    TEXT NOT NULL REFERENCES presupuestos(id) ON DELETE CASCADE,
  negocio_id        TEXT NOT NULL,
  dia               TEXT NOT NULL,
  examen_id         TEXT,
  examen_nombre     TEXT NOT NULL,
  categoria_nombre  TEXT NOT NULL,
  perfil_nombre     TEXT                       -- NULL si se pidió de forma individual
);

CREATE TABLE IF NOT EXISTS visitas (
  id          TEXT PRIMARY KEY,
  negocio_id  TEXT NOT NULL REFERENCES negocios(id) ON DELETE CASCADE,
  creado_en   TEXT NOT NULL,
  dia         TEXT NOT NULL,
  hora        INTEGER NOT NULL,
  dow         INTEGER NOT NULL,
  dispositivo TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_categorias_negocio  ON categorias (negocio_id);
CREATE INDEX IF NOT EXISTS idx_examenes_negocio    ON examenes (negocio_id);
CREATE INDEX IF NOT EXISTS idx_perfiles_negocio    ON perfiles (negocio_id);
CREATE INDEX IF NOT EXISTS idx_origenes_negocio    ON origenes (negocio_id);
CREATE INDEX IF NOT EXISTS idx_presup_negocio_dia  ON presupuestos (negocio_id, dia);
CREATE INDEX IF NOT EXISTS idx_pitems_negocio_dia  ON presupuesto_items (negocio_id, dia);
CREATE INDEX IF NOT EXISTS idx_pexam_negocio_dia   ON presupuesto_examenes (negocio_id, dia);
CREATE INDEX IF NOT EXISTS idx_visitas_negocio_dia ON visitas (negocio_id, dia);
CREATE INDEX IF NOT EXISTS idx_tasa_obtenida       ON tasa_bcv (obtenido_en);
