// Utilidades de las tres pantallas de Cotízalo (paciente, administrador y plataforma).
// Lo genérico viene de las librerías compartidas, que se copian en /_ds al compilar:
//   _ds/comun/web  → api, escape, formatos, imágenes        (packages/comun/web)
//   _ds/diseno/js  → íconos, avisos, ventanas, confirmar     (packages/diseno/js)
import { crearApi, basePath } from '../_ds/comun/web/api.js';
import { miles, fmtNum } from '../_ds/comun/web/formatos.js';

export { $, $$, esc, norm, debounce, dispositivo } from '../_ds/comun/web/dom.js';
export { fmtNum, fmtFecha, diaLocal } from '../_ds/comun/web/formatos.js';
export { imagenAJpeg } from '../_ds/comun/web/imagenes.js';
export { icon } from '../_ds/diseno/js/iconos.js';
export { toast, modal, confirmar, conBoton } from '../_ds/diseno/js/componentes.js';

// ── Direcciones ──
// BASE: ruta donde está montada la app ('/cotizalo', o '' si está en la raíz de su dominio). No se escribe a mano:
// se deduce de dónde se sirve este archivo (<base>/js/common.js), así que sigue la variable BASE_PATH del servidor.
export const BASE = basePath(import.meta.url, 1);
// Cada negocio vive bajo <base>/<negocio> (paciente) y <base>/<negocio>/admin (administración).
// NEGOCIO es esa ruta completa ('/cotizalo/demo'), o '' en las páginas de la plataforma (<base> y <base>/super).
const resto = location.pathname.startsWith(BASE) ? location.pathname.slice(BASE.length) : location.pathname;
const primerSegmento = decodeURIComponent(resto.split('/')[1] || '');
export const NEGOCIO = primerSegmento && primerSegmento !== 'super' ? `${BASE}/${primerSegmento}` : '';
/** Dirección completa para compartir: urlCompleta('/demo') → https://dualstudio.app/cotizalo/demo */
export const urlCompleta = (ruta = '') => `${location.origin}${BASE}${ruta}`;

// La API pública y la del administrador son del negocio: /api/publico/x → <base>/<negocio>/api/publico/x;
// la de la plataforma solo lleva la base: /api/super/x → <base>/api/super/x
export const api = crearApi((path) => {
  if (/^\/api\/(publico|admin)\//.test(path)) return NEGOCIO + path;
  if (path.startsWith('/')) return BASE + path;
  return path;
});

// ── Precios: REF (referencial) y bolívares ──
export const ref = (c) => `${fmtNum(c)} REF`; // la unidad va DESPUÉS de la cifra
export const bs = (c) => `${fmtNum(c)} Bs.`;
export function fmtTasa(v) {
  const [e, d] = Number(v).toFixed(4).split('.');
  return `${miles(e)},${d}`;
}
/** "12,50" | "12.50" | "1.234,50" -> céntimos (entero) o null */
export function parsePrecio(txt) {
  let s = String(txt ?? '').trim().replace(/\s/g, '').replace(/ref/i, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}
export const centAInput = (c) => (c / 100).toFixed(2).replace('.', ',');

/** El color principal del negocio pasa a ser el acento (el sistema de diseño lo lee de --primary). */
export function aplicarColor(color) {
  if (/^#[0-9a-f]{6}$/i.test(color || '')) {
    document.documentElement.style.setProperty('--primary', color);
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', color);
  }
}
