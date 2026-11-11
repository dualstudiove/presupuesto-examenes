// Adaptador de PostgreSQL con la misma interfaz que el de SQLite (ver db.js).
//
// ⚠ Escrito para la publicación, pero NO se pudo ejecutar durante el desarrollo
//   (el entorno no permitía instalar el paquete "pg"). Instala con:  npm install pg
//   y prueba con una base vacía antes de usarlo en producción.
import { env } from './env.js';

const convertir = (sql) => {
  let n = 0;
  return sql.replace(/\?/g, () => `$${++n}`);
};

export function crearPostgres(url) {
  let pool;
  let listo;
  const getPool = () =>
    (listo ??= import('pg').then(({ default: pg }) => {
      // COUNT/SUM llegan como texto por defecto: se convierten a número.
      pg.types.setTypeParser(20, (v) => parseInt(v, 10));
      pg.types.setTypeParser(1700, (v) => parseFloat(v));
      pool = new pg.Pool({
        connectionString: url,
        max: 10,
        ssl: /sslmode=require/.test(url) || process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined,
      });
      return pool;
    }));

  const norm = (p = []) => p.map((v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v));
  const ejecutar = async (cliente, sql, p) => cliente.query(convertir(sql), norm(p));

  return {
    dialect: 'postgres',
    all: async (sql, p) => (await ejecutar(await getPool(), sql, p)).rows,
    get: async (sql, p) => (await ejecutar(await getPool(), sql, p)).rows[0],
    run: async (sql, p) => ({ changes: (await ejecutar(await getPool(), sql, p)).rowCount }),
    exec: async (sql) => (await getPool()).query(sql),
    tx: async (fn) => {
      const cliente = await (await getPool()).connect();
      const t = {
        all: async (sql, p) => (await ejecutar(cliente, sql, p)).rows,
        get: async (sql, p) => (await ejecutar(cliente, sql, p)).rows[0],
        run: async (sql, p) => ({ changes: (await ejecutar(cliente, sql, p)).rowCount }),
      };
      try {
        await cliente.query('BEGIN');
        const r = await fn(t);
        await cliente.query('COMMIT');
        return r;
      } catch (e) {
        try { await cliente.query('ROLLBACK'); } catch { /* noop */ }
        throw e;
      } finally {
        cliente.release();
      }
    },
  };
}

void env;
