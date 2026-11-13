// Administración general de la plataforma: negocios (cada uno en dominio/<negocio>), sus administradores y la tasa BCV.
import { $, $$, esc, api, BASE, urlCompleta, icon, toast, modal, confirmar, conBoton, fmtFecha, fmtTasa } from './common.js';

const root = $('#root');
const urlNegocio = (slug) => urlCompleta(`/${slug}`);
const dirNegocio = (slug) => urlNegocio(slug).replace(/^https?:\/\//, '');
const hora = (iso) => { try { return new Date(iso).toLocaleString('es-VE', { timeZone: 'America/Caracas', dateStyle: 'short', timeStyle: 'short' }); } catch { return iso; } };

async function boot() {
  let yo;
  try { yo = await api('/api/super/me'); } catch (e) {
    if (e.status === 401) return aInicio();
    root.innerHTML = `<div class="login"><div class="card"><h1>No se pudo cargar</h1><p class="muted">${esc(e.message)}</p></div></div>`;
    return;
  }
  await pintar(yo);
}

// Sin sesión: a la página principal, que tiene el inicio de sesión único.
const aInicio = () => location.replace(BASE || '/');

async function pintar(yo) {
  const [lista, tasa] = await Promise.all([api('/api/super/negocios'), api('/api/super/tasa')]);
  const t = tasa.tasa;
  root.innerHTML = `
  <header class="adm-top"><div class="in"><div class="brand" style="flex:1"><span class="mark">${icon('flask')}</span><div><strong>Cotízalo</strong><small>Superadministrador · ${esc(yo.email)}</small></div></div>
    <button class="btn btn-sm" id="salir">${icon('out')} Salir</button></div></header>
  <main class="page">
    <div class="page-head"><h1>Negocios <span class="muted" style="font-size:1rem;font-weight:500">(${lista.negocios.length})</span></h1><button class="btn btn-primary" id="nuevo">${icon('plus')} Nuevo negocio</button></div>
    <div class="tw"><table class="t"><thead><tr><th>Negocio</th><th>Dirección</th><th>Administradores</th><th class="right">Exámenes</th><th class="right">Presupuestos</th><th>Estado</th><th></th></tr></thead><tbody>
    ${lista.negocios.map((n) => `<tr class="${n.activo ? '' : 'off'}"><td><b>${esc(n.nombre)}</b></td>
      <td><a href="${esc(urlNegocio(n.slug))}" target="_blank" rel="noopener">${esc(dirNegocio(n.slug))}</a></td>
      <td class="small adms">${n.admins.map((a) => esc(a.email)).join('<br>') || '<span class="muted">—</span>'}</td>
      <td class="right" data-l="Exámenes:">${n.examenes}</td><td class="right" data-l="Presupuestos:">${n.presupuestos}</td>
      <td><button class="badge ${n.activo ? 'ok' : 'bad'}" style="cursor:pointer;border:0" data-t="${n.id}">${n.activo ? 'Activo' : 'Suspendido'}</button></td>
      <td class="acts"><a class="btn btn-sm btn-soft" href="${esc(urlNegocio(n.slug))}/admin" title="Entrar al panel de ${esc(n.nombre)}">Abrir panel</a> <button class="btn btn-sm" data-a="${n.id}" title="Crear administrador o cambiar su contraseña">Credenciales</button></td></tr>`).join('')}
    </tbody></table></div>

    <div class="card" style="margin-top:20px;max-width:760px"><h3>Tasa BCV (para todos los negocios)</h3>
      <div class="notice ${t && !t.desactualizada ? 'ok' : 'warn'}">${icon('info')}<div>${t ? `Tasa actual: <b>${fmtTasa(t.valor)} Bs. por REF</b> · vigente el ${fmtFecha(t.fecha_valor)} · fuente: ${esc(t.fuente)}<br>Última verificación: ${hora(t.verificado_en)}${t.desactualizada ? ' · <b>desactualizada</b>' : ''}` : 'Aún no hay ninguna tasa guardada.'}</div></div>
      <p class="muted small" style="margin-top:10px">${tasa.desactivada ? 'La consulta automática está desactivada (BCV_DISABLED).' : `Se consulta automáticamente cada hora a: ${esc(tasa.url)}`}${tasa.consulta.ultimoError ? `<br><b style="color:var(--danger)">Último error: ${esc(tasa.consulta.ultimoError)}</b>` : ''}</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn btn-soft" id="act">Consultar ahora</button>
        <div class="input-unit" style="width:200px"><input id="tm" type="text" inputmode="decimal" placeholder="Tasa manual" aria-label="Tasa manual"><span>Bs.</span></div><button class="btn" id="gm">Guardar tasa manual</button></div>
      <p class="muted xs" style="margin-top:8px">La tasa manual sirve de respaldo si la fuente automática falla; la próxima consulta exitosa la reemplaza.</p></div>

    ${yo.ejemplo ? `<div class="card ejemplo" style="margin-top:12px;max-width:760px"><h3>Datos de ejemplo <span class="muted small">(solo en el sitio de pruebas)</span></h3>
      <p class="small">Crea un «Laboratorio de Ejemplo» con catálogo, perfiles, una categoría Patología donde el mismo examen se puede pedir hasta 3 veces, y un mes de presupuestos y visitas inventados para que el panel tenga estadísticas.</p>
      <div id="ej-prog" hidden><div class="bar"><i id="ej-bar" style="width:0%"></i></div><p class="muted xs" id="ej-txt" style="margin-top:6px"></p></div>
      <button class="btn btn-soft" id="ej">${icon('plus')} Crear negocio de ejemplo</button></div>` : ''}

    <div class="card" style="margin-top:12px;max-width:760px"><h3>Tu cuenta</h3>
      <p class="muted small">Entras como <b>${esc(yo.email)}</b>.</p>
      <form id="fpw" novalidate><div class="row"><div class="field"><label for="pa">Contraseña actual</label><input id="pa" type="password" autocomplete="current-password"></div>
        <div class="field"><label for="pn">Contraseña nueva</label><input id="pn" type="password" autocomplete="new-password" minlength="8"><span class="hint">Mínimo 8 caracteres.</span></div></div>
        <button class="btn" type="submit">Cambiar contraseña</button></form></div>
  </main>`;

  $('#salir').addEventListener('click', async () => { await api('/api/super/logout', { method: 'POST' }).catch(() => {}); aInicio(); });
  $('#nuevo').addEventListener('click', formNegocio);
  $('#act').addEventListener('click', (ev) => conBoton(ev.currentTarget, async () => {
    const r = await api('/api/super/tasa/actualizar', { method: 'POST' });
    if (r.ok) toast(`Tasa actualizada: ${fmtTasa(r.valor)} Bs.`, 'ok'); else toast(`No se pudo consultar: ${r.error}`, 'bad');
    boot();
  }));
  $('#ej')?.addEventListener('click', async (ev) => {
    const b = ev.currentTarget;
    b.disabled = true;
    $('#ej-prog').hidden = false;
    // Se crea por pasos (Cloudflare limita las consultas por petición): cada respuesta dice cuál sigue.
    let paso = { paso: 'negocio' };
    let negocio = null;
    try {
      while (paso) {
        const r = await api('/api/super/ejemplo', { method: 'POST', body: paso });
        negocio = r.negocio;
        $('#ej-bar').style.width = `${Math.round((r.hecho / r.total) * 100)}%`;
        $('#ej-txt').textContent = `Creando «${negocio.nombre}»… ${r.hecho} de ${r.total}`;
        paso = r.siguiente;
      }
      toast(`Listo: ${negocio.nombre} en ${dirNegocio(negocio.slug)}`, 'ok');
      boot();
    } catch (e) {
      toast(`No se pudo terminar: ${e.message}`, 'bad');
      b.disabled = false;
    }
  });
  $('#fpw').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    await conBoton($('button', ev.target), async () => {
      await api('/api/super/password', { method: 'POST', body: { actual: $('#pa').value, nueva: $('#pn').value } });
      ev.target.reset();
      toast('Contraseña actualizada', 'ok');
    });
  });
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
      const ok = n.activo
        ? await confirmar(`¿Suspender «${n.nombre}»? Sus pacientes y su administrador no podrán entrar hasta que lo actives de nuevo. Tú seguirás viéndolo.`, { ok: 'Suspender', peligro: true, titulo: 'Suspender negocio' })
        : await confirmar(`¿Activar «${n.nombre}»? Sus pacientes y su administrador podrán entrar de nuevo.`, { ok: 'Activar', titulo: 'Activar negocio' });
      if (!ok) return;
      await conBoton(b, async () => { await api(`/api/super/negocios/${n.id}`, { method: 'PUT', body: { activo: !n.activo } }); toast(n.activo ? 'Negocio suspendido' : 'Negocio activado', 'ok'); boot(); });
    }
    if (b.dataset.a) formAdmin(lista.negocios.find((x) => x.id === b.dataset.a));
  });
}

function formNegocio() {
  const m = modal({
    titulo: 'Nuevo negocio',
    html: `<div class="field"><label for="n">Nombre del negocio</label><input id="n" type="text" maxlength="80" placeholder="Laboratorio Central"></div>
      <div class="field"><label for="s">Dirección</label><input id="s" type="text" maxlength="30" placeholder="labcentral" style="text-transform:lowercase"><span class="hint">Quedará como ${esc(dirNegocio('labcentral'))}. Solo minúsculas, números y guiones; no se puede repetir.</span></div>
      <div class="field"><label for="e">Correo del administrador</label><input id="e" type="email" autocomplete="off"></div>
      <div class="field"><label for="p">Contraseña inicial</label><input id="p" type="text" autocomplete="off" placeholder="Mínimo 8 caracteres"><span class="hint">Entrégasela al administrador; podrá cambiarla desde su panel.</span></div>`,
    acciones: [{ texto: 'Cancelar', onClick: (x) => x() }, {
      texto: 'Crear negocio', clase: 'btn-primary',
      onClick: async (cerrar, btn) => {
        await conBoton(btn, async () => {
          const r = await api('/api/super/negocios', { method: 'POST', body: { nombre: $('#n', m.el).value, slug: $('#s', m.el).value.trim().toLowerCase(), admin_email: $('#e', m.el).value, admin_password: $('#p', m.el).value } });
          cerrar(); toast(`Negocio creado: ${dirNegocio(r.slug)}`, 'ok'); boot();
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
