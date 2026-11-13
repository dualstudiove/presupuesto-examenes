// Panel de administración de un negocio: dashboard, catálogo, precios y configuración.
import {
  $, $$, esc, api, BASE, NEGOCIO, urlCompleta, ref, fmtFecha, fmtNum, norm, icon, toast, modal, confirmar, conBoton, aplicarColor, diaLocal,
  parsePrecio, centAInput, imagenAJpeg, fmtTasa,
} from './common.js';
import { graficoDias, barras, calor, semana, reparto } from './charts.js';

const root = $('#root');
const A = { me: null, pub: null, cat: null };
const hoy = () => diaLocal(new Date().toISOString());
const restar = (dia, n) => { const d = new Date(`${dia}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
const fechaHora = (iso) => { try { return new Date(iso).toLocaleString('es-VE', { timeZone: 'America/Caracas', dateStyle: 'short', timeStyle: 'short' }); } catch { return iso; } };
const catalogo = async (forzar = false) => (A.cat = !forzar && A.cat ? A.cat : await api('/api/admin/catalogo'));

// ───────────── Arranque y sesión ─────────────
async function boot() {
  try {
    A.me = await api('/api/admin/me');
  } catch (e) {
    if (e.status === 401) return vistaLogin();
    root.innerHTML = `<div class="login"><div class="card"><h1>No se pudo cargar</h1><p class="muted">${esc(e.message)}</p></div></div>`;
    return;
  }
  A.pub = await api('/api/publico/config');
  aplicarColor(A.pub.negocio.color);
  document.title = `Administración · ${A.pub.negocio.nombre}`;
  armarMarco();
  window.addEventListener('hashchange', ruta);
  ruta();
}

function vistaLogin() {
  root.innerHTML = `<div class="login"><div class="card">
    <img src="${BASE}/img/favicon.svg" alt="" width="48" height="48" style="border-radius:12px">
    <h1>Administración</h1><p class="muted">Ingresa con tu correo y contraseña.</p>
    <form id="f" novalidate>
      <div class="field"><label for="e">Correo</label><input id="e" type="email" autocomplete="username" required></div>
      <div class="field"><label for="p">Contraseña</label><input id="p" type="password" autocomplete="current-password" required></div>
      <button class="btn btn-primary btn-lg" type="submit">Entrar</button>
    </form></div></div>`;
  $('#f').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    await conBoton($('button', ev.target), async () => {
      await api('/api/admin/login', { method: 'POST', body: { email: $('#e').value, password: $('#p').value } });
      location.hash = '#/';
      boot();
    });
  });
}

const LINKS = [['#/', 'Panel'], ['#/examenes', 'Exámenes'], ['#/perfiles', 'Perfiles'], ['#/categorias', 'Categorías'], ['#/precios', 'Precios'], ['#/config', 'Configuración']];

function armarMarco() {
  const sup = A.me.super;
  const negocio = A.pub.negocio;
  // El superadministrador entra a cualquier negocio con su propia sesión: se le avisa y se le ofrece volver.
  const aviso = sup ? `<div class="modo-super" role="note"><div class="in"><span class="grow">Estás dentro de <b>${esc(negocio.nombre)}</b> como superadministrador${A.me.negocio.activo ? '' : ' · <b>negocio suspendido</b>'}.</span><a href="${esc(BASE)}/super">← Volver al panel general</a></div></div>` : '';
  root.innerHTML = `${aviso}<header class="adm-top"><div class="in">
      <div class="brand" style="flex:none">${A.pub.negocio.logo ? `<img src="${esc(A.pub.negocio.logo)}" alt="">` : `<span class="mark">${icon('flask')}</span>`}<div><strong>${esc(A.pub.negocio.nombre)}</strong><small>Administración</small></div></div>
      <nav class="adm-nav" aria-label="Secciones">${LINKS.map(([h, t]) => `<a href="${h}" data-h="${h}">${t}</a>`).join('')}</nav>
      <a class="btn btn-sm" href="${esc(NEGOCIO)}" target="_blank" rel="noopener">Ver aplicación</a>
      ${sup ? `<a class="btn btn-sm" href="${esc(BASE)}/super">Panel general</a>` : `<button class="btn btn-sm" id="salir">${icon('out')} Salir</button>`}
    </div></header><main class="page" id="page"></main>`;
  $('#salir')?.addEventListener('click', async () => { await api('/api/admin/logout', { method: 'POST' }).catch(() => {}); location.hash = '#/'; location.reload(); });
}

async function ruta() {
  const h = location.hash || '#/';
  $$('.adm-nav a').forEach((a) => a.classList.toggle('on', a.dataset.h === h));
  const page = $('#page');
  page.innerHTML = '<div class="skeleton"></div><div class="skeleton"></div>';
  try {
    const fn = { '#/': pPanel, '#/examenes': pExamenes, '#/perfiles': pPerfiles, '#/categorias': pCategorias, '#/precios': pPrecios, '#/config': pConfig }[h] || pPanel;
    await fn(page);
  } catch (e) {
    if (e.status === 401) return boot();
    page.innerHTML = `<div class="notice bad">${icon('warn')}<div>${esc(e.message)}</div></div>`;
  }
}
const recargar = async () => { A.cat = null; await ruta(); };

// ───────────── Panel (estadísticas) ─────────────
const D = { preset: '7', desde: '', hasta: '' };

function rangoActual() {
  const h = hoy();
  if (D.preset === 'hoy') return { desde: h, hasta: h };
  if (D.preset === '7') return { desde: restar(h, 6), hasta: h };
  if (D.preset === '30') return { desde: restar(h, 29), hasta: h };
  return { desde: D.desde || restar(h, 6), hasta: D.hasta || h };
}

async function pPanel(page) {
  const { desde, hasta } = rangoActual();
  const d = await api(`/api/admin/dashboard?desde=${desde}&hasta=${hasta}`);
  const q = `desde=${desde}&hasta=${hasta}`;
  const csv = (tipo) => `<a class="btn btn-sm" href="${esc(NEGOCIO)}/api/admin/dashboard/csv?tipo=${tipo}&${q}" download>${icon('download')} CSV</a>`;
  const r = d.resumen;
  const visM = d.dispositivos.find((x) => x.dispositivo === 'movil'); const visE = d.dispositivos.find((x) => x.dispositivo === 'escritorio');
  page.innerHTML = `
    <div class="page-head"><h1>Panel de estadísticas</h1></div>
    <div class="range">
      <div class="seg" role="group" aria-label="Período">${[['hoy', 'Hoy'], ['7', '7 días'], ['30', '30 días'], ['custom', 'Personalizado']].map(([k, t]) => `<button type="button" class="${D.preset === k ? 'on' : ''}" data-p="${k}">${t}</button>`).join('')}</div>
      ${D.preset === 'custom' ? `<input type="date" id="d1" value="${desde}" max="${hoy()}" aria-label="Desde"> <span class="muted">a</span> <input type="date" id="d2" value="${hasta}" max="${hoy()}" aria-label="Hasta"><button class="btn btn-sm btn-primary" id="aplicar">Aplicar</button>` : `<span class="muted small">${fmtFecha(desde)} – ${fmtFecha(hasta)}</span>`}
      <span style="flex:1"></span>${csv('resumen')}
    </div>
    <div class="kpis">
      <div class="kpi"><div class="l">Presupuestos generados</div><div class="v">${r.presupuestos}</div></div>
      <div class="kpi"><div class="l">Visitas</div><div class="v">${r.visitas}</div><div class="s">Sesiones de pacientes en la app</div></div>
      <div class="kpi"><div class="l">De visita a presupuesto</div><div class="v">${r.conversion === null ? '—' : `${String(r.conversion).replace('.', ',')}%`}</div></div>
      <div class="kpi"><div class="l">Ticket promedio</div><div class="v">${ref(r.ticket_promedio_cent)}</div><div class="s">Por presupuesto</div></div>
    </div>
    <div class="card"><div class="card-h"><h3>Presupuestos y visitas por día</h3>${csv('dias')}</div>${graficoDias(d.por_dia)}</div>
    <div class="grid2" style="margin-top:14px">
      <div class="card"><div class="card-h"><h3>Exámenes más presupuestados</h3>${csv('examenes')}</div>
        ${barras(d.top_examenes, { valor: (x) => x.veces, sub: (x) => `${x.categoria} · ${x.sueltos} suelto(s), ${x.veces - x.sueltos} en perfil(es)`, fmt: (v) => `${v}` })}</div>
      <div class="card"><div class="card-h"><h3>Perfiles más presupuestados</h3>${csv('perfiles')}</div>
        ${barras(d.top_perfiles, { valor: (x) => x.veces })}</div>
    </div>
    <div class="grid2">
      <div class="card"><div class="card-h"><h3>Tipos de examen más pedidos</h3>${csv('categorias')}</div>
        ${barras(d.categorias, { valor: (x) => x.veces })}<p class="muted xs" style="margin-top:8px">Cuenta cada examen, incluidos los que vienen dentro de un perfil.</p></div>
      <div class="card"><div class="card-h"><h3>¿De dónde vienen los pacientes?</h3>${csv('origenes')}</div>
        ${barras(d.origenes, { valor: (x) => x.n, fmt: (v, x) => `${v} · ${String(x.pct).replace('.', ',')}%` })}</div>
    </div>
    <div class="grid2">
      <div class="card"><h3>Horas de mayor actividad</h3>${calor(d.horas)}</div>
      <div class="card"><h3>Actividad por día de la semana</h3>${semana(d.dias_semana)}</div>
    </div>
    <div class="card"><h3>Tipo de dispositivo</h3>
      <div class="grid2" style="margin:10px 0 0"><div><div class="lbl small">Visitas</div>${reparto(visM.visitas, visE.visitas)}</div><div><div class="lbl small">Presupuestos generados</div>${reparto(visM.presupuestos, visE.presupuestos)}</div></div></div>`;

  $$('.seg button', page).forEach((b) => b.addEventListener('click', () => { D.preset = b.dataset.p; ruta(); }));
  $('#aplicar', page)?.addEventListener('click', () => {
    D.desde = $('#d1').value; D.hasta = $('#d2').value;
    if (!D.desde || !D.hasta || D.desde > D.hasta) return toast('Revisa las fechas del período.', 'bad');
    ruta();
  });
}

// ───────────── Exámenes ─────────────
const F = { q: '', cat: '' };

async function pExamenes(page) {
  const c = await catalogo(true);
  const lista = () => c.examenes.filter((e) => (!F.cat || e.categoria_id === F.cat) && (!F.q || norm(e.nombre).includes(norm(F.q))));
  page.innerHTML = `
    <div class="page-head"><h1>Exámenes <span class="muted" style="font-size:1rem;font-weight:500">(${c.examenes.length})</span></h1><button class="btn btn-primary" id="nuevo">${icon('plus')} Nuevo examen</button></div>
    <div class="toolbar"><input type="search" id="q" placeholder="Buscar examen…" value="${esc(F.q)}" aria-label="Buscar">
      <select id="fc" aria-label="Categoría"><option value="">Todas las categorías</option>${c.categorias.map((k) => `<option value="${k.id}" ${F.cat === k.id ? 'selected' : ''}>${esc(k.nombre)}</option>`).join('')}</select></div>
    <div class="tw"><table class="t"><thead><tr><th>Examen</th><th>Categoría</th><th class="right">Precio</th><th>Estado</th><th></th></tr></thead><tbody id="tb"></tbody></table></div>`;
  const pintar = () => {
    const l = lista();
    $('#tb').innerHTML = l.length ? l.map((e) => `<tr class="${e.activo ? '' : 'off'}"><td><b>${esc(e.nombre)}</b>${e.indicaciones ? `<div class="muted xs">${esc(e.indicaciones)}</div>` : ''}</td><td><span class="tag cat-${(Math.max(0, c.categorias.findIndex((k) => k.id === e.categoria_id)) % 5) + 1}">${esc(e.categoria)}</span></td><td class="right nowrap"><b>${ref(e.precio_cent)}</b></td>
      <td><button class="badge ${e.activo ? 'ok' : 'off'}" style="cursor:pointer;border:0" data-t="${e.id}" title="Cambiar estado">${e.activo ? 'Activo' : 'Inactivo'}</button></td>
      <td class="acts"><button class="btn btn-sm" data-e="${e.id}">${icon('edit')} Editar</button> <button class="btn btn-sm btn-danger btn-icon" data-d="${e.id}" aria-label="Eliminar ${esc(e.nombre)}">${icon('trash')}</button></td></tr>`).join('')
      : `<tr><td colspan="5" class="empty">No hay exámenes con ese criterio.</td></tr>`;
  };
  pintar();
  $('#q').addEventListener('input', (ev) => { F.q = ev.target.value; pintar(); });
  $('#fc').addEventListener('change', (ev) => { F.cat = ev.target.value; pintar(); });
  $('#nuevo').addEventListener('click', () => formExamen(c));
  $('#tb').addEventListener('click', async (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    const ex = c.examenes.find((x) => x.id === (b.dataset.e || b.dataset.t || b.dataset.d));
    if (b.dataset.e) formExamen(c, ex);
    if (b.dataset.t) await conBoton(b, async () => { await api(`/api/admin/examenes/${ex.id}`, { method: 'PUT', body: { activo: !ex.activo } }); await recargar(); });
    if (b.dataset.d) {
      const enPerfiles = c.perfiles.filter((p) => p.examen_ids.includes(ex.id));
      const msg = enPerfiles.length ? `«${ex.nombre}» también está en ${enPerfiles.length} perfil(es): ${enPerfiles.map((p) => p.nombre).join(', ')}. Se quitará de ellos. ¿Eliminar de todos modos?` : `¿Eliminar «${ex.nombre}»? Esta acción no se puede deshacer.`;
      if (await confirmar(msg, { ok: 'Eliminar', peligro: true, titulo: 'Eliminar examen' })) await conBoton(b, async () => { await api(`/api/admin/examenes/${ex.id}`, { method: 'DELETE' }); toast('Examen eliminado', 'ok'); await recargar(); });
    }
  });
}

function formExamen(c, ex) {
  if (!c.categorias.length) return toast('Primero crea una categoría.', 'bad');
  const m = modal({
    titulo: ex ? 'Editar examen' : 'Nuevo examen',
    html: `<form id="fe" novalidate>
      <div class="field"><label for="n">Nombre</label><input id="n" type="text" maxlength="120" value="${esc(ex?.nombre)}" required></div>
      <div class="row"><div class="field"><label for="c">Categoría</label><select id="c">${c.categorias.map((k) => `<option value="${k.id}" ${(ex?.categoria_id || F.cat) === k.id ? 'selected' : ''}>${esc(k.nombre)}</option>`).join('')}</select></div>
        <div class="field"><label for="pr">Precio</label><div class="input-unit"><input id="pr" type="text" inputmode="decimal" placeholder="0,00" value="${ex ? centAInput(ex.precio_cent) : ''}"><span>REF</span></div></div></div>
      <div class="field"><label for="i">Indicaciones previas <span class="muted">(opcional)</span></label><input id="i" type="text" maxlength="300" placeholder="Ej.: ayuno de 8 horas" value="${esc(ex?.indicaciones)}"></div>
      <div class="field"><label for="ds">Descripción <span class="muted">(opcional)</span></label><textarea id="ds" maxlength="500">${esc(ex?.descripcion)}</textarea></div>
      <label class="check"><input id="a" type="checkbox" ${ex?.activo === 0 ? '' : 'checked'}> Visible para los pacientes</label></form>`,
    acciones: [{ texto: 'Cancelar', onClick: (x) => x() }, {
      texto: 'Guardar', clase: 'btn-primary',
      onClick: async (cerrar, btn) => {
        const precio = parsePrecio($('#pr').value);
        if (!$('#n').value.trim()) return toast('Escribe el nombre del examen.', 'bad');
        if (precio === null) return toast('Escribe un precio válido, por ejemplo 12,50.', 'bad');
        await conBoton(btn, async () => {
          const body = { nombre: $('#n').value, categoria_id: $('#c').value, precio_cent: precio, indicaciones: $('#i').value, descripcion: $('#ds').value, activo: $('#a').checked };
          await api(ex ? `/api/admin/examenes/${ex.id}` : '/api/admin/examenes', { method: ex ? 'PUT' : 'POST', body });
          cerrar(); toast('Examen guardado', 'ok'); await recargar();
        });
      },
    }],
  });
  $('#fe', m.el).addEventListener('submit', (e) => e.preventDefault());
}

// ───────────── Perfiles ─────────────
async function pPerfiles(page) {
  const c = await catalogo(true);
  const suma = (p) => p.examen_ids.reduce((s, id) => s + (c.examenes.find((e) => e.id === id)?.precio_cent || 0), 0);
  page.innerHTML = `
    <div class="page-head"><h1>Perfiles <span class="muted" style="font-size:1rem;font-weight:500">(${c.perfiles.length})</span></h1><button class="btn btn-primary" id="nuevo">${icon('plus')} Nuevo perfil</button></div>
    <p class="muted small">Un perfil es un grupo de exámenes con un precio propio (no tiene que ser la suma de sus partes).</p>
    <div class="tw"><table class="t"><thead><tr><th>Perfil</th><th>Exámenes</th><th class="right">Precio del perfil</th><th class="right">Suma por separado</th><th>Estado</th><th></th></tr></thead><tbody>
    ${c.perfiles.length ? c.perfiles.map((p) => `<tr class="${p.activo ? '' : 'off'}"><td><b>${esc(p.nombre)}</b></td><td data-l="Exámenes:">${p.examen_ids.length}</td><td class="right nowrap"><b>${ref(p.precio_cent)}</b></td><td class="right nowrap muted" data-l="Por separado:">${ref(suma(p))}</td>
      <td><button class="badge ${p.activo ? 'ok' : 'off'}" style="cursor:pointer;border:0" data-t="${p.id}">${p.activo ? 'Activo' : 'Inactivo'}</button></td>
      <td class="acts"><button class="btn btn-sm" data-e="${p.id}">${icon('edit')} Editar</button> <button class="btn btn-sm btn-danger btn-icon" data-d="${p.id}" aria-label="Eliminar ${esc(p.nombre)}">${icon('trash')}</button></td></tr>`).join('') : '<tr><td colspan="6" class="empty">Aún no hay perfiles.</td></tr>'}
    </tbody></table></div>`;
  $('#nuevo').addEventListener('click', () => formPerfil(c));
  $('.t tbody', page).addEventListener('click', async (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    const p = c.perfiles.find((x) => x.id === (b.dataset.e || b.dataset.t || b.dataset.d));
    if (b.dataset.e) formPerfil(c, p);
    if (b.dataset.t) await conBoton(b, async () => { await api(`/api/admin/perfiles/${p.id}`, { method: 'PUT', body: { activo: !p.activo } }); await recargar(); });
    if (b.dataset.d && await confirmar(`¿Eliminar el perfil «${p.nombre}»? Los exámenes que incluye no se borran.`, { ok: 'Eliminar', peligro: true, titulo: 'Eliminar perfil' })) {
      await conBoton(b, async () => { await api(`/api/admin/perfiles/${p.id}`, { method: 'DELETE' }); toast('Perfil eliminado', 'ok'); await recargar(); });
    }
  });
}

function formPerfil(c, p) {
  const sel = new Set(p?.examen_ids || []);
  const porCat = c.categorias.map((k) => ({ k, items: c.examenes.filter((e) => e.categoria_id === k.id) })).filter((g) => g.items.length);
  const m = modal({
    ancho: true, titulo: p ? 'Editar perfil' : 'Nuevo perfil',
    html: `<form id="fp" novalidate>
      <div class="row"><div class="field"><label for="n">Nombre del perfil</label><input id="n" type="text" maxlength="120" value="${esc(p?.nombre)}"></div>
        <div class="field"><label for="pr">Precio del perfil</label><div class="input-unit"><input id="pr" type="text" inputmode="decimal" placeholder="0,00" value="${p ? centAInput(p.precio_cent) : ''}"><span>REF</span></div></div></div>
      <div class="field"><label for="ds">Descripción <span class="muted">(opcional)</span></label><input id="ds" type="text" maxlength="500" value="${esc(p?.descripcion)}"></div>
      <div class="field"><label>Exámenes que incluye</label><input type="search" id="bq" placeholder="Buscar examen…" aria-label="Buscar examen">
        <div class="picklist" id="pl">${porCat.map((g) => `<h4>${esc(g.k.nombre)}</h4>${g.items.map((e) => `<label class="check" data-n="${esc(norm(e.nombre))}"><input type="checkbox" value="${e.id}" ${sel.has(e.id) ? 'checked' : ''}> ${esc(e.nombre)} <span class="muted small">· ${ref(e.precio_cent)}</span></label>`).join('')}`).join('')}</div>
        <div class="hint" id="rs"></div></div>
      <label class="check"><input id="a" type="checkbox" ${p?.activo === 0 ? '' : 'checked'}> Visible para los pacientes</label></form>`,
    acciones: [{ texto: 'Cancelar', onClick: (x) => x() }, {
      texto: 'Guardar', clase: 'btn-primary',
      onClick: async (cerrar, btn) => {
        const precio = parsePrecio($('#pr').value);
        const ids = $$('#pl input:checked', m.el).map((i) => i.value);
        if (!$('#n').value.trim()) return toast('Escribe el nombre del perfil.', 'bad');
        if (precio === null) return toast('Escribe un precio válido.', 'bad');
        if (!ids.length) return toast('Elige al menos un examen.', 'bad');
        await conBoton(btn, async () => {
          const body = { nombre: $('#n').value, descripcion: $('#ds').value, precio_cent: precio, examen_ids: ids, activo: $('#a').checked };
          await api(p ? `/api/admin/perfiles/${p.id}` : '/api/admin/perfiles', { method: p ? 'PUT' : 'POST', body });
          cerrar(); toast('Perfil guardado', 'ok'); await recargar();
        });
      },
    }],
  });
  const resumen = () => {
    const ids = $$('#pl input:checked', m.el).map((i) => i.value);
    const s = ids.reduce((t, id) => t + (c.examenes.find((e) => e.id === id)?.precio_cent || 0), 0);
    $('#rs', m.el).textContent = `${ids.length} examen(es) elegido(s). Suma por separado: ${ref(s)}.`;
  };
  resumen();
  $('#pl', m.el).addEventListener('change', resumen);
  $('#bq', m.el).addEventListener('input', (ev) => { const q = norm(ev.target.value); $$('#pl label', m.el).forEach((l) => { l.hidden = q && !l.dataset.n.includes(q); }); });
  $('#fp', m.el).addEventListener('submit', (e) => e.preventDefault());
}

// ───────────── Categorías ─────────────
async function pCategorias(page) {
  const c = await catalogo(true);
  page.innerHTML = `
    <div class="page-head"><h1>Categorías</h1><button class="btn btn-primary" id="nuevo">${icon('plus')} Nueva categoría</button></div>
    <div class="tw"><table class="t"><thead><tr><th>Categoría</th><th>Orden</th><th>Exámenes</th><th>Estado</th><th></th></tr></thead><tbody>
    ${c.categorias.map((k) => `<tr class="${k.activo ? '' : 'off'}"><td><span class="tag cat-${(c.categorias.indexOf(k) % 5) + 1}">${esc(k.nombre)}</span></td><td data-l="Orden:">${k.orden}</td><td data-l="Exámenes:">${k.examenes}</td><td><span class="badge ${k.activo ? 'ok' : 'off'}">${k.activo ? 'Activa' : 'Oculta'}</span></td>
      <td class="acts"><button class="btn btn-sm" data-e="${k.id}">${icon('edit')} Editar</button> <button class="btn btn-sm btn-danger btn-icon" data-d="${k.id}" aria-label="Eliminar ${esc(k.nombre)}">${icon('trash')}</button></td></tr>`).join('')}
    </tbody></table></div>
    <p class="muted small" style="margin-top:10px">Si ocultas una categoría, sus exámenes dejan de mostrarse a los pacientes.</p>`;
  const form = (k) => {
    const m = modal({
      titulo: k ? 'Editar categoría' : 'Nueva categoría',
      html: `<div class="field"><label for="n">Nombre</label><input id="n" type="text" maxlength="80" value="${esc(k?.nombre)}"></div>
        <div class="field"><label for="o">Orden</label><input id="o" type="number" value="${k ? k.orden : c.categorias.length}"><span class="hint">Las categorías se muestran de menor a mayor.</span></div>
        <label class="check"><input id="a" type="checkbox" ${k?.activo === 0 ? '' : 'checked'}> Visible para los pacientes</label>`,
      acciones: [{ texto: 'Cancelar', onClick: (x) => x() }, {
        texto: 'Guardar', clase: 'btn-primary',
        onClick: async (cerrar, btn) => {
          if (!$('#n', m.el).value.trim()) return toast('Escribe un nombre.', 'bad');
          await conBoton(btn, async () => {
            await api(k ? `/api/admin/categorias/${k.id}` : '/api/admin/categorias', { method: k ? 'PUT' : 'POST', body: { nombre: $('#n', m.el).value, orden: Number($('#o', m.el).value), activo: $('#a', m.el).checked } });
            cerrar(); toast('Categoría guardada', 'ok'); await recargar();
          });
        },
      }],
    });
  };
  $('#nuevo').addEventListener('click', () => form());
  $('.t tbody', page).addEventListener('click', async (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    const k = c.categorias.find((x) => x.id === (b.dataset.e || b.dataset.d));
    if (b.dataset.e) form(k);
    if (b.dataset.d && await confirmar(`¿Eliminar la categoría «${k.nombre}»?`, { ok: 'Eliminar', peligro: true, titulo: 'Eliminar categoría' })) {
      await conBoton(b, async () => { await api(`/api/admin/categorias/${k.id}`, { method: 'DELETE' }); toast('Categoría eliminada', 'ok'); await recargar(); });
    }
  });
}

// ───────────── Precios (ajuste masivo) ─────────────
async function pPrecios(page) {
  const c = await catalogo(true);
  const pub = await api('/api/publico/config');
  page.innerHTML = `
    <div class="page-head"><h1>Actualizar precios</h1></div>
    <div class="notice">${icon('info')}<div>Última actualización de precios: <b>${pub.precios_actualizados_en ? fechaHora(pub.precios_actualizados_en) : 'sin registro'}</b>. Esta fecha se muestra a los pacientes.<br>Para cambiar un precio individual, edítalo en <a href="#/examenes">Exámenes</a> o <a href="#/perfiles">Perfiles</a>.</div></div>
    <div class="card" style="max-width:640px;margin-top:14px"><h3>Ajuste por porcentaje</h3>
      <div class="field"><label for="al">¿A qué se aplica?</label><select id="al"><option value="todo">Todos los exámenes y perfiles</option><option value="examenes">Solo los exámenes</option><option value="perfiles">Solo los perfiles</option><option value="categoria">Los exámenes de una categoría</option></select></div>
      <div class="field" id="fcat" hidden><label for="ca">Categoría</label><select id="ca">${c.categorias.map((k) => `<option value="${k.id}">${esc(k.nombre)}</option>`).join('')}</select></div>
      <div class="field"><label for="pc">Porcentaje</label><div class="input-unit"><input id="pc" type="text" inputmode="decimal" placeholder="Ej.: 10"><span>%</span></div><span class="hint">Usa un número negativo para bajar los precios (ejemplo: -5).</span></div>
      <button class="btn btn-soft" id="sim">Ver vista previa</button>
      <div id="prev" style="margin-top:14px"></div></div>`;
  const alc = $('#al');
  alc.addEventListener('change', () => { $('#fcat').hidden = alc.value !== 'categoria'; $('#prev').innerHTML = ''; });
  $('#sim').addEventListener('click', async (ev) => {
    const pct = Number($('#pc').value.replace(',', '.'));
    if (!Number.isFinite(pct) || pct === 0) return toast('Escribe un porcentaje distinto de cero.', 'bad');
    const body = { alcance: alc.value, categoria_id: $('#ca').value, porcentaje: pct };
    await conBoton(ev.currentTarget, async () => {
      const r = await api('/api/admin/precios/masivo', { method: 'POST', body: { ...body, simular: true } });
      $('#prev').innerHTML = r.afectados === 0 ? '<div class="notice warn">Ningún precio cambiaría con ese ajuste.</div>'
        : `<p><b>${r.afectados}</b> precio(s) cambiarían. Ejemplos:</p><div class="tw"><table class="t"><tbody>${r.ejemplos.map((x) => `<tr><td>${esc(x.nombre)}</td><td class="right muted">${ref(x.antes)}</td><td>→</td><td class="right"><b>${ref(x.despues)}</b></td></tr>`).join('')}</tbody></table></div>
          <button class="btn btn-primary" id="ap" style="margin-top:12px">Aplicar a los ${r.afectados} precios</button>`;
      $('#ap')?.addEventListener('click', async (e2) => {
        if (!(await confirmar(`Se cambiarán ${r.afectados} precios (${pct > 0 ? '+' : ''}${pct}%). Esta acción no se puede deshacer, pero puedes aplicar el ajuste inverso.`, { ok: 'Aplicar cambios', titulo: 'Confirmar ajuste' }))) return;
        await conBoton(e2.currentTarget, async () => { const f = await api('/api/admin/precios/masivo', { method: 'POST', body }); toast(`${f.afectados} precios actualizados`, 'ok'); await recargar(); });
      });
    });
  });
}

// ───────────── Configuración ─────────────
async function pConfig(page) {
  const { config: cf, origenes, tasa_auto: ta, slug } = await api('/api/admin/config');
  let logo = cf.logo;
  page.innerHTML = `
    <div class="page-head"><h1>Configuración</h1></div>
    <form id="fc" novalidate style="max-width:760px">
      <div class="card"><h3>Identidad del negocio</h3>
        <div class="field"><label for="nm">Nombre que verán los pacientes</label><input id="nm" type="text" maxlength="80" value="${esc(cf.nombre_publico)}"></div>
        <div class="row"><div class="field"><label>Logo</label><div style="display:flex;gap:12px;align-items:center"><div class="logo-prev" id="lp">${logo ? `<img src="${esc(logo)}" alt="">` : 'Sin logo'}</div>
          <div><input type="file" id="lf" accept="image/*" hidden><button type="button" class="btn btn-sm" id="lb">Subir imagen</button> <button type="button" class="btn btn-sm btn-ghost" id="lq" ${logo ? '' : 'hidden'}>Quitar</button></div></div>
          <span class="hint">Se ajusta automáticamente. Funciona mejor con fondo blanco o transparente.</span></div>
          <div class="field"><label for="co">Color principal</label><div style="display:flex;gap:10px;align-items:center"><input id="co" type="color" value="${esc(cf.color_principal)}"><span class="muted small">Se usa en botones y encabezados.</span></div></div></div></div>
      <div class="card"><h3>Datos de contacto <span class="muted small" style="font-weight:500">(aparecen en el presupuesto)</span></h3>
        <div class="row"><div class="field"><label for="te">Teléfono</label><input id="te" type="text" maxlength="40" value="${esc(cf.telefono)}"></div><div class="field"><label for="ho">Horario</label><input id="ho" type="text" maxlength="200" value="${esc(cf.horario)}"></div></div>
        <div class="field"><label for="di">Dirección</label><input id="di" type="text" maxlength="200" value="${esc(cf.direccion)}"></div></div>
      <div class="card"><h3>Presupuesto</h3>
        <div class="row"><div class="field"><label for="vi">Validez del presupuesto (días)</label><input id="vi" type="number" min="1" max="365" value="${cf.dias_vigencia}"><span class="hint">Por ejemplo 7 (una semana) o 30 (un mes).</span></div>
          <div class="field"><label for="px">Prefijo del código</label><input id="px" type="text" maxlength="5" value="${esc(cf.prefijo_codigo)}" style="text-transform:uppercase"><span class="hint">2 a 5 letras o números. Ejemplo: LC → LC-000123.</span></div></div>
        <div class="field"><label for="pie">Texto al pie del presupuesto</label><textarea id="pie" maxlength="500" placeholder="Ej.: Presenta este presupuesto en el laboratorio.">${esc(cf.pie_presupuesto)}</textarea></div></div>
      <div class="card"><h3>Tasa de cambio (REF → bolívares)</h3>
        <div class="notice ${ta && !ta.desactualizada ? 'ok' : 'warn'}" style="margin-bottom:12px">${icon('info')}<div>${ta ? `Tasa BCV automática: <b>${fmtTasa(ta.valor)} Bs.</b> (${fmtFecha(ta.fecha_valor)})${ta.fuente === 'ejemplo' ? ' · valor de ejemplo' : ''}${ta.desactualizada ? ' · <b>sin actualizar recientemente</b>' : ''}.` : 'Todavía no se ha obtenido la tasa BCV automática.'}</div></div>
        <label class="check"><input id="um" type="checkbox" ${cf.usar_tasa_manual ? 'checked' : ''}> Usar una tasa fija indicada por mí (en lugar de la automática)</label>
        <div class="field" style="margin-top:8px;max-width:260px"><label for="tm">Tasa manual</label><div class="input-unit"><input id="tm" type="text" inputmode="decimal" value="${cf.tasa_manual ? String(cf.tasa_manual).replace('.', ',') : ''}" placeholder="0,0000"><span>Bs.</span></div>
          <span class="hint">Bolívares por 1 REF. Si no la activas, sirve como respaldo cuando no hay tasa automática.</span></div></div>
      <button class="btn btn-primary btn-lg" type="submit" style="max-width:320px">Guardar cambios</button>
    </form>

    <div class="card" style="max-width:760px;margin-top:20px"><h3>¿Cómo se enteró de nosotros?</h3><p class="muted small">Opciones que verá el paciente. Sirven para las estadísticas de origen.</p>
      <div id="ol"></div>
      <div style="display:flex;gap:8px;margin-top:10px"><input type="text" id="on" maxlength="80" placeholder="Nueva opción (ej.: Volante, TikTok…)" aria-label="Nueva opción"><button class="btn btn-soft" id="oa" style="flex:none">${icon('plus')} Agregar</button></div></div>

    <div class="card" style="max-width:760px"><h3>Dirección de la aplicación</h3>
      <p class="small">Comparte este enlace con tus pacientes: <b>${esc(urlCompleta(`/${slug}`))}</b></p><p class="muted xs">Panel de administración: ${esc(urlCompleta(`/${slug}/admin`))}</p></div>

    ${A.me.super ? '' : `<div class="card" style="max-width:760px"><h3>Seguridad</h3>
      <form id="fpw" novalidate><div class="row"><div class="field"><label for="pa">Contraseña actual</label><input id="pa" type="password" autocomplete="current-password"></div>
        <div class="field"><label for="pn">Contraseña nueva</label><input id="pn" type="password" autocomplete="new-password" minlength="8"><span class="hint">Mínimo 8 caracteres.</span></div></div>
        <button class="btn" type="submit">Cambiar contraseña</button></form></div>`}`;

  const pintarOrigenes = (lista) => {
    $('#ol').innerHTML = lista.length ? lista.map((o) => `<div style="display:flex;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid var(--line)"><span style="flex:1" class="${o.activo ? '' : 'muted'}">${esc(o.nombre)}${o.activo ? '' : ' (oculta)'}</span>
      <button type="button" class="btn btn-sm" data-r="${o.id}">Renombrar</button><button type="button" class="btn btn-sm" data-v="${o.id}">${o.activo ? 'Ocultar' : 'Mostrar'}</button><button type="button" class="btn btn-sm btn-danger btn-icon" data-x="${o.id}" aria-label="Eliminar ${esc(o.nombre)}">${icon('trash')}</button></div>`).join('') : '<p class="muted small">No hay opciones.</p>';
  };
  let ors = origenes;
  const refrescarOrigenes = async () => { ors = (await api('/api/admin/config')).origenes; pintarOrigenes(ors); };
  pintarOrigenes(ors);
  $('#oa').addEventListener('click', async (ev) => { const v = $('#on').value.trim(); if (!v) return; await conBoton(ev.currentTarget, async () => { await api('/api/admin/origenes', { method: 'POST', body: { nombre: v } }); $('#on').value = ''; await refrescarOrigenes(); }); });
  $('#ol').addEventListener('click', async (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    const o = ors.find((x) => x.id === (b.dataset.r || b.dataset.v || b.dataset.x));
    if (b.dataset.v) await conBoton(b, async () => { await api(`/api/admin/origenes/${o.id}`, { method: 'PUT', body: { activo: !o.activo } }); await refrescarOrigenes(); });
    if (b.dataset.x && await confirmar(`¿Eliminar la opción «${o.nombre}»? Las estadísticas anteriores se conservan.`, { ok: 'Eliminar', peligro: true })) await conBoton(b, async () => { await api(`/api/admin/origenes/${o.id}`, { method: 'DELETE' }); await refrescarOrigenes(); });
    if (b.dataset.r) {
      const m = modal({ titulo: 'Renombrar opción', html: `<div class="field"><input id="rn" type="text" maxlength="80" value="${esc(o.nombre)}" aria-label="Nuevo nombre"></div>`, acciones: [{ texto: 'Cancelar', onClick: (x) => x() }, { texto: 'Guardar', clase: 'btn-primary', onClick: async (cerrar, bt) => { await conBoton(bt, async () => { await api(`/api/admin/origenes/${o.id}`, { method: 'PUT', body: { nombre: $('#rn', m.el).value } }); cerrar(); await refrescarOrigenes(); }); } }] });
    }
  });

  $('#lb').addEventListener('click', () => $('#lf').click());
  $('#lf').addEventListener('change', async (ev) => {
    try { logo = await imagenAJpeg(ev.target.files[0]); $('#lp').innerHTML = `<img src="${logo}" alt="">`; $('#lq').hidden = false; } catch (e) { toast(e.message, 'bad'); }
  });
  $('#lq').addEventListener('click', () => { logo = null; $('#lp').textContent = 'Sin logo'; $('#lq').hidden = true; });
  $('#fc').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const tmTxt = $('#tm').value.trim().replace(',', '.');
    await conBoton($('button[type=submit]', ev.target), async () => {
      await api('/api/admin/config', { method: 'PUT', body: {
        nombre_publico: $('#nm').value, logo, color_principal: $('#co').value, telefono: $('#te').value, horario: $('#ho').value, direccion: $('#di').value,
        dias_vigencia: Number($('#vi').value), prefijo_codigo: $('#px').value, pie_presupuesto: $('#pie').value,
        usar_tasa_manual: $('#um').checked, tasa_manual: tmTxt === '' ? null : Number(tmTxt),
      } });
      toast('Configuración guardada', 'ok');
      A.pub = await api('/api/publico/config');
      aplicarColor(A.pub.negocio.color);
      armarMarco();
      ruta();
    });
  });
  $('#fpw')?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    await conBoton($('button', ev.target), async () => { await api('/api/admin/password', { method: 'POST', body: { actual: $('#pa').value, nueva: $('#pn').value } }); ev.target.reset(); toast('Contraseña actualizada', 'ok'); });
  });
}

void fmtNum;
boot();
