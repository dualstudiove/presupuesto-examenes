// Utilidades compartidas por las tres pantallas (paciente, administrador y plataforma).

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ── Direcciones ──
// BASE: ruta donde está montada la app ('/cotizalo', o '' si está en la raíz de su dominio). No se escribe a mano:
// se deduce de dónde se sirve este archivo (<base>/js/common.js), así que sigue la variable BASE_PATH del servidor.
export const BASE = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
// Cada negocio vive bajo <base>/<negocio> (paciente) y <base>/<negocio>/admin (administración).
// NEGOCIO es esa ruta completa ('/cotizalo/demo'), o '' en las páginas de la plataforma (<base> y <base>/super).
const resto = location.pathname.startsWith(BASE) ? location.pathname.slice(BASE.length) : location.pathname;
const primerSegmento = decodeURIComponent(resto.split('/')[1] || '');
export const NEGOCIO = primerSegmento && primerSegmento !== 'super' ? `${BASE}/${primerSegmento}` : '';
/** Dirección completa para compartir: urlCompleta('/demo') → https://dualstudio.app/cotizalo/demo */
export const urlCompleta = (ruta = '') => `${location.origin}${BASE}${ruta}`;

export async function api(path, { method = 'GET', body } = {}) {
  // La API pública y la del administrador son del negocio: /api/publico/x → <base>/<negocio>/api/publico/x;
  // la de la plataforma solo lleva la base: /api/super/x → <base>/api/super/x
  if (/^\/api\/(publico|admin)\//.test(path)) path = NEGOCIO + path;
  else if (path.startsWith('/')) path = BASE + path;
  const opt = { method, headers: { 'x-app': '1' }, credentials: 'same-origin' };
  if (body !== undefined) {
    opt.headers['content-type'] = 'application/json';
    opt.body = JSON.stringify(body);
  }
  let r;
  try {
    r = await fetch(path, opt);
  } catch {
    const e = new Error('No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo.');
    e.status = 0;
    throw e;
  }
  const data = (r.headers.get('content-type') || '').includes('application/json') ? await r.json().catch(() => null) : null;
  if (!r.ok) {
    const e = new Error((data && data.error) || 'Ocurrió un error. Inténtalo de nuevo.');
    e.status = r.status;
    throw e;
  }
  return data;
}

// ── Formato venezolano: 1.234,56 ──
const miles = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
export function fmtNum(cent) {
  const c = Math.round(Math.abs(cent));
  return `${cent < 0 ? '-' : ''}${miles(Math.floor(c / 100))},${String(c % 100).padStart(2, '0')}`;
}
export const ref = (c) => `${fmtNum(c)} REF`; // la unidad va DESPUÉS de la cifra
export const bs = (c) => `${fmtNum(c)} Bs.`;
export function fmtTasa(v) {
  const [e, d] = Number(v).toFixed(4).split('.');
  return `${miles(e)},${d}`;
}
export function fmtFecha(dia) {
  if (!dia) return '';
  const [y, m, d] = String(dia).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}
/** Fecha local de Venezuela (YYYY-MM-DD) a partir de un instante ISO. */
export function diaLocal(iso) {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso)); } catch { return String(iso).slice(0, 10); }
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
export const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function dispositivo() {
  const movil = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (matchMedia('(pointer: coarse)').matches && innerWidth < 900);
  return movil ? 'movil' : 'escritorio';
}

export const debounce = (fn, ms = 180) => {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
};

export function aplicarColor(color) {
  if (/^#[0-9a-f]{6}$/i.test(color || '')) {
    document.documentElement.style.setProperty('--primary', color);
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', color);
  }
}

// ── Íconos (SVG simples, sin dependencias) ──
const P = {
  flask: '<path d="M9 3h6M10 3v6.2L4.6 18.4A2 2 0 0 0 6.3 21.5h11.4a2 2 0 0 0 1.7-3.1L14 9.2V3"/><path d="M7.5 15h9"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12.5a2 2 0 0 0 2 1.5h6a2 2 0 0 0 2-1.5L18 7M9 7V4h6v3"/>',
  back: '<path d="M15 5 8 12l7 7"/>',
  cart: '<path d="M3 4h2.2l2.1 10.4a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 2-1.5L20 8H6.2"/><circle cx="9.5" cy="20" r="1.3"/><circle cx="17" cy="20" r="1.3"/>',
  pdf: '<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5M9 14h6M9 17.5h6"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m21 16-5-5-8 9"/>',
  copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h2"/>',
  share: '<circle cx="6" cy="12" r="2.4"/><circle cx="18" cy="6" r="2.4"/><circle cx="18" cy="18" r="2.4"/><path d="m8.1 10.9 7.8-3.8M8.1 13.1l7.8 3.8"/>',
  edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  warn: '<path d="M12 4 2.5 20h19z"/><path d="M12 10v4.5M12 17.5h.01"/>',
  download: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
  out: '<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 8l-4 4 4 4M6 12h10"/>',
  asa: '<circle cx="9" cy="6" r="1.3"/><circle cx="15" cy="6" r="1.3"/><circle cx="9" cy="12" r="1.3"/><circle cx="15" cy="12" r="1.3"/><circle cx="9" cy="18" r="1.3"/><circle cx="15" cy="18" r="1.3"/>',
  empty: '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 10h8M8 14h5"/>',
};
export const icon = (n) => `<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n] || ''}</svg>`;

// ── Avisos emergentes y ventanas ──
export function toast(msg, tipo = '') {
  const cont = $('#toasts') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'toasts' }));
  const el = document.createElement('div');
  el.className = `toast ${tipo}`;
  el.setAttribute('role', 'status');
  el.textContent = msg;
  cont.appendChild(el);
  setTimeout(() => el.remove(), tipo === 'bad' ? 6000 : 3800);
}

/** modal({ titulo, html, acciones:[{ texto, clase, onClick(cerrar) }], ancho }) */
export function modal({ titulo, html, acciones = [], ancho = false, onClose }) {
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `<div class="modal ${ancho ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(titulo)}"><h2>${esc(titulo)}</h2><div class="mb">${html || ''}</div><div class="acts"></div></div>`;
  const previo = document.activeElement;
  const cerrar = () => { ov.remove(); document.removeEventListener('keydown', tecla); previo?.focus?.(); onClose?.(); };
  const tecla = (e) => { if (e.key === 'Escape') cerrar(); };
  document.addEventListener('keydown', tecla);
  ov.addEventListener('mousedown', (e) => { if (e.target === ov) cerrar(); });
  const acts = $('.acts', ov);
  for (const a of acciones) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `btn ${a.clase || ''}`;
    b.textContent = a.texto;
    b.addEventListener('click', () => a.onClick(cerrar, b));
    acts.appendChild(b);
  }
  document.body.appendChild(ov);
  (ov.querySelector('input,select,textarea') || acts.lastElementChild)?.focus();
  return { el: ov, cerrar };
}

export function confirmar(mensaje, { ok = 'Aceptar', peligro = false, titulo = 'Confirmar' } = {}) {
  return new Promise((resolve) => {
    modal({
      titulo, html: `<p>${esc(mensaje)}</p>`,
      onClose: () => resolve(false),
      acciones: [
        { texto: 'Cancelar', onClick: (c) => c() },
        { texto: ok, clase: peligro ? 'btn-danger solid' : 'btn-primary', onClick: (c) => { resolve(true); c(); } },
      ],
    });
  });
}

/** Ejecuta una acción deshabilitando el botón y mostrando el error si falla. */
export async function conBoton(btn, fn) {
  const t = btn?.textContent;
  if (btn) { btn.disabled = true; }
  try { return await fn(); } catch (e) { toast(e.message, 'bad'); } finally { if (btn) { btn.disabled = false; if (t) btn.textContent = t; } }
}

/** Reduce una imagen a un JPEG pequeño (fondo blanco) para usarla como logo. */
export function imagenAJpeg(file, max = 256) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) return reject(new Error('Elige un archivo de imagen (PNG o JPG).'));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * k));
      const h = Math.max(1, Math.round(img.height * k));
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.88));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen.')); };
    img.src = url;
  });
}
