// Imágenes de referencia. Pasan por aquí (guardar, leer, borrar) para que el lugar donde se guarda el contenido
// se pueda cambiar sin tocar el resto de la app. Hoy: D1 ('d1'). Más adelante se puede añadir otro almacén
// (p. ej. Google Drive, una carpeta por cliente) registrándolo en ALMACENES y eligiéndolo al guardar.
//
// Para ahorrar espacio, el navegador ya las envía comprimidas (lado largo 1080 px, WebP). Aquí se pone un tope
// por imagen y otro por cliente.
import { db, HttpError, uuid, nowIso } from '@dualstudio/comun/servidor';

export const MAX_IMAGEN = 400 * 1024; // bytes por imagen
export const TOPE_CLIENTE = 50 * 1024 * 1024; // bytes por cliente
const TIPOS = new Set(['image/webp', 'image/jpeg', 'image/png']);

/** D1 devuelve los BLOB como Array, ArrayBuffer o Uint8Array según el entorno. */
function aBytes(v) {
  if (!v) return new Uint8Array();
  if (v instanceof Uint8Array) return v;
  if (v instanceof ArrayBuffer) return new Uint8Array(v);
  if (Array.isArray(v)) return Uint8Array.from(v);
  return new Uint8Array(v);
}

const ALMACENES = {
  d1: {
    guardar: (_img, bytes) => ({ contenido: bytes }),
    leer: async (img) => aBytes(img.contenido),
    borrar: async () => {}, // el contenido se va con la fila
  },
};

/** Lo que ocupa un cliente (bytes). */
export async function usoDeCliente(clienteId) {
  return Number((await db.get('SELECT COALESCE(SUM(bytes), 0) AS n FROM imagenes WHERE cliente_id = ?', [clienteId])).n);
}

/** base64 (con o sin prefijo data:) → { tipo, bytes } */
export function decodificar(dato, tipoIndicado) {
  let tipo = tipoIndicado;
  let b64 = String(dato || '');
  const m = /^data:([a-z/+-]+);base64,/.exec(b64);
  if (m) { tipo = m[1]; b64 = b64.slice(m[0].length); }
  if (!TIPOS.has(tipo)) throw new HttpError(400, 'La imagen debe ser WebP, JPEG o PNG.');
  if (!/^[A-Za-z0-9+/=]+$/.test(b64)) throw new HttpError(400, 'La imagen no es válida.');
  const bytes = Uint8Array.from(Buffer.from(b64, 'base64'));
  if (!bytes.length) throw new HttpError(400, 'La imagen está vacía.');
  if (bytes.length > MAX_IMAGEN) throw new HttpError(413, 'La imagen es demasiado grande (máximo 400 KB después de comprimirla).');
  return { tipo, bytes };
}

export async function guardarImagen({ clienteId, tipo, bytes, usuarioId, almacen = 'd1', id = uuid() }) {
  if ((await usoDeCliente(clienteId)) + bytes.length > TOPE_CLIENTE) {
    throw new HttpError(413, `Este cliente llegó al tope de ${Math.round(TOPE_CLIENTE / 1024 / 1024)} MB de imágenes. Borra algunas que ya no uses.`);
  }
  const { contenido } = await ALMACENES[almacen].guardar({ id, clienteId }, bytes);
  await db.run(
    'INSERT INTO imagenes (id, cliente_id, tipo, bytes, almacen, contenido, creado_en, creado_por) VALUES (?,?,?,?,?,?,?,?)',
    [id, clienteId, tipo, bytes.length, almacen, contenido ?? null, nowIso(), usuarioId || null],
  );
  return { id };
}

export async function leerImagen(clienteId, id) {
  const img = await db.get('SELECT id, tipo, almacen, contenido FROM imagenes WHERE id = ? AND cliente_id = ?', [id, clienteId]);
  if (!img) return null;
  return { tipo: img.tipo, bytes: await ALMACENES[img.almacen].leer(img) };
}

export async function borrarImagenes(clienteId, ids) {
  const lista = [...new Set(ids)].filter((x) => typeof x === 'string').slice(0, 200);
  for (const id of lista) {
    const img = await db.get('SELECT id, almacen FROM imagenes WHERE id = ? AND cliente_id = ?', [id, clienteId]);
    if (!img) continue;
    await ALMACENES[img.almacen].borrar(img);
    await db.run('DELETE FROM imagenes WHERE id = ? AND cliente_id = ?', [id, clienteId]);
  }
}
