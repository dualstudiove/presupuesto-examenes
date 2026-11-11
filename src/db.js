// ─────────────────────────────────────────────────────────────────────────────
// ÚNICO módulo que toca la base de datos. El resto de la aplicación solo usa:
//   db.all(sql, params)  -> filas        db.get(sql, params) -> fila | undefined
//   db.run(sql, params)  -> { changes }  db.tx(async (t) => { ... }) -> transacción
// Los parámetros se escriben con "?" (el adaptador de PostgreSQL los convierte).
//
// Dentro de db.tx() usar SOLO el objeto "t" (t.all / t.get / t.run), nunca "db".
//
// Por defecto usa SQLite (node:sqlite, incluido en Node 22). Si se define
// DATABASE_URL=postgres://..., se carga src/db.pg.js (PostgreSQL).
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import { env } from './env.js';

const SCHEMA = fs.readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');

async function crearSqlite() {
  const { DatabaseSync } = await import('node:sqlite');
  const file = env.databaseFile;
  if (file !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const conn = new DatabaseSync(file);
  conn.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

  const norm = (p = []) => p.map((v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v));
  const sAll = (sql, p) => conn.prepare(sql).all(...norm(p)).map((r) => ({ ...r }));
  const sGet = (sql, p) => {
    const r = conn.prepare(sql).get(...norm(p));
    return r ? { ...r } : undefined;
  };
  const sRun = (sql, p) => {
    const r = conn.prepare(sql).run(...norm(p));
    return { changes: Number(r.changes) };
  };

  // Cola: SQLite usa una sola conexión; así ninguna consulta se mezcla con una transacción abierta.
  let chain = Promise.resolve();
  const enqueue = (fn) => {
    const p = chain.then(fn);
    chain = p.then(() => {}, () => {});
    return p;
  };
  const txApi = {
    all: async (sql, p) => sAll(sql, p),
    get: async (sql, p) => sGet(sql, p),
    run: async (sql, p) => sRun(sql, p),
  };

  return {
    dialect: 'sqlite',
    all: (sql, p) => enqueue(() => sAll(sql, p)),
    get: (sql, p) => enqueue(() => sGet(sql, p)),
    run: (sql, p) => enqueue(() => sRun(sql, p)),
    exec: (sql) => enqueue(() => conn.exec(sql)),
    tx: (fn) =>
      enqueue(async () => {
        conn.exec('BEGIN IMMEDIATE');
        try {
          const r = await fn(txApi);
          conn.exec('COMMIT');
          return r;
        } catch (e) {
          try { conn.exec('ROLLBACK'); } catch { /* ya revertida */ }
          throw e;
        }
      }),
  };
}

export const db = env.databaseUrl ? (await import('./db.pg.js')).crearPostgres(env.databaseUrl) : await crearSqlite();

export async function initDb() {
  await db.exec(SCHEMA);
}
