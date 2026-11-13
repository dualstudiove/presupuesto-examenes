// Exportación del presupuesto: vista previa, texto, PDF (escrito a mano, sin librerías) e imagen PNG.
// Un único motor de maquetación (layoutDoc) alimenta el PDF y la imagen, así se ven iguales.
import { esc, fmtNum, fmtTasa, fmtFecha, ref, bs, diaLocal } from './common.js';

/** Arma el documento a exportar a partir de la respuesta del servidor + datos opcionales del paciente. */
export function buildDoc({ res, negocio, paciente = {} }) {
  const limpio = (v) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
  return {
    nombre: res.negocio.nombre,
    rif: res.negocio.rif || negocio.rif || null, // los presupuestos guardados antes del RIF lo toman de la config actual
    telefono: res.negocio.telefono,
    direccion: res.negocio.direccion,
    horario: res.negocio.horario,
    pie: res.negocio.pie,
    logo: negocio.logo || null,
    color: negocio.color || '#0e7c86',
    codigo: res.codigo,
    emision: res.dia,
    vigencia: res.vigencia_hasta,
    precios: res.precios_actualizados_en ? diaLocal(res.precios_actualizados_en) : null,
    paciente: {
      nombre: limpio(paciente.nombre), cedula: limpio(paciente.cedula), telefono: limpio(paciente.telefono), medico: limpio(paciente.medico),
    },
    // «Biopsia ×3»: la cantidad va en el nombre y el precio es el total de la línea (igual en pantalla, PDF, imagen y texto)
    items: res.items.map((it) => (it.cantidad > 1 ? { ...it, nombre: `${it.nombre} ×${it.cantidad}` } : it)),
    totalRef: res.total_ref_cent,
    totalBs: res.total_bs_cent,
    tasa: res.tasa,
  };
}

const NOTA = 'Los precios están expresados en REF (referencial). El monto en bolívares se calcula con la tasa indicada y puede variar según la tasa vigente al momento del pago.';

export const tasaTexto = (d) =>
  !d.tasa ? 'Tasa de cambio no disponible en este momento.'
    : d.tasa.manual ? `Tasa aplicada: ${fmtTasa(d.tasa.valor)} Bs. por REF`
      : `Tasa BCV: ${fmtTasa(d.tasa.valor)} Bs. por REF (${fmtFecha(d.tasa.fecha_valor)})`;

const datosPaciente = (d) => [['Paciente', d.paciente.nombre], ['C.I.', d.paciente.cedula], ['Teléfono', d.paciente.telefono], ['Médico referente', d.paciente.medico]].filter(([, v]) => v);
const contacto = (d) => [d.rif && `RIF ${d.rif}`, d.telefono && `Tel. ${d.telefono}`, d.direccion, d.horario].filter(Boolean);

// ─────────────────────────── Texto ───────────────────────────
export function toText(d) {
  const L = ['PRESUPUESTO DE EXÁMENES', d.nombre, ...contacto(d), '', `Código: ${d.codigo}`, `Fecha: ${fmtFecha(d.emision)}  ·  Válido hasta: ${fmtFecha(d.vigencia)}`];
  const pac = datosPaciente(d);
  if (pac.length) L.push('', ...pac.map(([k, v]) => `${k}: ${v}`));
  L.push('', 'EXÁMENES Y PERFILES');
  for (const it of d.items) {
    L.push(`- ${it.nombre}: ${ref(it.precio_cent)}`);
    if (it.incluye.length) L.push(`   Incluye: ${it.incluye.join(', ')}`);
  }
  L.push('', `TOTAL: ${ref(d.totalRef)}`);
  if (d.tasa) L.push(`TOTAL EN BOLÍVARES: ${bs(d.totalBs)}`);
  L.push(tasaTexto(d));
  if (d.precios) L.push(`Precios actualizados el ${fmtFecha(d.precios)}.`);
  if (d.pie) L.push('', d.pie);
  return L.join('\n');
}

// ─────────────────────────── Vista previa (HTML) ───────────────────────────
export function paperHTML(d) {
  const pac = datosPaciente(d);
  return `
  <div class="ph">
    ${d.logo ? `<img src="${esc(d.logo)}" alt="">` : ''}
    <div><h2>${esc(d.nombre)}</h2><div class="muted xs">${contacto(d).map(esc).join('<br>')}</div></div>
    <div class="code"><span class="xs muted">PRESUPUESTO</span><b>${esc(d.codigo)}</b></div>
  </div>
  <div class="meta2"><span>Emisión: <b>${fmtFecha(d.emision)}</b></span><span>Válido hasta: <b>${fmtFecha(d.vigencia)}</b></span>${d.precios ? `<span>Precios actualizados: <b>${fmtFecha(d.precios)}</b></span>` : ''}</div>
  ${pac.length ? `<div class="pac">${pac.map(([k, v]) => `<span class="nowrap"><b>${esc(k)}:</b> ${esc(v)}</span>`).join(' &nbsp;·&nbsp; ')}</div>` : ''}
  <table><thead><tr><th>Descripción</th><th style="text-align:right">Precio</th></tr></thead><tbody>
    ${d.items.map((it) => `<tr><td><b>${esc(it.nombre)}</b>${it.incluye.length ? `<span class="inc">Incluye: ${esc(it.incluye.join(', '))}</span>` : ''}</td><td class="p">${ref(it.precio_cent)}</td></tr>`).join('')}
  </tbody></table>
  <div class="tot">
    <div class="muted small">Total en REF</div><div class="big">${ref(d.totalRef)}</div>
    ${d.tasa ? `<div class="muted small" style="margin-top:8px">Total en bolívares</div><div class="big">${bs(d.totalBs)}</div>` : ''}
    <div class="muted xs" style="margin-top:6px">${esc(tasaTexto(d))}</div>
  </div>
  ${d.pie ? `<p class="small" style="margin-top:14px">${esc(d.pie)}</p>` : ''}
  <p class="note">${esc(NOTA)}</p>`;
}

// ─────────────────────────── Métricas Helvetica (AFM, en milésimas de em) ───────────────────────────
const WR = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015,
  667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611,
  278, 278, 278, 469, 556, 333,
  556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500,
  334, 260, 334, 584,
];
const WB = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975,
  722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611,
  333, 278, 333, 584, 556, 333,
  556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500,
  389, 280, 389, 584,
];

/** Deja solo caracteres Latin-1 (los que el PDF puede mostrar con la fuente estándar). */
function lat1(s) {
  return String(s ?? '').normalize('NFC').replace(/\s+/g, ' ')
    .replace(/[–—]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
    .replace(/…/g, '...').replace(/[•·]/g, '-')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '?');
}
function charW(ch, bold) {
  const t = bold ? WB : WR;
  const c = ch.charCodeAt(0);
  if (c >= 32 && c <= 126) return t[c - 32];
  const base = ch.normalize('NFD')[0];
  const b = base.charCodeAt(0);
  if (b >= 32 && b <= 126 && base !== ch) return t[b - 32];
  if (ch === '¿') return bold ? 611 : 556;
  if (ch === '¡') return 333;
  if (ch === '°') return 400;
  return 556;
}
const textW = (s, bold, size) => { let w = 0; for (const ch of s) w += charW(ch, bold); return (w * size) / 1000; };

function mezcla(a, b, t) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const m = (s) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return `#${[16, 8, 0].map((s) => m(s).toString(16).padStart(2, '0')).join('')}`;
}

// ─────────────────────────── Motor de maquetación ───────────────────────────
/**
 * Devuelve páginas de comandos de dibujo en unidades (pt). Origen arriba-izquierda.
 *  { t:'text', s, x, y(línea base), size, bold, color, align } · { t:'rect' } · { t:'line' } · { t:'img' }
 */
export function layoutDoc(d, { width, margin, pageH, measure }) {
  const iw = width - margin * 2;
  const C = { ink: '#0f2e36', muted: '#5b7580', line: '#d5e2e6', primary: d.color || '#0e7c86' };
  C.tint = mezcla(C.primary, '#ffffff', 0.9);
  const pages = [[]];
  let y = margin;
  const cur = () => pages[pages.length - 1];
  const salto = (h) => { if (pageH && y + h > pageH - margin) { pages.push([]); y = margin; } };
  const text = (s, x, size, { bold = false, color = C.ink, align = 'l' } = {}) => cur().push({ t: 'text', s, x, y: y + size * 0.95, size, bold, color, align });
  const rect = (x, yy, w, h, color) => cur().push({ t: 'rect', x, y: yy, w, h, color });
  const hline = (yy, color = C.line, w = 0.6) => cur().push({ t: 'line', x1: margin, y1: yy, x2: width - margin, y2: yy, color, w });
  const wrap = (s, size, bold, maxW) => {
    const out = [];
    for (const par of String(s).split('\n')) {
      let line = '';
      for (const w of par.split(/\s+/).filter(Boolean)) {
        const cand = line ? `${line} ${w}` : w;
        if (measure(cand, bold, size) <= maxW) { line = cand; continue; }
        if (line) out.push(line);
        let rest = w;
        while (measure(rest, bold, size) > maxW && rest.length > 1) {
          let k = rest.length;
          while (k > 1 && measure(rest.slice(0, k), bold, size) > maxW) k--;
          out.push(rest.slice(0, k));
          rest = rest.slice(k);
        }
        line = rest;
      }
      out.push(line);
    }
    return out;
  };

  // Encabezado: logo + negocio a la izquierda, código a la derecha
  const top = y;
  const rx = width - margin;
  const logo = d._logo;
  const logoH = 44;
  const logoW = logo ? Math.min(90, (logo.w / logo.h) * logoH) : 0;
  text('PRESUPUESTO', rx, 8.5, { bold: true, color: C.primary, align: 'r' });
  y = top + 12;
  text(d.codigo, rx, 15, { bold: true, align: 'r' });
  y = top;
  let x0 = margin;
  if (logo) { cur().push({ t: 'img', x: margin, y: top, w: logoW, h: logoH }); x0 = margin + logoW + 10; }
  const leftW = rx - x0 - 130;
  for (const l of wrap(d.nombre, 17, true, leftW)) { text(l, x0, 17, { bold: true }); y += 20; }
  for (const c of contacto(d)) for (const l of wrap(c, 8.5, false, leftW)) { text(l, x0, 8.5, { color: C.muted }); y += 11.5; }
  y = Math.max(y, top + logoH) + 8;
  rect(margin, y, iw, 2.4, C.primary);
  y += 14;

  text(`Emisión: ${fmtFecha(d.emision)}     ·     Válido hasta: ${fmtFecha(d.vigencia)}${d.precios ? `     ·     Precios actualizados el ${fmtFecha(d.precios)}` : ''}`, margin, 8.8, { color: C.muted });
  y += 20;

  const pac = datosPaciente(d);
  if (pac.length) {
    const lines = wrap(pac.map(([k, v]) => `${k}: ${v}`).join('     ·     '), 10, false, iw - 20);
    const h = lines.length * 14 + 14;
    salto(h + 10);
    rect(margin, y, iw, h, C.tint);
    y += 7;
    for (const l of lines) { text(l, margin + 10, 10); y += 14; }
    y += 14;
  }

  // Tabla
  salto(70);
  rect(margin, y, iw, 22, C.tint);
  y += 6;
  text('DESCRIPCIÓN', margin + 8, 8.3, { bold: true, color: C.muted });
  text('PRECIO', rx - 8, 8.3, { bold: true, color: C.muted, align: 'r' });
  y += 16;
  const priceW = 100;
  const nameW = iw - priceW - 16;
  for (const it of d.items) {
    const nl = wrap(it.nombre, 11, true, nameW);
    const inc = it.incluye.length ? wrap(`Incluye: ${it.incluye.join(', ')}`, 8.6, false, nameW) : [];
    const h = nl.length * 14 + inc.length * 11.2 + 13;
    salto(h);
    y += 6;
    text(ref(it.precio_cent), rx - 8, 11, { bold: true, align: 'r' });
    for (const l of nl) { text(l, margin + 8, 11, { bold: true }); y += 14; }
    for (const l of inc) { text(l, margin + 8, 8.6, { color: C.muted }); y += 11.2; }
    y += 7;
    hline(y);
  }

  // Totales
  const bw = 262;
  const bx = rx - bw;
  const tasaLines = wrap(tasaTexto(d), 8.4, false, bw - 20);
  const bh = 16 + 30 + (d.tasa ? 30 : 18) + tasaLines.length * 11 + 8;
  y += 14;
  salto(bh + 70);
  rect(bx, y, bw, bh, C.tint);
  y += 10;
  text('Total en REF', bx + 10, 9.5, { color: C.muted });
  text(ref(d.totalRef), rx - 10, 15, { bold: true, align: 'r' });
  y += 30;
  if (d.tasa) {
    text('Total en bolívares', bx + 10, 9.5, { color: C.muted });
    text(bs(d.totalBs), rx - 10, 15, { bold: true, align: 'r' });
    y += 30;
  } else y += 4;
  for (const l of tasaLines) { text(l, bx + 10, 8.4, { color: C.muted }); y += 11; }
  y += 22;

  if (d.pie) for (const l of wrap(d.pie, 9.2, false, iw)) { salto(14); text(l, margin, 9.2); y += 12.5; }
  y += 8;
  for (const l of wrap(NOTA, 8, false, iw)) { salto(12); text(l, margin, 8, { color: C.muted }); y += 11; }

  return { pages, alto: y + margin };
}

// ─────────────────────────── Logo ───────────────────────────
async function prepararLogo(d) {
  if (d._logo !== undefined) return;
  d._logo = null;
  if (!d.logo || !d.logo.startsWith('data:image/jpeg;base64,')) return;
  try {
    const img = new Image();
    img.src = d.logo;
    await img.decode();
    const bin = atob(d.logo.split(',')[1]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    d._logo = { img, w: img.naturalWidth, h: img.naturalHeight, bytes };
  } catch { d._logo = null; }
}

// ─────────────────────────── PDF ───────────────────────────
const bytesLatin1 = (s) => { const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 255; return u; };

export async function toPdfBlob(d) {
  await prepararLogo(d);
  const W = 595.28;
  const H = 841.89;
  const { pages } = layoutDoc(d, { width: W, margin: 42, pageH: H, measure: (s, b, z) => textW(lat1(s), b, z) });
  const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => (v / 255).toFixed(3)).join(' '); };
  const pesc = (s) => s.replace(/[\\()]/g, '\\$&');
  const f = (n) => n.toFixed(2);

  const contenidos = pages.map((cmds) => {
    let c = '';
    for (const m of cmds) {
      if (m.t === 'rect') c += `${rgb(m.color)} rg ${f(m.x)} ${f(H - m.y - m.h)} ${f(m.w)} ${f(m.h)} re f\n`;
      else if (m.t === 'line') c += `${rgb(m.color)} RG ${m.w} w ${f(m.x1)} ${f(H - m.y1)} m ${f(m.x2)} ${f(H - m.y2)} l S\n`;
      else if (m.t === 'img') c += `q ${f(m.w)} 0 0 ${f(m.h)} ${f(m.x)} ${f(H - m.y - m.h)} cm /Im1 Do Q\n`;
      else {
        const s = lat1(m.s);
        const w = textW(s, m.bold, m.size);
        const x = m.align === 'r' ? m.x - w : m.x;
        c += `${rgb(m.color)} rg BT /${m.bold ? 'F2' : 'F1'} ${m.size} Tf ${f(x)} ${f(H - m.y)} Td (${pesc(s)}) Tj ET\n`;
      }
    }
    return c;
  });

  const logo = d._logo;
  const primera = logo ? 6 : 5;
  const objs = [];
  objs[1] = ['<< /Type /Catalog /Pages 2 0 R >>'];
  objs[2] = [`<< /Type /Pages /Kids [${pages.map((_, i) => `${primera + 2 * i} 0 R`).join(' ')}] /Count ${pages.length} >>`];
  objs[3] = ['<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'];
  objs[4] = ['<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'];
  if (logo) {
    objs[5] = [`<< /Type /XObject /Subtype /Image /Width ${logo.w} /Height ${logo.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${logo.bytes.length} >>\nstream\n`, logo.bytes, '\nendstream'];
  }
  pages.forEach((_, i) => {
    const pn = primera + 2 * i;
    const cb = bytesLatin1(contenidos[i]);
    objs[pn] = [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >>${logo ? ' /XObject << /Im1 5 0 R >>' : ''} >> /Contents ${pn + 1} 0 R >>`];
    objs[pn + 1] = [`<< /Length ${cb.length} >>\nstream\n`, cb, '\nendstream'];
  });

  const out = [];
  let pos = 0;
  const add = (p) => { const u = typeof p === 'string' ? bytesLatin1(p) : p; out.push(u); pos += u.length; };
  add('%PDF-1.4\n%âãÏÓ\n');
  const offs = [];
  for (let n = 1; n < objs.length; n++) {
    offs[n] = pos;
    add(`${n} 0 obj\n`);
    objs[n].forEach(add);
    add('\nendobj\n');
  }
  const xref = pos;
  add(`xref\n0 ${objs.length}\n0000000000 65535 f \n`);
  for (let n = 1; n < objs.length; n++) add(`${String(offs[n]).padStart(10, '0')} 00000 n \n`);
  add(`trailer\n<< /Size ${objs.length} /Root 1 0 R /Info << /Title (${pesc(lat1(`Presupuesto ${d.codigo}`))}) >> >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(out, { type: 'application/pdf' });
}

// ─────────────────────────── Imagen PNG ───────────────────────────
export async function toPngBlob(d) {
  await prepararLogo(d);
  const S = 2.4;
  const W = 595;
  const fam = '"Helvetica Neue", Helvetica, Arial, "Segoe UI", system-ui, sans-serif';
  const font = (b, z) => `${b ? 700 : 400} ${z * S}px ${fam}`;
  const mctx = document.createElement('canvas').getContext('2d');
  const measure = (s, b, z) => { mctx.font = font(b, z); return mctx.measureText(s).width / S; };
  const { pages, alto } = layoutDoc(d, { width: W, margin: 36, pageH: 0, measure });
  const c = document.createElement('canvas');
  c.width = Math.round(W * S);
  c.height = Math.round(alto * S);
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, c.width, c.height);
  g.textBaseline = 'alphabetic';
  for (const m of pages[0]) {
    if (m.t === 'rect') { g.fillStyle = m.color; g.fillRect(m.x * S, m.y * S, m.w * S, m.h * S); }
    else if (m.t === 'line') { g.strokeStyle = m.color; g.lineWidth = m.w * S; g.beginPath(); g.moveTo(m.x1 * S, m.y1 * S); g.lineTo(m.x2 * S, m.y2 * S); g.stroke(); }
    else if (m.t === 'img') g.drawImage(d._logo.img, m.x * S, m.y * S, m.w * S, m.h * S);
    else { g.font = font(m.bold, m.size); g.fillStyle = m.color; g.textAlign = m.align === 'r' ? 'right' : 'left'; g.fillText(m.s, m.x * S, m.y * S); }
  }
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo crear la imagen.'))), 'image/png'));
}

// ─────────────────────────── Descargar / compartir / copiar ───────────────────────────
export function descargar(blob, nombre) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export const puedeCompartir = () => typeof navigator.share === 'function';

/** Abre el menú de compartir del teléfono (con el archivo si el sistema lo permite, o con el texto). */
export async function compartir({ blob, nombre, titulo, texto }) {
  if (blob) {
    const file = new File([blob], nombre, { type: blob.type });
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: titulo }); return true; }
  }
  await navigator.share({ title: titulo, text: texto });
  return true;
}

export async function copiarTexto(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = texto;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

void fmtNum;
