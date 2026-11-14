// Comportamiento de los componentes del sistema de diseño: avisos emergentes, ventanas y confirmaciones.
// Su aspecto está en componentes.css (.toast, .overlay, .modal, .btn…).

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]),
  );

// ── Avisos emergentes ──
/** toast('Guardado', 'ok' | 'bad' | ''): el texto se inserta como texto, nunca como HTML. */
export function toast(msg, tipo = "") {
  const cont = $("#toasts") ||
    document.body.appendChild(Object.assign(document.createElement("div"), { id: "toasts" }));
  const el = document.createElement("div");
  el.className = `toast ${tipo}`;
  el.setAttribute("role", "status");
  el.textContent = msg;
  cont.appendChild(el);
  setTimeout(() => el.remove(), tipo === "bad" ? 6000 : 3800);
}

// ── Ventanas ──
/**
 * modal({ titulo, html, acciones:[{ texto, clase, onClick(cerrar, boton) }], ancho, onClose })
 * `html` se inserta tal cual: escapa con esc() todo lo que venga del usuario o de la base.
 */
export function modal({ titulo, html, acciones = [], ancho = false, onClose }) {
  const ov = document.createElement("div");
  ov.className = "overlay";
  ov.innerHTML = `<div class="modal ${
    ancho ? "wide" : ""
  }" role="dialog" aria-modal="true" aria-label="${esc(titulo)}"><h2>${
    esc(titulo)
  }</h2><div class="mb">${html || ""}</div><div class="acts"></div></div>`;
  const previo = document.activeElement;
  const cerrar = () => {
    ov.remove();
    document.removeEventListener("keydown", tecla);
    previo?.focus?.();
    onClose?.();
  };
  const tecla = (e) => {
    if (e.key === "Escape") cerrar();
  };
  document.addEventListener("keydown", tecla);
  ov.addEventListener("mousedown", (e) => {
    if (e.target === ov) cerrar();
  });
  const acts = $(".acts", ov);
  for (const a of acciones) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `btn ${a.clase || ""}`;
    b.textContent = a.texto;
    b.addEventListener("click", () => a.onClick(cerrar, b));
    acts.appendChild(b);
  }
  document.body.appendChild(ov);
  (ov.querySelector("input,select,textarea") || acts.lastElementChild)?.focus();
  return { el: ov, cerrar };
}

/** await confirmar('¿Eliminar…?', { ok, peligro, titulo }) → true / false. El mensaje es texto (se escapa). */
export function confirmar(mensaje, { ok = "Aceptar", peligro = false, titulo = "Confirmar" } = {}) {
  return new Promise((resolve) => {
    modal({
      titulo,
      html: `<p>${esc(mensaje)}</p>`,
      onClose: () => resolve(false),
      acciones: [
        { texto: "Cancelar", onClick: (c) => c() },
        {
          texto: ok,
          clase: peligro ? "btn-danger solid" : "btn-primary",
          onClick: (c) => {
            resolve(true);
            c();
          },
        },
      ],
    });
  });
}

/** Ejecuta una acción deshabilitando el botón y mostrando el error si falla. */
export async function conBoton(btn, fn) {
  const t = btn?.textContent;
  if (btn) btn.disabled = true;
  try {
    return await fn();
  } catch (e) {
    toast(e.message, "bad");
  } finally {
    if (btn) {
      btn.disabled = false;
      if (t) btn.textContent = t;
    }
  }
}
