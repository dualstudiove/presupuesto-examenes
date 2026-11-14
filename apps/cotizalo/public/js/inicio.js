// Página principal: inicio de sesión único. El servidor decide el rol según el correo y la contraseña.
import { $, api, esc, icon } from "./common.js";

const ir = (destino) => location.assign(destino);

// Si ya hay sesión de superadministrador, directo a su panel.
api("/api/sesion").then((s) => {
  if (s.super) location.replace(s.super.destino);
}).catch(() => {});

/** Un mismo correo puede administrar varios negocios: se elige a cuál entrar. */
function elegirNegocio(negocios) {
  $("#root").querySelector(".card").innerHTML = `
    <h1>¿A qué negocio quieres entrar?</h1>
    <p class="muted">Tu correo administra ${negocios.length} negocios.</p>
    <div class="elige">${
    negocios.map((n) =>
      `<a class="btn btn-lg" href="${esc(n.destino)}">${icon("flask")} ${esc(n.nombre)}</a>`
    ).join("")
  }</div>`;
}

$("#f").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const err = $("#err");
  err.hidden = true;
  const boton = $("button[type=submit]", ev.target);
  boton.disabled = true;
  try {
    const r = await api("/api/login", {
      method: "POST",
      body: { email: $("#e").value, password: $("#p").value },
    });
    if (r.destino) return ir(r.destino);
    elegirNegocio(r.negocios);
  } catch (e) {
    err.innerHTML = `${icon("warn")}<div>${esc(e.message)}</div>`;
    err.hidden = false;
    boton.disabled = false;
  }
});
