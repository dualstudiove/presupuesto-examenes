// Validación del contenido de publicaciones y objetivos (se guardan como JSON).
import { HttpError } from '@dualstudio/comun/servidor';

/** Campos que puede tener una publicación (los de la Parrilla de Contenido). */
export const CAMPOS_PUBLICACION = new Set([
  'title', 'format', 'platforms', 'date', 'time', 'status', 'direction', 'copy', 'hashtags',
  'shoot', 'shots', 'shotList', 'shotDone', 'voice', 'location', 'props', 'refs', 'refImgs', 'refShow',
]);
export const FORMATOS = new Set(['reel', 'carrusel', 'foto', 'historia', 'diseno']);
export const ESTADOS = new Set(['idea', 'porproducir', 'produccion', 'listo', 'publicado']);
export const PLATAFORMAS = new Set(['ig', 'tt']);

const MAX_PUBLICACION = 64 * 1024; // bytes del JSON de una publicación
const MAX_OBJETIVO = 32 * 1024;
const MAX_TEXTO = 20_000;

export const esIdPublicacion = (id) => typeof id === 'string' && /^[a-z0-9]{6,40}$/.test(id);
export const esClaveObjetivo = (c) => typeof c === 'string' && /^(m-\d{4}-(0[1-9]|1[0-2])|q-\d{4}-[1-4])$/.test(c);

function revisarValor(v, campo, prof = 0) {
  if (prof > 6) throw new HttpError(400, `El campo «${campo}» es demasiado anidado.`);
  if (v === null || typeof v === 'boolean') return;
  if (typeof v === 'number') { if (!Number.isFinite(v)) throw new HttpError(400, `El campo «${campo}» no es válido.`); return; }
  if (typeof v === 'string') { if (v.length > MAX_TEXTO) throw new HttpError(400, `El campo «${campo}» es demasiado largo.`); return; }
  if (Array.isArray(v)) { if (v.length > 500) throw new HttpError(400, `El campo «${campo}» tiene demasiados elementos.`); v.forEach((x) => revisarValor(x, campo, prof + 1)); return; }
  if (typeof v === 'object') {
    const k = Object.keys(v);
    if (k.length > 100) throw new HttpError(400, `El campo «${campo}» tiene demasiados elementos.`);
    k.forEach((x) => revisarValor(v[x], campo, prof + 1));
    return;
  }
  throw new HttpError(400, `El campo «${campo}» no es válido.`);
}

/** Cambios a una publicación: solo campos conocidos, con su forma. Devuelve el objeto limpio. */
export function validarCambiosPublicacion(cambios) {
  if (!cambios || typeof cambios !== 'object' || Array.isArray(cambios)) throw new HttpError(400, 'Los cambios no son válidos.');
  const out = {};
  for (const [k, v] of Object.entries(cambios)) {
    if (!CAMPOS_PUBLICACION.has(k)) continue; // createdAt, updatedBy… los pone el servidor
    revisarValor(v, k);
    if (k === 'format' && !FORMATOS.has(v)) throw new HttpError(400, 'El formato no es válido.');
    if (k === 'status' && !ESTADOS.has(v)) throw new HttpError(400, 'El estado no es válido.');
    if (k === 'platforms' && (!Array.isArray(v) || v.some((p) => !PLATAFORMAS.has(p)))) throw new HttpError(400, 'Las plataformas no son válidas.');
    if (k === 'date' && v !== '' && !(typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v))) throw new HttpError(400, 'La fecha no es válida.');
    if (k === 'time' && v !== '' && !(typeof v === 'string' && /^\d{2}:\d{2}$/.test(v))) throw new HttpError(400, 'La hora no es válida.');
    if (k === 'refImgs' && (!Array.isArray(v) || v.some((x) => !x || typeof x.id !== 'string'))) throw new HttpError(400, 'Las imágenes no son válidas.');
    out[k] = v;
  }
  return out;
}

/** Cambios a un objetivo: claves sencillas, valores JSON. */
export function validarCambiosObjetivo(cambios) {
  if (!cambios || typeof cambios !== 'object' || Array.isArray(cambios)) throw new HttpError(400, 'Los cambios no son válidos.');
  const out = {};
  for (const [k, v] of Object.entries(cambios)) {
    if (/^(createdAt|createdBy|updatedAt|updatedBy|id)$/.test(k)) continue;
    if (!/^[a-zA-Z][a-zA-Z0-9]{0,30}$/.test(k)) throw new HttpError(400, 'Los cambios no son válidos.');
    revisarValor(v, k);
    out[k] = v;
  }
  return out;
}

/** Une los cambios al documento y comprueba el tamaño total. */
export function unir(actual, cambios, tipo) {
  const doc = { ...actual, ...cambios };
  if (tipo === 'objetivo' && Object.keys(doc).length > 60) throw new HttpError(400, 'El objetivo tiene demasiados campos.');
  const max = tipo === 'objetivo' ? MAX_OBJETIVO : MAX_PUBLICACION;
  if (new TextEncoder().encode(JSON.stringify(doc)).length > max) throw new HttpError(413, 'El contenido es demasiado grande.');
  return doc;
}
