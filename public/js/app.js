// Aplicación del paciente: arma un presupuesto, lo genera y lo exporta (PDF, imagen o texto).
import {
  $, esc, api, ref, bs, fmtTasa, fmtFecha, norm, icon, toast, modal, confirmar, conBoton, dispositivo, aplicarColor, diaLocal,
} from './common.js';
import {
  buildDoc, paperHTML, toText, toPdfBlob, toPngBlob, descargar, compartir, puedeCompartir, copiarTexto,
} from './export.js';

const S = {
  cfg: null, cat: null, vista: 'catalogo', tab: 'examenes', q: '', catId: '',
  ex: [], cant: {}, pf: [], pac: { nombre: '', cedula: '', telefono: '', medico: '' }, origen: '', res: null, firma: null,
};
let exMap = new Map();
let pfMap = new Map();
let K = 'pe:?';

// ───────────── Datos derivados ─────────────
// Cantidad de cada examen (S.cant solo guarda las mayores que 1). Cuántas veces se puede pedir
// un mismo examen lo decide su categoría: max_por_examen (vacío o 1 = una sola vez).
const cant = (id) => S.cant[id] || 1;
const maxPor = (e) => { const c = S.cat.categorias.find((k) => k.id === e?.categoria_id); return Number(c?.max_por_examen) > 1 ? Number(c.max_por_examen) : 1; };
const nItems = () => S.ex.reduce((s, id) => s + cant(id), 0) + S.pf.length;
const totalRef = () => S.ex.reduce((s, id) => s + (exMap.get(id)?.precio_cent || 0) * cant(id), 0) + S.pf.reduce((s, id) => s + (pfMap.get(id)?.precio_cent || 0), 0);
const cubiertoPor = (exId) => { for (const pid of S.pf) { const p = pfMap.get(pid); if (p?.ids.has(exId)) return p; } return null; };
const items = () => [...S.ex.map((id) => (cant(id) > 1 ? { tipo: 'examen', id, cantidad: cant(id) } : { tipo: 'examen', id })), ...S.pf.map((id) => ({ tipo: 'perfil', id }))];
/** Deja las cantidades coherentes: solo de exámenes elegidos y sin pasar el máximo de su categoría. */
function ajustarCantidades() {
  const c = {};
  for (const id of S.ex) { const n = Math.min(Number(S.cant[id]) || 1, maxPor(exMap.get(id))); if (n > 1) c[id] = n; }
  S.cant = c;
}

function indexar() {
  exMap = new Map(S.cat.examenes.map((e) => [e.id, e]));
  pfMap = new Map(S.cat.perfiles.map((p) => [p.id, { ...p, ids: new Set(p.examenes.map((m) => m.id)) }]));
}

// ───────────── Persistencia local (solo en este dispositivo) ─────────────
const leer = (store, k) => { try { return JSON.parse(store.getItem(`${K}:${k}`)); } catch { return null; } };
const guardar = (store, k, v) => { try { store.setItem(`${K}:${k}`, JSON.stringify(v)); } catch { /* almacenamiento no disponible */ } };
function cargarEstado() {
  const c = leer(localStorage, 'carro');
  if (c) { S.ex = [...new Set((c.ex || []).filter((id) => exMap.has(id)))]; S.pf = (c.pf || []).filter((id) => pfMap.has(id)); S.cant = c.cant || {}; }
  // Seguridad: si el carro guardado tuviera repetidos, se limpia
  const usados = new Set();
  for (const id of S.pf) for (const x of pfMap.get(id).ids) { if (usados.has(x)) { S.pf = []; break; } usados.add(x); }
  S.ex = S.ex.filter((id) => !cubiertoPor(id));
  ajustarCantidades();
  const r = leer(localStorage, 'res');
  if (r) { S.res = r.res; S.firma = r.firma; }
  const p = leer(sessionStorage, 'pac'); // los datos personales duran solo mientras la pestaña esté abierta
  if (p) S.pac = { ...S.pac, ...p };
  S.origen = leer(sessionStorage, 'origen') || '';
  S.origenRespondido = !!leer(sessionStorage, 'origenR');
}
const guardarCarro = () => guardar(localStorage, 'carro', { ex: S.ex, pf: S.pf, cant: S.cant });

// ───────────── Arranque ─────────────
async function init() {
  const app = $('#app');
  app.innerHTML = '<div class="wrap" style="padding-top:24px"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>';
  try {
    [S.cfg, S.cat] = await Promise.all([api('/api/publico/config'), api('/api/publico/catalogo')]);
  } catch (e) {
    app.innerHTML = `<div class="wrap" style="padding-top:40px"><div class="card centro"><h1>No pudimos cargar la página</h1><p class="muted">${esc(e.message)}</p><button class="btn btn-primary" onclick="location.reload()">Reintentar</button></div></div>`;
    return;
  }
  K = `pe:${S.cfg.negocio.slug}`;
  indexar();
  aplicarColor(S.cfg.negocio.color);
  document.title = `${S.cfg.negocio.nombre} · Presupuesto de exámenes`;
  cargarEstado();
  montar();
  history.replaceState({ v: 'catalogo' }, '');
  window.addEventListener('popstate', (e) => { S.vista = e.state?.v || 'catalogo'; if (S.vista === 'ok' && !S.res) S.vista = 'resumen'; renderVista(); });
  renderTodo();
  if (!sessionStorage.getItem(`${K}:visita`)) {
    sessionStorage.setItem(`${K}:visita`, '1');
    api('/api/publico/visita', { method: 'POST', body: { dispositivo: dispositivo() } }).catch(() => {});
  }
}

function montar() {
  const n = S.cfg.negocio;
  $('#app').innerHTML = `
  <header class="top"><div class="wrap">
    <div class="brand">${n.logo ? `<img src="${esc(n.logo)}" alt="">` : `<span class="mark">${icon('flask')}</span>`}
      <div style="min-width:0"><strong>${esc(n.nombre)}</strong><small>Presupuesto de exámenes</small></div></div>
    <div class="ratechip" id="rate"></div>
  </div></header>
  <main class="patient wrap">
    <section id="v-catalogo" class="stack">
      <div class="ratebar" id="ratebar"></div>
      <div id="aviso"></div>
      <div class="search">${icon('search')}<input id="q" type="search" placeholder="Buscar examen o perfil…" autocomplete="off" aria-label="Buscar examen o perfil"></div>
      <div class="chips" id="chips" aria-label="Categorías"></div>
      <div class="tabs" id="tabs"></div>
      <div id="lista"></div>
    </section>
    <section id="v-resumen" hidden></section>
    <section id="v-ok" hidden></section>
  </main>
  <div class="cartbar" id="cartbar" hidden></div>`;
}

// ───────────── Pintado ─────────────
function renderTodo() { renderRate(); renderAviso(); renderChips(); renderLista(); renderVista(); }

function renderRate() {
  const t = S.cfg.tasa;
  const el = $('#rate'), bar = $('#ratebar');
  if (!t) { el.innerHTML = '<b>Tasa no disponible</b>'; bar.innerHTML = 'Tasa no disponible'; return; }
  const cls = t.desactualizada ? ' stale' : '';
  const ley = t.manual ? 'Tasa del negocio' : `Tasa BCV ${fmtFecha(t.fecha_valor)}`;
  const ej = t.fuente === 'ejemplo' ? ' · ejemplo' : '';
  el.className = `ratechip${cls}`;
  el.innerHTML = `<b>1 REF = ${fmtTasa(t.valor)} Bs.</b>${ley}${ej}`;
  bar.className = `ratebar${cls}`;
  bar.innerHTML = `<b>1 REF = ${fmtTasa(t.valor)} Bs.</b> · ${ley}${ej}`;
}

function renderAviso() {
  const n = S.cfg.negocio;
  const fecha = S.cfg.precios_actualizados_en ? diaLocal(S.cfg.precios_actualizados_en) : null;
  $('#aviso').innerHTML = `<div class="notice">${icon('info')}<div>${fecha ? `Precios actualizados el <b>${fmtFecha(fecha)}</b>. ` : ''}Tu presupuesto tendrá una validez de <b>${n.dias_vigencia} ${n.dias_vigencia === 1 ? 'día' : 'días'}</b>.</div></div>`;
}

function renderChips() {
  const cats = [{ id: '', nombre: 'Todas' }, ...S.cat.categorias];
  $('#chips').innerHTML = cats.map((c) => `<button type="button" class="chip ${S.catId === c.id ? 'on' : ''}" data-act="cat" data-id="${esc(c.id)}">${esc(c.nombre)}</button>`).join('');
}

function filtrar() {
  const q = norm(S.q.trim());
  const ex = S.cat.examenes.filter((e) => (!S.catId || e.categoria_id === S.catId) && (!q || norm(e.nombre).includes(q) || norm(e.descripcion).includes(q)));
  const pf = S.cat.perfiles.filter((p) => (!S.catId || p.examenes.some((m) => exMap.get(m.id)?.categoria_id === S.catId)) && (!q || norm(p.nombre).includes(q) || p.examenes.some((m) => norm(m.nombre).includes(q))));
  return { ex, pf };
}

function cardExamen(e) {
  const sel = S.ex.includes(e.id);
  const cub = !sel && cubiertoPor(e.id);
  const cat = S.cat.categorias.find((c) => c.id === e.categoria_id);
  const max = maxPor(e);
  let accion;
  if (cub) accion = `<span class="badge ok" style="white-space:normal;text-align:center;max-width:130px">Incluido en ${esc(cub.nombre)}</span>`;
  else if (sel && max > 1) accion = contador(e, 'tarjeta');
  else accion = `<button type="button" class="btn btn-sm ${sel ? 'btn-primary' : 'btn-soft'}" data-act="ex" data-id="${esc(e.id)}" aria-pressed="${sel}">${sel ? `${icon('check')} Agregado` : `${icon('plus')} Agregar`}</button>`;
  return `<article class="item ${sel ? 'sel' : ''} ${cub ? 'dis' : ''}">
    <div><h3>${esc(e.nombre)}</h3>
      <div class="meta">${cat ? `<span class="badge cat-${(S.cat.categorias.indexOf(cat) % 5) + 1}">${esc(cat.nombre)}</span>` : ''}${max > 1 ? `<span>Puedes pedir hasta ${max}</span>` : ''}${e.indicaciones ? `<span>${icon('info')} ${esc(e.indicaciones)}</span>` : ''}</div>
      ${e.descripcion ? `<p class="desc">${esc(e.descripcion)}</p>` : ''}</div>
    <div class="side"><div class="price">${ref(e.precio_cent)}${max > 1 ? '<small> c/u</small>' : ''}</div>${accion}</div>
  </article>`;
}

/** Contador − n + para los exámenes que se pueden pedir varias veces. */
function contador(e, donde) {
  const n = cant(e.id);
  const max = maxPor(e);
  return `<div class="contador ${donde}" role="group" aria-label="Cantidad de ${esc(e.nombre)}">
    <button type="button" class="btn btn-sm btn-icon" data-act="menos" data-id="${esc(e.id)}" aria-label="${n === 1 ? 'Quitar' : 'Uno menos'}">${n === 1 ? icon('trash') : '−'}</button>
    <span aria-live="polite">${n}</span>
    <button type="button" class="btn btn-sm btn-icon" data-act="mas" data-id="${esc(e.id)}" aria-label="Uno más" ${n >= max ? 'disabled' : ''}>+</button>
  </div>`;
}

function cardPerfil(p) {
  const sel = S.pf.includes(p.id);
  const info = pfMap.get(p.id);
  return `<article class="item ${sel ? 'sel' : ''}">
    <div><h3>${esc(p.nombre)}</h3>
      <div class="meta"><span class="badge">Perfil · ${p.examenes.length} exámenes</span></div>
      ${p.descripcion ? `<p class="desc">${esc(p.descripcion)}</p>` : ''}</div>
    <div class="side"><div class="price">${ref(p.precio_cent)}</div>
      <button type="button" class="btn btn-sm ${sel ? 'btn-primary' : 'btn-soft'}" data-act="pf" data-id="${esc(p.id)}" aria-pressed="${sel}">${sel ? `${icon('check')} Agregado` : `${icon('plus')} Agregar`}</button></div>
    <details><summary>Ver los exámenes incluidos</summary><ul>${[...info.ids].map((id) => `<li>${esc(p.examenes.find((m) => m.id === id)?.nombre)}</li>`).join('')}</ul></details>
  </article>`;
}

function renderLista() {
  const { ex, pf } = filtrar();
  $('#tabs').innerHTML = `<button type="button" class="${S.tab === 'examenes' ? 'on' : ''}" data-act="tab" data-id="examenes">Exámenes <span class="n">(${ex.length})</span></button>
    <button type="button" class="${S.tab === 'perfiles' ? 'on' : ''}" data-act="tab" data-id="perfiles">Perfiles <span class="n">(${pf.length})</span></button>`;
  const lista = S.tab === 'examenes' ? ex : pf;
  const otro = S.tab === 'examenes' ? pf.length : ex.length;
  let html;
  if (!S.cat.examenes.length) html = `<div class="empty">${icon('empty')}<p>Este negocio aún no tiene exámenes publicados.</p></div>`;
  else if (!lista.length) {
    html = `<div class="empty">${icon('search')}<p>No encontramos ${S.tab === 'examenes' ? 'exámenes' : 'perfiles'} con ese criterio.</p>
      ${otro ? `<button type="button" class="btn btn-soft btn-sm" data-act="tab" data-id="${S.tab === 'examenes' ? 'perfiles' : 'examenes'}">Ver ${otro} en ${S.tab === 'examenes' ? 'Perfiles' : 'Exámenes'}</button>` : ''}</div>`;
  } else {
    html = lista.map(S.tab === 'examenes' ? cardExamen : cardPerfil).join('');
    // Si la categoría elegida tiene límite, se avisa antes de que el paciente choque con él
    const cat = S.tab === 'examenes' && S.catId && S.cat.categorias.find((c) => c.id === S.catId);
    const max = Number(cat?.max_por_examen) || 0;
    if (max > 1) html = `<p class="limite">${icon('info')}<span>De ${esc(cat.nombre)} puedes pedir el mismo examen <b>hasta ${max} veces</b>.</span></p>${html}`;
  }
  $('#lista').innerHTML = html;
  renderCartBar();
}

function renderCartBar() {
  const bar = $('#cartbar');
  const n = nItems();
  bar.hidden = !(n > 0 && S.vista === 'catalogo');
  if (bar.hidden) return;
  bar.innerHTML = `<div class="cart-in"><button type="button" class="vaciar" data-act="vaciar" aria-label="Vaciar presupuesto" title="Vaciar presupuesto">${icon('trash')}</button>
    <button type="button" class="ir" data-act="resumen"><span class="count">${n}</span><span class="grow">Ver mi presupuesto</span><span>${ref(totalRef())}</span></button></div>`;
}

function renderVista() {
  for (const v of ['catalogo', 'resumen', 'ok']) $(`#v-${v}`).hidden = S.vista !== v;
  if (S.vista === 'resumen') renderResumen();
  if (S.vista === 'ok') renderOk();
  renderCartBar();
  window.scrollTo({ top: 0 });
}

function irA(v) {
  if (S.vista === v) return;
  S.vista = v;
  history.pushState({ v }, '');
  renderVista();
}

// ───────────── Resumen ─────────────
function formPaciente() {
  const c = (k, label, extra = '') => `<div class="field"><label for="p-${k}">${label}</label><input id="p-${k}" type="text" data-pac="${k}" maxlength="80" value="${esc(S.pac[k])}" ${extra}></div>`;
  return `<div class="row">${c('nombre', 'Nombre y apellido', 'autocomplete="name"')}${c('cedula', 'Cédula de identidad', 'inputmode="text"')}</div>
    <div class="row">${c('telefono', 'Teléfono', 'inputmode="tel" autocomplete="tel"')}${c('medico', 'Médico referente')}</div>`;
}

function renderResumen() {
  const el = $('#v-resumen');
  if (!nItems()) {
    el.innerHTML = `<div class="empty">${icon('cart')}<p>Tu presupuesto está vacío.</p><button class="btn btn-primary" data-act="volver">Elegir exámenes</button></div>`;
    return;
  }
  const t = S.cfg.tasa;
  const total = totalRef();
  const lineas = [
    ...S.pf.map((id) => pfMap.get(id)).map((p) => ({ tipo: 'pf', id: p.id, nombre: p.nombre, precio: p.precio_cent, sub: `Incluye ${p.examenes.length} exámenes: ${p.examenes.map((m) => m.nombre).join(', ')}` })),
    ...S.ex.map((id) => exMap.get(id)).map((e) => {
      const n = cant(e.id);
      const sub = [n > 1 && `${n} × ${ref(e.precio_cent)}`, e.indicaciones].filter(Boolean).join(' · ');
      return { tipo: 'ex', id: e.id, nombre: e.nombre, precio: e.precio_cent * n, sub, e, repetible: maxPor(e) > 1 };
    }),
  ];
  el.innerHTML = `
    <div class="res-head"><button type="button" class="btn btn-ghost back" data-act="volver">${icon('back')} Seguir agregando</button>
      <button type="button" class="btn btn-ghost btn-sm vaciar-txt" data-act="vaciar">${icon('trash')} Vaciar</button></div>
    <ol class="pasos" aria-label="Pasos"><li class="hecho"><i>${icon('check')}</i>Elige</li><li class="actual" aria-current="step"><i>2</i>Revisa</li><li><i>3</i>Genera</li></ol>
    <h2 style="margin:4px 0 10px">Revisa tu presupuesto</h2>
    <div class="notice falta">${icon('info')}<div><b>Aún no está listo.</b> Revisa los exámenes y pulsa <b>Generar presupuesto</b>: así obtienes tu código y puedes descargarlo para presentarlo en el laboratorio.</div></div>
    <div class="card lines">${lineas.map((l) => `<div class="line ${l.repetible ? 'con-contador' : ''}"><div><b>${esc(l.nombre)}</b>${l.sub ? `<small>${esc(l.sub)}</small>` : ''}</div><div class="price">${ref(l.precio)}</div>
      ${l.repetible ? contador(l.e, 'linea') : `<button type="button" class="btn btn-icon btn-ghost" aria-label="Quitar ${esc(l.nombre)}" data-act="${l.tipo}" data-id="${esc(l.id)}">${icon('trash')}</button>`}</div>`).join('')}</div>
    <div class="card totals">
      <div class="tr"><span>Total en REF</span><span class="big">${ref(total)}</span></div>
      ${t ? `<div class="tr main"><span>Total en bolívares</span><span class="big">${bs(Math.round(total * t.valor))}</span></div>
        <div class="sub">${t.manual ? `Tasa aplicada: ${fmtTasa(t.valor)} Bs. por REF` : `Tasa BCV del ${fmtFecha(t.fecha_valor)}: ${fmtTasa(t.valor)} Bs. por REF`}. El monto en bolívares puede variar según la tasa vigente al momento del pago.</div>
        ${t.desactualizada ? `<div class="notice warn" style="margin-top:10px">${icon('warn')}<div>No pudimos actualizar la tasa recientemente; usamos la última conocida (${fmtFecha(t.fecha_valor)}).</div></div>` : ''}`
        : `<div class="notice warn" style="margin-top:10px">${icon('warn')}<div>La tasa de cambio no está disponible en este momento. Puedes generar tu presupuesto en REF.</div></div>`}
    </div>
    <div class="card"><h3>Datos del paciente <span class="muted small" style="font-weight:500">(opcional)</span></h3>${formPaciente()}</div>
    <p class="muted small" style="text-align:center;margin-top:12px">No guardamos tus datos personales: solo aparecen en el documento que descargues o copies.</p>
    <div class="genbar"><button type="button" data-act="generar"><span class="grow">Generar presupuesto</span><span>${ref(total)}</span>${icon('back')}</button></div>`;
}

// ───────────── Presupuesto generado ─────────────
const docActual = () => buildDoc({ res: S.res, negocio: S.cfg.negocio, paciente: S.pac });

function renderOk() {
  const el = $('#v-ok');
  if (!S.res) { el.innerHTML = ''; return; }
  const nom = `presupuesto-${S.res.codigo}`;
  el.innerHTML = `
    <div class="notice ok">${icon('check')}<div>Presupuesto <b>${esc(S.res.codigo)}</b> generado. Guárdalo en tu teléfono y muéstralo en el laboratorio.</div></div>
    <div class="actions" data-nombre="${esc(nom)}">
      <button type="button" class="btn btn-primary" data-act="pdf">${icon('pdf')} Descargar PDF</button>
      <button type="button" class="btn btn-primary" data-act="png">${icon('image')} Descargar imagen</button>
      <button type="button" class="btn" data-act="texto">${icon('copy')} Copiar texto</button>
      ${puedeCompartir() ? `<button type="button" class="btn" data-act="compartir">${icon('share')} Compartir</button>` : ''}
    </div>
    <details class="card" style="padding:0 16px"><summary style="cursor:pointer;font-weight:600;min-height:48px;display:flex;align-items:center">Agregar o cambiar datos del paciente</summary><div style="padding-bottom:6px">${formPaciente()}</div></details>
    <div class="paper" id="paper" style="margin-top:14px">${paperHTML(docActual())}</div>
    <div class="actions"><button type="button" class="btn" data-act="editar">${icon('edit')} Editar presupuesto</button><button type="button" class="btn" data-act="nuevo">${icon('plus')} Nuevo presupuesto</button></div>`;
}

/**
 * Paso intermedio antes de generar: ¿cómo se enteró de nosotros? Se pregunta una vez por visita.
 * Devuelve true para seguir (eligió una opción o prefirió no decirlo) o false si cerró la ventana.
 */
function preguntarOrigen() {
  if (!S.cfg.origenes.length || S.origenRespondido) return Promise.resolve(true);
  return new Promise((resolve) => {
    let elegido = false;
    const m = modal({
      titulo: 'Un último paso',
      html: `<p>¿Cómo se enteró de nosotros?</p>
        <div class="origenes">${S.cfg.origenes.map((o) => `<button type="button" class="btn btn-lg" data-o="${esc(o.id)}">${esc(o.nombre)}</button>`).join('')}</div>
        <button type="button" class="btn btn-ghost btn-sm sin-origen" data-o="">Prefiero no decirlo</button>`,
      onClose: () => resolve(elegido),
    });
    m.el.querySelector('.mb').addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-o]');
      if (!b) return;
      S.origen = b.dataset.o;
      S.origenRespondido = true;
      guardar(sessionStorage, 'origen', S.origen);
      guardar(sessionStorage, 'origenR', 1);
      elegido = true;
      m.cerrar();
    });
    m.el.querySelector('[data-o]')?.focus();
  });
}

async function generar(btn) {
  if (!(await preguntarOrigen())) return;
  const lista = items();
  const firma = `${JSON.stringify([...lista].sort((a, b) => a.id.localeCompare(b.id)))}|${S.origen}`;
  if (S.res && S.firma === firma) { irA('ok'); return; } // mismo presupuesto: no se cuenta dos veces
  await conBoton(btn, async () => {
    try {
      S.res = await api('/api/publico/presupuesto', { method: 'POST', body: { items: lista, origen_id: S.origen || null, dispositivo: dispositivo() } });
      S.firma = firma;
      guardar(localStorage, 'res', { res: S.res, firma });
      irA('ok');
    } catch (e) {
      if (e.status === 409) await recargar();
      throw e;
    }
  });
}

/** Si el catálogo cambió mientras el paciente armaba su presupuesto, se actualiza y se depura. */
async function recargar() {
  try {
    [S.cfg, S.cat] = await Promise.all([api('/api/publico/config'), api('/api/publico/catalogo')]);
    indexar();
    S.ex = S.ex.filter((id) => exMap.has(id) && !cubiertoPor(id));
    S.pf = S.pf.filter((id) => pfMap.has(id));
    ajustarCantidades();
    guardarCarro();
    renderTodo();
  } catch { /* se mostrará el error original */ }
}

async function exportar(tipo, btn) {
  const doc = docActual();
  const nombre = `presupuesto-${S.res.codigo}`;
  await conBoton(btn, async () => {
    if (tipo === 'pdf') { descargar(await toPdfBlob(doc), `${nombre}.pdf`); toast('PDF descargado', 'ok'); }
    else if (tipo === 'png') { descargar(await toPngBlob(doc), `${nombre}.png`); toast('Imagen descargada', 'ok'); }
    else if (tipo === 'texto') {
      if (await copiarTexto(toText(doc))) toast('Texto copiado. Ya puedes pegarlo en un mensaje o nota.', 'ok');
      else modal({ titulo: 'Copia el texto', html: `<textarea readonly style="min-height:240px" onfocus="this.select()">${esc(toText(doc))}</textarea>`, acciones: [{ texto: 'Cerrar', clase: 'btn-primary', onClick: (c) => c() }] });
    } else if (tipo === 'compartir') {
      try { await compartir({ blob: await toPdfBlob(doc), nombre: `${nombre}.pdf`, titulo: `Presupuesto ${S.res.codigo}`, texto: toText(doc) }); } catch (e) { if (e.name !== 'AbortError') throw e; }
    }
  });
}

// ───────────── Acciones sobre el carrito (con la regla anti-duplicados) ─────────────
function cambio() {
  guardarCarro();
  renderLista();
  if (S.vista === 'resumen') renderResumen();
}

function alternarExamen(id) {
  const e = exMap.get(id);
  if (!e) return;
  if (S.ex.includes(id)) { S.ex = S.ex.filter((x) => x !== id); delete S.cant[id]; }
  else {
    const p = cubiertoPor(id);
    if (p) { toast(`«${e.nombre}» ya está incluido en ${p.nombre}.`); return; }
    S.ex.push(id);
  }
  cambio();
}

/** Uno más / uno menos de un examen que se puede pedir varias veces (al bajar de 1, se quita). */
function cambiarCantidad(id, delta) {
  const e = exMap.get(id);
  if (!e || !S.ex.includes(id)) return;
  const n = cant(id) + delta;
  const max = maxPor(e);
  if (n < 1) { alternarExamen(id); return; }
  if (n > max) { toast(`«${e.nombre}» se puede pedir hasta ${max} veces.`); return; }
  if (n === 1) delete S.cant[id]; else S.cant[id] = n;
  cambio();
}

function agregarPerfil(p) {
  const sueltos = S.ex.filter((id) => p.ids.has(id));
  if (sueltos.length) {
    S.ex = S.ex.filter((id) => !p.ids.has(id));
    const nombres = sueltos.map((id) => exMap.get(id)?.nombre);
    toast(sueltos.length === 1
      ? `«${nombres[0]}» ya está incluido en ${p.nombre}; lo quitamos de tus exámenes sueltos.`
      : `${sueltos.length} exámenes (${nombres.join(', ')}) ya están incluidos en ${p.nombre}; los quitamos de tus exámenes sueltos.`);
  }
  S.pf.push(p.id);
  cambio();
}

function alternarPerfil(id) {
  const p = pfMap.get(id);
  if (!p) return;
  if (S.pf.includes(id)) { S.pf = S.pf.filter((x) => x !== id); cambio(); return; }
  const conflictos = S.pf.map((q) => pfMap.get(q)).map((pq) => ({ perfil: pq, comunes: pq.examenes.filter((m) => p.ids.has(m.id)) })).filter((c) => c.comunes.length);
  if (!conflictos.length) { agregarPerfil(p); return; }
  const varios = conflictos.length > 1;
  modal({
    titulo: 'Este perfil repite exámenes',
    html: `<p>«${esc(p.nombre)}» incluye exámenes que ya están en ${varios ? 'otros perfiles' : 'otro perfil'} de tu presupuesto. Un examen no puede repetirse.</p>
      ${conflictos.map((c) => `<div class="notice warn" style="margin-bottom:8px">${icon('warn')}<div><b>${esc(c.perfil.nombre)}</b> ya incluye: ${c.comunes.map((m) => esc(m.nombre)).join(', ')}.</div></div>`).join('')}
      <p class="muted small">Si lo prefieres, puedes reemplazar ${varios ? 'esos perfiles' : 'ese perfil'} por «${esc(p.nombre)}».</p>`,
    acciones: [
      { texto: 'Cancelar', onClick: (c) => c() },
      { texto: 'Reemplazar', clase: 'btn-primary', onClick: (c) => { const fuera = new Set(conflictos.map((x) => x.perfil.id)); S.pf = S.pf.filter((x) => !fuera.has(x)); agregarPerfil(p); c(); } },
    ],
  });
}

/** Vacía el presupuesto (con confirmación). */
async function vaciar() {
  const n = nItems();
  if (!n) return;
  const texto = n === 1
    ? '¿Vaciar tu presupuesto? Se quitará lo que elegiste.'
    : `¿Vaciar tu presupuesto? Se quitarán los ${n} exámenes o perfiles que elegiste.`;
  if (!(await confirmar(texto, { ok: 'Vaciar', peligro: true, titulo: 'Vaciar presupuesto' }))) return;
  S.ex = []; S.cant = {}; S.pf = [];
  cambio();
  renderCartBar();
  toast('Presupuesto vacío');
}

// ───────────── Eventos ─────────────
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const { act, id } = b.dataset;
  switch (act) {
    case 'cat': S.catId = id; renderChips(); renderLista(); break;
    case 'tab': S.tab = id; renderLista(); break;
    case 'ex': alternarExamen(id); break;
    case 'mas': cambiarCantidad(id, 1); break;
    case 'menos': cambiarCantidad(id, -1); break;
    case 'pf': alternarPerfil(id); break;
    case 'resumen': irA('resumen'); break;
    case 'vaciar': vaciar(); break;
    case 'volver': if (history.state?.v && history.state.v !== 'catalogo') history.back(); else { S.vista = 'catalogo'; renderVista(); } break;
    case 'generar': generar(b); break;
    case 'pdf': case 'png': case 'texto': case 'compartir': exportar(act, b); break;
    case 'editar': S.vista = 'resumen'; history.pushState({ v: 'resumen' }, ''); renderVista(); break;
    case 'nuevo':
      S.ex = []; S.cant = {}; S.pf = []; S.res = null; S.firma = null; S.origen = '';
      guardarCarro(); localStorage.removeItem(`${K}:res`);
      S.vista = 'catalogo'; history.pushState({ v: 'catalogo' }, ''); renderLista(); renderVista();
      break;
    default:
  }
});

document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.id === 'q') { S.q = t.value; renderLista(); return; }
  if (t.dataset?.pac) {
    S.pac[t.dataset.pac] = t.value;
    guardar(sessionStorage, 'pac', S.pac);
    if (S.vista === 'ok') $('#paper').innerHTML = paperHTML(docActual());
  }
});

document.addEventListener('change', (e) => {
  if (e.target.id === 'origen') {
    S.origen = e.target.value;
    guardar(sessionStorage, 'origen', S.origen);
  }
});

init();
