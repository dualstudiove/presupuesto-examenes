// Conexión de la parrilla con el servidor de Planifica.
//
// La parrilla (parrilla.js) nació como artefacto de claude.ai y habla con «window.claude.use(…)»: una base de datos
// compartida en vivo (db), el usuario (user), las imágenes (assets) y las descargas (downloads). Este archivo ofrece
// esa misma interfaz sobre la API de Planifica, así la parrilla conserva su comportamiento sin reescribirse:
//
//   db.collection('posts' | 'goals').onSnapshot(cb)       → /<cliente>/api/datos (y refresco cada 30 s)
//   db.doc('posts/<id>').set / update / delete             → /<cliente>/api/publicaciones
//   db.doc('goals/<clave>').set / update                   → /<cliente>/api/objetivos/<clave>
//   db.doc('settings/account').update({ handle })          → /<cliente>/api/ajustes
//   user.id() · user.can('data.write') · user.profiles()   → quién eres, tu papel y los nombres del equipo
//   assets.upload(blob) / delete(id)                        → /<cliente>/api/imagenes
//   downloads.save({ filename, data })                      → descarga normal del navegador
//
// Los cambios propios que aún no confirmó el servidor se superponen a lo que llega en cada refresco, para que nada
// de lo que escribes «salte hacia atrás».
import { basePath, crearApi } from "../_ds/comun/web/api.js";

const BASE = basePath(import.meta.url, 1);
const CLIENTE = decodeURIComponent(location.pathname.slice(BASE.length).split("/")[1] || "")
  .toLowerCase();
const API = `${BASE}/${CLIENTE}`;
const api = crearApi((ruta) => API + ruta);
const apiRaiz = crearApi((ruta) => BASE + ruta);
const REFRESCO_MS = 30_000;

// Para parrilla.js: dirección de una imagen de referencia (img + id)
window.PLANIFICA = { img: `${API}/api/imagenes/`, base: BASE, cliente: CLIENTE };

let estado = null; // última respuesta completa de /api/datos
const oyentes = { posts: [], goals: [], account: [] };
const superpuesto = new Map(); // ruta → { op: 'set' | 'patch' | 'delete', datos }

function irAlInicio() {
  location.replace(`${BASE}/?volver=${encodeURIComponent(location.pathname + location.hash)}`);
}

function aplicarSuperpuesto(col, docs) {
  const m = new Map(docs.map((d) => [d.id, { ...d }]));
  for (const [ruta, s] of superpuesto) {
    const [c, id] = ruta.split("/");
    if (c !== col) continue;
    if (s.op === "delete") m.delete(id);
    else if (s.op === "set") m.set(id, { ...s.datos, id });
    else m.set(id, { ...(m.get(id) || { id }), ...s.datos });
  }
  return [...m.values()];
}
const pendientes = (col) => [...superpuesto.keys()].some((r) => r.startsWith(`${col}/`));

function instantanea(col) {
  const base = col === "posts" ? estado.publicaciones : estado.objetivos;
  const docs = aplicarSuperpuesto(col, base).map((d) => {
    const { id, ...datos } = d;
    return { id, data: () => datos };
  });
  return { docs, metadata: { fromCache: false, hasPendingWrites: pendientes(col) } };
}
function instantaneaCuenta() {
  const s = superpuesto.get("settings/account");
  const datos = { ...estado.ajustes, ...(s ? s.datos : {}) };
  return {
    exists: true,
    data: () => datos,
    metadata: { fromCache: false, hasPendingWrites: Boolean(s) },
  };
}
function avisar() {
  if (!estado) return;
  for (const cb of oyentes.posts) cb(instantanea("posts"));
  for (const cb of oyentes.goals) cb(instantanea("goals"));
  for (const cb of oyentes.account) cb(instantaneaCuenta());
}

function pintarCabecera() {
  const c = estado.cliente;
  document.title = `${c.nombre} · Planifica`;
  const nombre = document.getElementById("cliente-nombre");
  if (nombre) nombre.textContent = c.nombre;
  const nuevo = document.getElementById("newPost");
  if (nuevo) nuevo.hidden = estado.rol !== "editor"; // solo lectura: no puede crear
  // «← Mis clientes» vuelve al inicio (lista de clientes, tu cuenta y, si eres administrador, el equipo);
  // «Salir» cierra la sesión.
  const volver = document.getElementById("volver");
  if (volver) volver.href = `${BASE}/`;
}

async function refrescar() {
  const desde = estado ? `?desde=${estado.version}` : "";
  let r;
  try {
    r = await api(`/api/datos${desde}`);
  } catch (e) {
    if (e.status === 401) return irAlInicio();
    if (!estado) throw e;
    return; // sin conexión: se reintenta en el próximo refresco
  }
  if (r.sin_cambios) return;
  estado = r;
  pintarCabecera();
  avisar();
}

// Refresco: cada 30 s con la pestaña visible, al volver a ella y poco después de cada cambio propio.
let temporizador = null;
function programar(ms = REFRESCO_MS) {
  clearTimeout(temporizador);
  temporizador = setTimeout(async () => {
    if (document.visibilityState === "visible") await refrescar();
    programar();
  }, ms);
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") programar(200);
});

function error(e) {
  const err = new Error(e.message);
  err.code = e.status === 404
    ? "invalid_argument"
    : e.status === 413 || e.status === 429
    ? "quota_exceeded"
    : e.status === 403
    ? "permission_denied"
    : "unavailable";
  return err;
}

/** Ejecuta una escritura: se ve al instante (superpuesta) y se confirma con el servidor. */
async function escribir(ruta, op, datos, peticion) {
  const previo = superpuesto.get(ruta);
  const nuevo = op === "patch" && previo && previo.op !== "delete"
    ? { op: previo.op, datos: { ...previo.datos, ...datos } }
    : { op, datos };
  superpuesto.set(ruta, nuevo);
  avisar();
  try {
    await peticion();
  } catch (e) {
    if (superpuesto.get(ruta) === nuevo) superpuesto.delete(ruta);
    avisar();
    throw error(e);
  }
  await refrescar().catch(() => {});
  if (superpuesto.get(ruta) === nuevo) superpuesto.delete(ruta);
  avisar();
  programar(); // reinicia la cuenta: acabamos de refrescar
}

function documento(ruta) {
  const [col, id] = ruta.split("/");
  const enc = encodeURIComponent(id);
  if (col === "posts") {
    return {
      set: (datos) =>
        escribir(
          ruta,
          "set",
          datos,
          () => api("/api/publicaciones", { method: "POST", body: { id, datos } }),
        ),
      update: (cambios) =>
        escribir(
          ruta,
          "patch",
          cambios,
          () => api(`/api/publicaciones/${enc}`, { method: "PATCH", body: { cambios } }),
        ),
      delete: () =>
        escribir(
          ruta,
          "delete",
          null,
          () => api(`/api/publicaciones/${enc}`, { method: "DELETE" }),
        ),
    };
  }
  if (col === "goals") {
    const guardar = (cambios) =>
      escribir(
        ruta,
        "patch",
        cambios,
        () => api(`/api/objetivos/${enc}`, { method: "PATCH", body: { cambios } }),
      );
    return { set: guardar, update: guardar, delete: () => guardar({}) };
  }
  if (ruta === "settings/account") {
    const guardar = (cambios) =>
      escribir(
        ruta,
        "patch",
        cambios,
        () =>
          api("/api/ajustes", {
            method: "PATCH",
            body: { handle: cambios.handle ?? estado.ajustes.handle },
          }),
      );
    return {
      set: guardar,
      update: guardar,
      onSnapshot(cb) {
        oyentes.account.push(cb);
        if (estado) cb(instantaneaCuenta());
        return () => {};
      },
    };
  }
  throw new Error(`Documento desconocido: ${ruta}`);
}

const db = {
  collection(nombre) {
    return {
      onSnapshot(cb) {
        oyentes[nombre].push(cb);
        if (estado) cb(instantanea(nombre));
        return () => {};
      },
    };
  },
  doc: documento,
};

const user = {
  id: () => estado.yo,
  can: (permiso) => (permiso === "data.write" ? estado.rol === "editor" : false),
  profiles: async (ids) =>
    Object.fromEntries(ids.map((id) => [id, { name: estado.nombres[id] || "" }])),
};

const leerComoDataUrl = (blob) =>
  new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = () => rej(new Error("No se pudo leer la imagen."));
    fr.readAsDataURL(blob);
  });

const assets = {
  async upload(blob) {
    try {
      return await api("/api/imagenes", {
        method: "POST",
        body: { datos: await leerComoDataUrl(blob) },
      });
    } catch (e) {
      throw error(e);
    }
  },
  delete: (id) =>
    api(`/api/imagenes/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {}),
};

const downloads = {
  async save({ filename, data }) {
    const blob = data instanceof Blob ? data : new Blob([data], {
      type: filename.endsWith(".pdf") ? "application/pdf" : "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  },
};

// Primera carga. Si no hay sesión, a iniciar sesión; si no hay acceso a este cliente, se explica.
const listo = refrescar().then(() => {
  programar();
  return true;
}, (e) => {
  const main = document.getElementById("main");
  if (main) {
    main.innerHTML =
      '<div class="empty" style="margin-top:24px"><h3></h3><p></p><div class="acts"><a class="btn" href="">Ir a mis clientes</a></div></div>';
    main.querySelector("h3").textContent = e.status === 404
      ? "No tienes acceso a este cliente"
      : "No se pudo cargar";
    main.querySelector("p").textContent = e.status === 404
      ? "Puede que no exista o que no te hayan dado acceso. Pídeselo a un administrador."
      : e.message;
    main.querySelector("a").href = `${BASE}/`;
  }
  return false;
});

const capacidades = { db, user, assets, downloads };
window.claude = {
  // Si la carga falló, la parrilla se queda esperando: así no tapa el mensaje de arriba.
  use: (nombre) =>
    listo.then((ok) => {
      if (!ok) return new Promise(() => {});
      if (!capacidades[nombre]) throw new Error(`No disponible: ${nombre}`);
      return capacidades[nombre];
    }),
};

document.getElementById("salir")?.addEventListener("click", async () => {
  await apiRaiz("/api/logout", { method: "POST" }).catch(() => {});
  location.replace(`${BASE}/`);
});
