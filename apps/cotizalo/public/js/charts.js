// Gráficos sencillos hechos a mano (SVG/HTML), sin librerías.
import { esc, fmtFecha } from "./common.js";

const bonito = (m) => {
  if (m <= 4) return 4;
  const p = 10 ** Math.floor(Math.log10(m));
  const f = m / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
};

/** Barras = presupuestos por día; línea = visitas. */
export function graficoDias(rows) {
  if (!rows.length) return "";
  const W = 720;
  const H = 230;
  const L = 34;
  const R = 8;
  const T = 12;
  const B = 28;
  const iw = W - L - R;
  const ih = H - T - B;
  const max = bonito(Math.max(1, ...rows.map((r) => Math.max(r.presupuestos, r.visitas))));
  const step = iw / rows.length;
  const bw = Math.max(2, Math.min(24, step * 0.62));
  const y = (v) => T + ih - (v / max) * ih;
  let g = "";
  for (let i = 0; i <= 4; i++) {
    const v = (max * i) / 4;
    g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${
      y(v)
    }" style="stroke:var(--line-2)"/><text x="${L - 6}" y="${y(v) + 3}" text-anchor="end">${
      Math.round(v)
    }</text>`;
  }
  const barras = rows.map((r, i) => {
    const x = L + step * i + (step - bw) / 2;
    const h = (r.presupuestos / max) * ih;
    return `<rect x="${x.toFixed(1)}" y="${(T + ih - h).toFixed(1)}" width="${
      bw.toFixed(1)
    }" height="${Math.max(h, 0).toFixed(1)}" rx="2" style="fill:var(--accent)"><title>${
      fmtFecha(r.dia)
    }: ${r.presupuestos} presupuesto(s), ${r.visitas} visita(s)</title></rect>`;
  }).join("");
  const linea = rows.map((r, i) =>
    `${(L + step * i + step / 2).toFixed(1)},${y(r.visitas).toFixed(1)}`
  ).join(" ");
  const cada = Math.ceil(rows.length / 8);
  const ejes = rows.map((
    r,
    i,
  ) => (i % cada === 0
    ? `<text x="${(L + step * i + step / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle">${
      fmtFecha(r.dia).slice(0, 5)
    }</text>`
    : "")
  ).join("");
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Presupuestos y visitas por día">${g}${barras}<polyline points="${linea}" fill="none" style="stroke:var(--ink-3)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>${ejes}</svg>
    <div class="legend"><span><i style="background:var(--accent)"></i>Presupuestos</span><span><i style="background:var(--ink-3)"></i>Visitas</span></div></div>`;
}

/** Lista de barras horizontales. */
export function barras(rows, { nombre = "nombre", valor, sub, fmt = (v) => v }) {
  if (!rows.length) return '<p class="muted small">Todavía no hay datos en este período.</p>';
  const max = Math.max(...rows.map(valor), 1);
  return `<div class="bars">${
    rows.map((r) =>
      `<div class="br"><span class="nm" title="${esc(r[nombre])}">${
        esc(r[nombre])
      }</span><span class="vl">${fmt(valor(r), r)}</span>
    <div class="tr"><i style="width:${(valor(r) / max) * 100}%"></i></div>${
        sub ? `<span class="sub">${esc(sub(r))}</span>` : ""
      }</div>`
    ).join("")
  }</div>`;
}

/** Mapa de calor por hora del día. */
export function calor(horas) {
  const v = horas.map((h) => h.visitas + h.presupuestos);
  const max = Math.max(...v, 1);
  const celdas = v.map((n, i) =>
    `<div style="--a:${(0.06 + (n / max) * 0.84).toFixed(2)}" title="${
      String(i).padStart(2, "0")
    }:00 – ${n} acción(es)"></div>`
  ).join("");
  const etq = v.map((_, i) => `<span>${i % 3 === 0 ? i : ""}</span>`).join("");
  const mejor = v.indexOf(max);
  return `<div class="heat" role="img" aria-label="Actividad por hora">${celdas}</div><div class="heatlbl">${etq}</div>
    <p class="muted small" style="margin-top:8px">${
    max > 1 || v[mejor] > 0
      ? `Mayor actividad alrededor de las <b>${String(mejor).padStart(2, "0")}:00</b>.`
      : "Sin actividad en este período."
  } Hora de Venezuela.</p>`;
}

const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
export function semana(dias) {
  const v = dias.map((d) => d.visitas + d.presupuestos);
  const max = Math.max(...v, 1);
  return `<div class="wk" role="img" aria-label="Actividad por día de la semana">${
    v.map((n, i) =>
      `<div title="${DIAS[i]}: ${n}"><span>${n}</span><i style="height:${
        Math.max(2, (n / max) * 78)
      }px"></i><span>${DIAS[i]}</span></div>`
    ).join("")
  }</div>`;
}

/** Reparto móvil / escritorio. */
export function reparto(a, b, etA = "Móvil", etB = "Escritorio") {
  const t = a + b;
  if (!t) return '<p class="muted small">Sin datos.</p>';
  const pa = Math.round((a / t) * 100);
  return `<div class="seg2"><i style="width:${pa}%;background:var(--accent)"></i><i style="width:${
    100 - pa
  }%;background:var(--ink-3)"></i></div>
    <div class="legend"><span><i style="background:var(--accent)"></i>${etA} ${pa}% (${a})</span><span><i style="background:var(--ink-3)"></i>${etB} ${
    100 - pa
  }% (${b})</span></div>`;
}
