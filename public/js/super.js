// Administración general de la plataforma: negocios (subdominios), sus administradores y la tasa BCV.
import { $, $$, esc, api, icon, toast, modal, conBoton, fmtFecha, fmtTasa } from './common.js';

const root = $('#root');
let base = 'localhost';
const urlNegocio = (slug) => `${location.protocol}//${slug}.${base}${location.port ? `:${location.port}` : ''}`;
const hora = (iso) => { try { return new Date(iso).toLocaleString('es-VE', { timeZone: 'America/Caracas', dateStyle: 'short', timeStyle: 'short' }); } catch { return iso; } };

async function boot() {
  let yo;
  try { yo = await api('/api/super/me'); } catch (e) {
    if (e.status === 401) return login();
    root.innerHTML = `<div class="login"><div class="card"><h1>No se pudo cargar</h1><p class="muted">${esc(e.message)}</p></div></div>`;
    return;
  }
  base = yo.base_domain;
  await pintar(yo);
}

function login() {
  root.innerHTML = `<div class="login"><div class="card"><img src="/img/favicon.svg" alt="" width="48" height="48" style="border-radius:12px">
    <h1>Administración general</h1><p class="muted">Acceso exclusivo de la plataforma.</p>
    <form id="f" novalidate><div class="field"><label for="e">Correo</label><input id="e" type="email" autocomplete="username"></div>
    <div class="field"><label for="p">Contraseña</label><input id="p" type="password" autocomplete="current-password"></div>
    <button class="btn btn-primary btn-lg" type="submit">Entrar</button></form></div></div>`;
  $('#f').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    await conBoton($('button', ev.target), async () => { await api('/api/super/login', { method: 'POST', body: { email: $('#e').value, password: $('#p').value } }); boot(); });
  });
}

async function pintar(yo) {
  const [lista, tasa] = await Promise.all([api('/api/super/negocios'), api('/api/super/tasa')]);
  const t = tasa.tasa;
  root.innerHTML = `
  <header class="adm-top"><div class="in"><div class="brand" style="flex:1"><span class="mark">${icon('flask')}</span><div><strong>Plataforma de presupuestos</strong><small>${esc(yo.email)}</small></div></div>
    <button class="btn btn-sm" id="salir">${icon('out')} Salir</button></div></header>
  <main class="page">
    <div class="page-head"><h1>Negocios <span class="muted" style="font-size:1rem;font-weight:500">(${lista.negocios.length})</span></h1><button class="btn btn-primary" id="nuevo">${icon('plus')} Nuevo negocio</button></div>
    <div class="tw"><table class="t"><thead><tr><th>Negocio</th><th>Dirección</th><th>Administradores</th><th class="right">Exámenes</th><th class="right">Presupuestos</th><th>Estado</th><th></th></tr></thead><tbody>
    ${lista.negocios.map((n) => `<tr class="${n.activo ? '' : 'off'}"><td><b>${esc(n.nombre)}</b></td>
      <td><a href="${esc(urlNegocio(n.slug))}" target="_blank" rel="noopener">${esc(n.slug)}.${esc(base)}</a></td>
      <td class="small adms">${n.admins.map((a) => esc(a.email)).join('<br>') || '<span class="muted">—</span>'}</td>
      <td class="right" data-l="Exámenes:">${n.examenes}</td><td class="right" data-l="Presupuestos:">${n.presupuestos}</td>
      <td><button class="badge ${n.activo ? 'ok' : 'bad'}" style="cursor:pointer;border:0" data-t="${n.id}">${n.activo ? 'Activo' : 'Suspendido'}</button></td>
      <td class="acts"><button class="btn btn-sm" data-a="${n.id}">Administrador</button></td></tr>`).join('')}
    </tbody></table></div>

    <div class="card" style="margin-top:20px;max-width:760px"><h3>Tasa BCV (para todos los negocios)</h3>
      <div class="notice ${t && !t.desactualizada ? 'ok' : 'warn'}">${icon('info')}<div>${t ? `Tasa actual: <b>${fmtTasa(t.valor)} Bs. por REF</b> · vigente el ${fmtFecha(t.fecha_valor)} · fuente: ${esc(t.fuente)}<br>Última verificación: ${hora(t.verificado_en)}${t.desactualizada ? ' · <b>desactualizada</b>' : ''}` : 'Aún no hay ninguna tasa guardada.'}</div></div>
      <p class="muted small" style="margin-top:10px">${tasa.desactivada ? 'La consulta automática está desactivada (BCV_DISABLED).' : `Se consulta automáticamente cada hora a: ${esc(tasa.url)}`}${tasa.consulta.ultimoError ? `<br><b style="color:var(--danger)">Último error: ${esc(tasa.consulta.ultimoError)}</b>` : ''}</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn btn-soft" id="act">Consultar ahora</button>
        <div class="input-unit" style="width:200px"><input id="tm" type="text" inputmode="decimal" placeholder="Tasa manual" aria-label="Tasa manual"><span>Bs.</span></div><button class="btn" id="gm">Guardar tasa manual</button></div>
      <p class="muted xs" style="margin-top:8px">La tasa manual sirve de respaldo si la fuente automática falla; la próxima consulta exitosa la reemplaza.</p></div>
  </main>`;

  $('#salir').addEventListener('click', async () => { await api('/api/super/logout', { method: 'POST' }).catch(() => {}); location.reload(); });
  $('#nuevo').addEventListener('click', formNegocio);
  $('#act').addEventListener('click', (ev) => conBoton(ev.currentTarget, async () => {
    const r = await api('/api/super/tasa/actualizar', { method: 'POST' });
    if (r.ok) toast(`Tasa actualizada: ${fmtTasa(r.valor)} Bs.`, 'ok'); else toast(`No se pudo consultar: ${r.error}`, 'bad');
    boot();
  }));
  $('#gm').addEventListener('click', (ev) => conBoton(ev.currentTarget, async () => {
    const v = Number($('#tm').value.replace(',', '.'));
    if (!Number.isFinite(v) || v <= 0) return toast('Escribe una tasa válida.', 'bad');
    await api('/api/super/tasa/manual', { method: 'POST', body: { valor: v } });
    toast('Tasa guardada', 'ok'); boot();
  }));
  $('.t tbody').addEventListener('click', async (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.dataset.t) {
      const n = lista.negocios.find((x) => x.id === b.dataset.t);
      await conBoton(b, async () => { await api(`/api/super/negocios/${n.id}`, { method: 'PUT', body: { activo: !n.activo } }); toast(n.activo ? 'Negocio suspendido' : 'Negocio activado', 'ok'); boot(); });
    }
    if (b.dataset.a) formAdmin(lista.negocios.find((x) => x.id === b.dataset.a));
  });
}

function formNegocio() {
  const m = modal({
    titulo: 'Nuevo negocio',
    html: `<div class="field"><label for="n">Nombre del negocio</label><input id="n" type="text" maxlength="80" placeholder="Laboratorio Central"></div>
      <div class="field"><label for="s">Subdominio</label><div class="input-unit"><input id="s" type="text" maxlength="30" placeholder="labcentral" style="padding-right:150px;text-transform:lowercase"><span style="font-weight:500">.${esc(base)}</span></div><span class="hint">Solo minúsculas, números y guiones. No se puede repetir.</span></div>
      <div class="field"><label for="e">Correo del administrador</label><input id="e" type="email" autocomplete="off"></div>
      <div class="field"><label for="p">Contraseña inicial</label><input id="p" type="text" autocomplete="off" placeholder="Mínimo 8 caracteres"><span class="hint">Entrégasela al administrador; podrá cambiarla desde su panel.</span></div>`,
    acciones: [{ texto: 'Cancelar', onClick: (x) => x() }, {
      texto: 'Crear negocio', clase: 'btn-primary',
      onClick: async (cerrar, btn) => {
        await conBoton(btn, async () => {
          const r = await api('/api/super/negocios', { method: 'POST', body: { nombre: $('#n', m.el).value, slug: $('#s', m.el).value.trim().toLowerCase(), admin_email: $('#e', m.el).value, admin_password: $('#p', m.el).value } });
          cerrar(); toast(`Negocio creado: ${r.slug}.${base}`, 'ok'); boot();
        });
      },
    }],
  });
}

function formAdmin(n) {
  const m = modal({
    titulo: `Administrador de ${n.nombre}`,
    html: `<p class="muted small">Crea un administrador nuevo o restablece la contraseña de uno existente (escribe su mismo correo).</p>
      <div class="field"><label for="e">Correo</label><input id="e" type="email" value="${esc(n.admins[0]?.email || '')}"></div>
      <div class="field"><label for="p">Contraseña nueva</label><input id="p" type="text" autocomplete="off" placeholder="Mínimo 8 caracteres"></div>`,
    acciones: [{ texto: 'Cancelar', onClick: (x) => x() }, {
      texto: 'Guardar', clase: 'btn-primary',
      onClick: async (cerrar, btn) => {
        await conBoton(btn, async () => {
          const r = await api(`/api/super/negocios/${n.id}/admin`, { method: 'POST', body: { email: $('#e', m.el).value, password: $('#p', m.el).value } });
          cerrar(); toast(r.creado ? 'Administrador creado' : 'Contraseña restablecida', 'ok'); boot();
        });
      },
    }],
  });
}

void $$;
boot();
