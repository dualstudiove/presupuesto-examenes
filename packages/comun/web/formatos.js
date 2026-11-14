// Formatos en español de Venezuela: 1.234,56 y 31/12/2026.

export const miles = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/** Céntimos → '1.234,56' */
export function fmtNum(cent) {
  const c = Math.round(Math.abs(cent));
  return `${cent < 0 ? '-' : ''}${miles(Math.floor(c / 100))},${String(c % 100).padStart(2, '0')}`;
}

/** 'AAAA-MM-DD' → 'DD/MM/AAAA' */
export function fmtFecha(dia) {
  if (!dia) return '';
  const [y, m, d] = String(dia).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

/** Fecha local (YYYY-MM-DD) de un instante ISO en el huso indicado (por defecto, Venezuela). */
export function diaLocal(iso, timeZone = 'America/Caracas') {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso)); } catch { return String(iso).slice(0, 10); }
}
