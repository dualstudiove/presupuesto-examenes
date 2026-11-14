// Utilidades del navegador para cualquier app (sin nada visual).

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/** Escapa texto para meterlo en HTML. Úsalo con TODO lo que venga del usuario o de la base. */
export const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]),
  );

/** Texto sin acentos y en minúsculas, para buscar. */
export const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export const debounce = (fn, ms = 180) => {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
};

/** 'movil' | 'escritorio' */
export function dispositivo() {
  const movil = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
    (matchMedia("(pointer: coarse)").matches && innerWidth < 900);
  return movil ? "movil" : "escritorio";
}
