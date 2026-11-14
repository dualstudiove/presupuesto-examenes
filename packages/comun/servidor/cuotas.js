// Topes diarios guardados en la base (tabla _cuotas). A diferencia de limite() de auth.js, que vive en la
// memoria de cada instancia del Worker, estos topes son reales: valen para todas las instancias.
//
// Sirven para que un abuso de las rutas públicas no agote la cuota gratuita de la cuenta de Cloudflare
// (peticiones y escrituras de D1 son de TODA la cuenta: si se agotan, se caen todas las apps).
// Cada llamada cuesta una escritura; úsalo en rutas que ya escriben (crear algo), no en lecturas.
import { db } from './db.js';
import { HttpError } from './http.js';
import { hoy, sumarDias } from './util.js';
import { rt } from './runtime.js';

/**
 * Suma 1 al contador de hoy para `clave` y lanza 429 si pasa de `max`.
 * Devuelve cuántas van hoy (incluida esta).
 */
export async function cuotaDiaria(clave, max, mensaje = 'Se alcanzó el límite de uso de hoy. Intenta de nuevo mañana.') {
  const dia = hoy();
  const fila = await db.get(
    'INSERT INTO _cuotas (clave, dia, n) VALUES (?, ?, 1) ON CONFLICT (clave, dia) DO UPDATE SET n = n + 1 RETURNING n',
    [clave, dia],
  );
  // De vez en cuando se borran los contadores viejos (sin hacer esperar a nadie).
  if (Math.random() < 0.01) rt.waitUntil(db.run('DELETE FROM _cuotas WHERE dia < ?', [sumarDias(dia, -3)]));
  const n = Number(fila?.n ?? 0);
  if (n > max) throw new HttpError(429, mensaje);
  return n;
}

/** Cuántas van hoy para `clave` (sin sumar). */
export async function cuotaDeHoy(clave) {
  const fila = await db.get('SELECT n FROM _cuotas WHERE clave = ? AND dia = ?', [clave, hoy()]);
  return Number(fila?.n ?? 0);
}

// ── Ajustes internos (tabla _ajustes) ──
export async function leerAjuste(clave) {
  const fila = await db.get('SELECT valor FROM _ajustes WHERE clave = ?', [clave]);
  return fila ? fila.valor : null;
}
export async function guardarAjuste(clave, valor) {
  await db.run(
    'INSERT INTO _ajustes (clave, valor, actualizado_en) VALUES (?, ?, ?) ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor, actualizado_en = excluded.actualizado_en',
    [clave, valor === null || valor === undefined ? null : String(valor), new Date().toISOString()],
  );
}
