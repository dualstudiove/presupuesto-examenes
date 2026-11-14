// Administración de Planifica: clientes, equipo y accesos (solo administradores de Dual Studio).
import { crearApi, basePath } from '../_ds/comun/web/api.js';
import { $, $$, esc } from '../_ds/comun/web/dom.js';
import { icon } from '../_ds/diseno/js/iconos.js';
import { toast, modal, confirmar, conBoton } from '../_ds/diseno/js/componentes.js';

const BASE = basePath(import.meta.url, 1);
const api = crearApi((ruta) => BASE + ruta);
const root = $('#root');
let D = null; // último resumen
let pestana = location.hash === '#equipo' ? 'equipo' : 'clientes';

const mb = (b) => (b < 1024 * 1024 ? `${Math.max(0, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB`);
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
const ROLES = { editor: 'Editor', lector: 'Solo lectura' };

async function boot() {
  let s;
  try { s = await api('/api/sesion'); } catch (e) { root.innerHTML = `<div class="login"><div class="card"><h1>No se pudo cargar</h1><p class="muted">${esc(e.message)}</p></div></div>`; return; }
  if (!s.usuario) return location.replace(`${BASE}/?volver=${encodeURIComponent(`${BASE}/admin`)}`);
  if (!s.usuario.es_admin) {
    root.innerHTML = `<div class="login"><div class="card"><h1>Solo para administradores</h1><p class="muted">Tu cuenta no administra Planifica.</p><a class="btn" href="${esc(BASE)}/">Ir a mis clientes</a></div></div>`;
    return;
  }
  D = await api('/api/admin/resumen');
  D.yo = s.usuario.id;
  pintar();
}

async function recargar() {
  const yo = D.yo;
  D = await api('/api/admin/resumen');
  D.yo = yo;
  pintar();
}

function pintar() {
  root.innerHTML = `<div class="pag ancha">
    <header class="cab"><a class="marca" href="${esc(BASE)}/" aria-label="Volver a mis clientes"><i class="on"></i><i></i><i></i><i></i><i class="on"></i><i></i><i></i><i></i><i class="on"></i></a>
      <div class="grow"><h1>Clientes y equipo</h1><p class="muted">Planifica · administración</p></div>
      <a class="btn btn-ghost" href="${esc(BASE)}/">${icon('back')} Mis clientes</a></header>
    <nav class="tabs" aria-label="Secciones">
      <button type="button" data-p="clientes" class="${pestana === 'clientes' ? 'on' : ''}">Clientes <span class="n">(${D.clientes.length})</span></button>
      <button type="button" data-p="equipo" class="${pestana === 'equipo' ? 'on' : ''}">Equipo <span class="n">(${D.usuarios.length})</span></button>
    </nav>
    <section id="sec"></section></div>`;
  $$('[data-p]').forEach((b) => b.addEventListener('click', () => { pestana = b.dataset.p; history.replaceState(null, '', `#${pestana}`); pintar(); }));
  if (pestana === 'clientes') pintarClientes(); else pintarEquipo();
}

// ── Clientes ──
function pintarClientes() {
  const sec = $('#sec');
  sec.innerHTML = `<div class="page-head"><p class="muted grow">Cada cliente tiene su parrilla, sus objetivos y sus imágenes. Máximo ${mb(D.tope_bytes)} de imágenes por cliente.</p>
      <button class="btn btn-primary" id="nuevo-cliente">${icon('plus')} Nuevo cliente</button></div>
    ${D.clientes.length ? `<div class="tw"><table class="t"><thead><tr><th>Cliente</th><th>Dirección</th><th class="right">Publicaciones</th><th class="right">Imágenes</th><th>Estado</th><th></th></tr></thead><tbody>
      ${D.clientes.map((c) => `<tr class="${c.activo ? '' : 'off'}"><td><b>${esc(c.nombre)}</b><br><span class="muted small">${esc(c.handle || 'Sin cuenta de Instagram')}</span></td>
        <td><a href="${esc(`${BASE}/${c.slug}`)}">/${esc(c.slug)}</a></td>
        <td class="right" data-l="Publicaciones:">${c.publicaciones}</td>
        <td class="right" data-l="Imágenes:">${mb(c.uso_bytes)} <span class="muted small">de ${mb(D.tope_bytes)}</span></td>
        <td><button class="badge ${c.activo ? 'ok' : 'off'}" style="border:0" data-act="estado" data-id="${c.id}">${c.activo ? 'Activo' : 'Archivado'}</button></td>
        <td class="acts"><button class="btn btn-sm" data-act="editar" data-id="${c.id}">Editar</button> <button class="btn btn-sm" data-act="importar" data-id="${c.id}" title="Importar una Parrilla de Contenido">Importar</button> <button class="btn btn-sm btn-danger btn-icon" data-act="borrar" data-id="${c.id}" aria-label="Eliminar ${esc(c.nombre)}">${icon('trash')}</button></td></tr>`).join('')}
      </tbody></table></div>` : `<div class="empty">${icon('empty')}<p>Aún no hay clientes</p><span>Crea el primero con «Nuevo cliente».</span></div>`}`;
  $('#nuevo-cliente').addEventListener('click', () => formCliente());
  sec.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => {
    const c = D.clientes.find((x) => x.id === b.dataset.id);
    ({ estado: estadoCliente, editar: formCliente, importar: importar, borrar: borrarCliente })[b.dataset.act](c, b);
  }));
}

function formCliente(c) {
  const m = modal({
    titulo: c ? `Editar ${c.nombre}` : 'Nuevo cliente',
    html: `<div class="field"><label for="cn">Nombre</label><input id="cn" type="text" value="${esc(c?.nombre || '')}" placeholder="Ej. Laboratorio RH"></div>
      <div class="field"><label for="ch">Cuenta de Instagram <span class="muted">(opcional)</span></label><input id="ch" type="text" value="${esc(c?.handle || '')}" placeholder="@cuenta"></div>
      ${c ? '' : '<div class="field"><label for="cs">Dirección <span class="muted">(opcional)</span></label><input id="cs" type="text" placeholder="se crea sola a partir del nombre"><span class="hint" id="cs-h"></span></div>'}`,
    acciones: [
      { texto: 'Cancelar', onClick: (cerrar) => cerrar() },
      { texto: c ? 'Guardar' : 'Crear cliente', clase: 'btn-primary', onClick: (cerrar, b) => conBoton(b, async () => {
        const body = { nombre: $('#cn', m.el).value, handle: $('#ch', m.el).value };
        if (c) await api(`/api/admin/clientes/${c.id}`, { method: 'PUT', body });
        else {
          const slug = $('#cs', m.el).value.trim().toLowerCase();
          const r = await api('/api/admin/clientes', { method: 'POST', body: slug ? { ...body, slug } : body });
          toast(`Cliente creado: ${BASE}/${r.slug}`, 'ok');
        }
        cerrar();
        await recargar();
      }) },
    ],
  });
  const cs = $('#cs', m.el);
  if (cs) {
    const h = $('#cs-h', m.el);
    const mostrar = () => { h.textContent = `${location.origin}${BASE}/${cs.value.trim() || '…'}`; };
    cs.addEventListener('input', mostrar);
    mostrar();
  }
}

async function estadoCliente(c, b) {
  const ok = c.activo
    ? await confirmar(`¿Archivar «${c.nombre}»? Su equipo deja de verlo; tú sí lo verás y podrás reactivarlo.`, { ok: 'Archivar', titulo: 'Archivar cliente' })
    : await confirmar(`¿Reactivar «${c.nombre}»?`, { ok: 'Reactivar', titulo: 'Reactivar cliente' });
  if (ok) await conBoton(b, async () => { await api(`/api/admin/clientes/${c.id}`, { method: 'PUT', body: { activo: !c.activo } }); await recargar(); });
}

function borrarCliente(c) {
  const m = modal({
    titulo: `Eliminar ${c.nombre}`,
    html: `<div class="notice bad">${icon('warn')}<div>Se borran para siempre sus publicaciones, objetivos e imágenes, y los accesos de su equipo. No se puede deshacer.</div></div>
      <div class="field" style="margin-top:12px"><label for="xn">Escribe el nombre exacto del cliente para confirmar</label><input id="xn" type="text" autocomplete="off" placeholder="${esc(c.nombre)}"></div>`,
    acciones: [
      { texto: 'Cancelar', onClick: (cerrar) => cerrar() },
      { texto: 'Eliminar para siempre', clase: 'btn-danger solid', onClick: (cerrar, b) => conBoton(b, async () => {
        await api(`/api/admin/clientes/${c.id}`, { method: 'DELETE', body: { nombre: $('#xn', m.el).value } });
        cerrar();
        toast(`«${c.nombre}» eliminado`, 'ok');
        await recargar();
      }) },
    ],
  });
}

function importar(c) {
  const m = modal({
    titulo: `Importar en ${c.nombre}`,
    html: `<p>Elige el archivo de exportación de una <b>Parrilla de Contenido</b> (.json). Se suman sus publicaciones, objetivos e imágenes a este cliente; los objetivos del mismo mes o trimestre se reemplazan.</p>
      <div class="field"><label for="fi">Archivo</label><input id="fi" type="file" accept="application/json,.json"></div>
      <p class="muted small" id="fi-r"></p>`,
    acciones: [
      { texto: 'Cancelar', onClick: (cerrar) => cerrar() },
      { texto: 'Importar', clase: 'btn-primary', onClick: (cerrar, b) => conBoton(b, async () => {
        const f = $('#fi', m.el).files[0];
        if (!f) throw new Error('Elige un archivo.');
        if (f.size > 7_500_000) throw new Error('El archivo es demasiado grande (máximo 7 MB).');
        let datos;
        try { datos = JSON.parse(await f.text()); } catch { throw new Error('El archivo no es un JSON válido.'); }
        const r = await api('/api/admin/importar', { method: 'POST', body: { cliente_id: c.id, datos } });
        cerrar();
        toast(`Importado: ${plural(r.publicaciones, 'publicación', 'publicaciones')}, ${plural(r.objetivos, 'objetivo', 'objetivos')} y ${plural(r.imagenes, 'imagen', 'imágenes')}`, 'ok');
        await recargar();
      }) },
    ],
  });
}

// ── Equipo ──
function pintarEquipo() {
  const sec = $('#sec');
  const nombreCliente = (id) => D.clientes.find((c) => c.id === id)?.nombre || '—';
  sec.innerHTML = `<div class="page-head"><p class="muted grow">Los administradores ven todos los clientes. Las demás personas, solo los que les asignes, como editor o solo lectura.</p>
      <button class="btn btn-primary" id="nueva-persona">${icon('plus')} Nueva persona</button></div>
    <div class="tw"><table class="t"><thead><tr><th>Persona</th><th>Acceso</th><th>Estado</th><th></th></tr></thead><tbody>
      ${D.usuarios.map((u) => `<tr class="${u.activo ? '' : 'off'}"><td><b>${esc(u.nombre || u.email)}</b>${u.id === D.yo ? ' <span class="muted small">(tú)</span>' : ''}<br><span class="muted small">${esc(u.email)}</span></td>
        <td class="small">${u.es_admin ? '<span class="badge ok">Administrador</span>' : (u.accesos.length ? u.accesos.map((a) => `${esc(nombreCliente(a.cliente_id))} · <span class="muted">${ROLES[a.rol]}</span>`).join('<br>') : '<span class="muted">Sin clientes</span>')}</td>
        <td><span class="badge ${u.activo ? 'ok' : 'off'}">${u.activo ? 'Activo' : 'Desactivado'}</span></td>
        <td class="acts">${u.es_admin ? '' : `<button class="btn btn-sm btn-soft" data-act="accesos" data-id="${u.id}">Clientes</button> `}<button class="btn btn-sm" data-act="editar" data-id="${u.id}">Editar</button></td></tr>`).join('')}
    </tbody></table></div>`;
  $('#nueva-persona').addEventListener('click', () => formPersona());
  sec.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => {
    const u = D.usuarios.find((x) => x.id === b.dataset.id);
    ({ accesos: formAccesos, editar: formPersona })[b.dataset.act](u);
  }));
}

function formPersona(u) {
  const yo = u && u.id === D.yo;
  const m = modal({
    titulo: u ? `Editar ${u.nombre || u.email}` : 'Nueva persona',
    html: `<div class="field"><label for="un">Nombre</label><input id="un" type="text" value="${esc(u?.nombre || '')}" autocomplete="off"></div>
      ${u ? `<p class="muted small">Correo: <b>${esc(u.email)}</b></p>` : '<div class="field"><label for="ue">Correo</label><input id="ue" type="email" autocomplete="off"></div>'}
      <div class="field"><label for="up">${u ? 'Contraseña nueva <span class="muted">(opcional; cierra sus sesiones abiertas)</span>' : 'Contraseña'}</label><input id="up" type="text" autocomplete="off" minlength="8"><span class="hint">Mínimo 8 caracteres. Compártela por un canal privado.</span></div>
      <label class="check"><input id="ua" type="checkbox" ${u?.es_admin ? 'checked' : ''} ${yo ? 'disabled' : ''}> Administrador de Dual Studio (ve todos los clientes y gestiona el equipo)</label>
      ${u && !yo ? `<label class="check"><input id="uact" type="checkbox" ${u.activo ? 'checked' : ''}> Cuenta activa (si la desactivas, se cierran sus sesiones)</label>` : ''}`,
    acciones: [
      { texto: 'Cancelar', onClick: (cerrar) => cerrar() },
      { texto: u ? 'Guardar' : 'Crear', clase: 'btn-primary', onClick: (cerrar, b) => conBoton(b, async () => {
        const nombre = $('#un', m.el).value;
        const password = $('#up', m.el).value;
        const esAdmin = $('#ua', m.el).checked;
        if (u) {
          const body = { nombre };
          if (password) body.password = password;
          if (!yo) { body.es_admin = esAdmin; body.activo = $('#uact', m.el).checked; }
          await api(`/api/admin/usuarios/${u.id}`, { method: 'PUT', body });
        } else {
          await api('/api/admin/usuarios', { method: 'POST', body: { nombre, email: $('#ue', m.el).value, password, es_admin: esAdmin } });
        }
        cerrar();
        toast(u ? 'Cambios guardados' : 'Persona creada. Ahora asígnale sus clientes.', 'ok');
        await recargar();
      }) },
    ],
  });
}

function formAccesos(u) {
  const actual = Object.fromEntries(u.accesos.map((a) => [a.cliente_id, a.rol]));
  const m = modal({
    titulo: `Clientes de ${u.nombre || u.email}`,
    ancho: true,
    html: D.clientes.length ? `<div class="accesos">${D.clientes.map((c) => `<div class="acceso"><span><b>${esc(c.nombre)}</b>${c.activo ? '' : ' <span class="muted small">(archivado)</span>'}</span>
        <select data-c="${c.id}" aria-label="Acceso a ${esc(c.nombre)}"><option value="">Sin acceso</option><option value="editor" ${actual[c.id] === 'editor' ? 'selected' : ''}>Editor</option><option value="lector" ${actual[c.id] === 'lector' ? 'selected' : ''}>Solo lectura</option></select></div>`).join('')}</div>`
      : '<p class="muted">Aún no hay clientes.</p>',
    acciones: [
      { texto: 'Cancelar', onClick: (cerrar) => cerrar() },
      { texto: 'Guardar', clase: 'btn-primary', onClick: (cerrar, b) => conBoton(b, async () => {
        for (const sel of $$('select[data-c]', m.el)) {
          const rol = sel.value || null;
          if ((actual[sel.dataset.c] || null) === rol) continue;
          await api('/api/admin/accesos', { method: 'PUT', body: { usuario_id: u.id, cliente_id: sel.dataset.c, rol } });
        }
        cerrar();
        toast('Accesos guardados', 'ok');
        await recargar();
      }) },
    ],
  });
}

boot();
