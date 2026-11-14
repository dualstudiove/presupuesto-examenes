// Inicio de Planifica: iniciar sesión, elegir cliente y «Tu cuenta».
import { basePath, crearApi } from "../_ds/comun/web/api.js";
import { $, esc } from "../_ds/comun/web/dom.js";
import { icon } from "../_ds/diseno/js/iconos.js";
import { conBoton, toast } from "../_ds/diseno/js/componentes.js";

const BASE = basePath(import.meta.url, 1);
const api = crearApi((ruta) => BASE + ruta);
const root = $("#root");

/** ?volver=<ruta>: solo rutas dentro de la app (nunca otro sitio). */
function volver() {
  const v = new URLSearchParams(location.search).get("volver") || "";
  return v.startsWith(`${BASE}/`) && !v.startsWith("//") && !/[\\]/.test(v) ? v : null;
}

const marca =
  '<span class="marca" aria-hidden="true"><i class="on"></i><i></i><i></i><i></i><i class="on"></i><i></i><i></i><i></i><i class="on"></i></span>';

function vistaLogin() {
  document.title = "Iniciar sesión · Planifica";
  root.innerHTML = `<div class="login"><div class="card">
    ${marca}
    <h1>Planifica</h1><p class="muted">Parrilla de contenido de Dual Studio. Entra con tu correo y tu contraseña.</p>
    <form id="f" novalidate>
      <div class="field"><label for="e">Correo</label><input id="e" type="email" autocomplete="username" required></div>
      <div class="field"><label for="p">Contraseña</label><input id="p" type="password" autocomplete="current-password" required></div>
      <div id="err" class="notice bad" role="alert" hidden></div>
      <button class="btn btn-primary btn-lg" type="submit">Entrar</button>
    </form>
    <p class="muted small login-pie">¿No tienes cuenta? Pídesela a un administrador de Dual Studio.</p>
  </div></div>`;
  $("#e").focus();
  $("#f").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const err = $("#err");
    err.hidden = true;
    const b = $("button[type=submit]", ev.target);
    b.disabled = true;
    try {
      const r = await api("/api/login", {
        method: "POST",
        body: { email: $("#e").value, password: $("#p").value },
      });
      const v = volver();
      if (v) return location.assign(v);
      if (r.destino) return location.assign(r.destino);
      await boot();
    } catch (e) {
      err.innerHTML = `${icon("warn")}<div>${esc(e.message)}</div>`;
      err.hidden = false;
      b.disabled = false;
    }
  });
}

function vistaClientes(s) {
  const u = s.usuario;
  document.title = "Tus clientes · Planifica";
  const clientes = s.clientes;
  const tarjetas = clientes.map((c) =>
    `<a class="cliente ${c.activo ? "" : "off"}" href="${esc(`${BASE}/${c.slug}`)}">
      <span class="ini" aria-hidden="true">${
      esc((c.nombre || "?").trim().charAt(0).toUpperCase())
    }</span>
      <span class="txt"><b>${esc(c.nombre)}</b><span>${
      esc(c.handle || "Sin cuenta de Instagram")
    }</span></span>
      ${
      c.activo
        ? (c.rol === "lector" ? '<span class="badge off">Solo lectura</span>' : "")
        : '<span class="badge off">Archivado</span>'
    }
      <span class="go" aria-hidden="true">→</span></a>`
  ).join("");
  root.innerHTML = `<div class="pag">
    <header class="cab">${marca}<div class="grow"><h1>Hola${
    u.nombre ? `, ${esc(u.nombre)}` : ""
  }</h1><p class="muted">${esc(u.email)}${u.es_admin ? " · Administrador" : ""}</p></div>
      ${
    u.es_admin
      ? `<a class="btn" href="${esc(BASE)}/admin">${icon("edit")} Clientes y equipo</a>`
      : ""
  }
      <button class="btn btn-ghost" id="salir" type="button">${icon("out")} Salir</button></header>
    ${
    s.secretos_recuperacion
      ? `<div class="notice warn">${
        icon("warn")
      }<div>Los secretos <b>SUPER_EMAIL</b> y <b>SUPER_PASSWORD</b> siguen guardados en Cloudflare. Ya se usaron y no volverán a cambiar ninguna contraseña, pero conviene borrarlos: Workers y Pages → planifica → Configuración → Variables y secretos.</div></div>`
      : ""
  }
    <p class="k">Clientes</p>
    ${
    clientes.length
      ? `<div class="clientes">${tarjetas}</div>`
      : `<div class="empty">${icon("empty")}<p>Aún no tienes clientes asignados</p><span>${
        u.es_admin
          ? "Crea el primero en «Clientes y equipo»."
          : "Pídele a un administrador que te dé acceso."
      }</span></div>`
  }
    <div class="card cuenta"><h3>Tu cuenta</h3>
      <form id="fn" class="fila" novalidate><div class="field"><label for="nn">Tu nombre</label><input id="nn" type="text" value="${
    esc(u.nombre || "")
  }" autocomplete="name"></div><button class="btn" type="submit">Guardar</button></form>
      <form id="fpw" novalidate><div class="row"><div class="field"><label for="pa">Contraseña actual</label><input id="pa" type="password" autocomplete="current-password"></div>
        <div class="field"><label for="pn">Contraseña nueva</label><input id="pn" type="password" autocomplete="new-password" minlength="8"><span class="hint">Mínimo 8 caracteres.</span></div></div>
        <button class="btn" type="submit">Cambiar contraseña</button></form>
      <p class="muted small" style="margin:16px 0 8px">¿Entraste desde un equipo ajeno o crees que alguien más tiene tu sesión? Ciérrala en todos los demás navegadores; aquí sigues dentro.</p>
      <button class="btn" type="button" id="cerrar-otras">${
    icon("out")
  } Cerrar sesión en los demás dispositivos</button>
    </div></div>`;

  $("#salir").addEventListener("click", async () => {
    await api("/api/logout", { method: "POST" }).catch(() => {});
    boot();
  });
  $("#fn").addEventListener("submit", (ev) => {
    ev.preventDefault();
    conBoton($("button", ev.target), async () => {
      await api("/api/cuenta", { method: "PUT", body: { nombre: $("#nn").value } });
      toast("Nombre guardado", "ok");
    });
  });
  $("#fpw").addEventListener("submit", (ev) => {
    ev.preventDefault();
    conBoton($("button", ev.target), async () => {
      await api("/api/cuenta/password", {
        method: "POST",
        body: { actual: $("#pa").value, nueva: $("#pn").value },
      });
      ev.target.reset();
      toast("Contraseña actualizada", "ok");
    });
  });
  $("#cerrar-otras").addEventListener("click", (ev) =>
    conBoton(ev.currentTarget, async () => {
      await api("/api/cuenta/sesiones/cerrar", { method: "POST" });
      toast("Listo: las demás sesiones quedaron cerradas", "ok");
    }));
}

async function boot() {
  let s;
  try {
    s = await api("/api/sesion");
  } catch (e) {
    root.innerHTML =
      `<div class="login"><div class="card"><h1>No se pudo cargar</h1><p class="muted">${
        esc(e.message)
      }</p></div></div>`;
    return;
  }
  if (!s.usuario) return vistaLogin();
  const v = volver();
  if (v) return location.replace(v);
  vistaClientes(s);
}

boot();
