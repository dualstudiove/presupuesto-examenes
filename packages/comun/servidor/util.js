// Utilidades sin estado para cualquier app: identificadores, fechas en el huso de la app, validadores y CSV.
import { env } from "./env.js";
import { HttpError } from "./http.js";

export const uuid = () => globalThis.crypto.randomUUID();
export const nowIso = () => new Date().toISOString();

/** Fecha local (huso configurado en TZ_OFFSET_MIN) de un instante: { dia:'YYYY-MM-DD', hora:0-23, dow:0-6 } */
export function parteFecha(date = new Date()) {
  const d = new Date(date.getTime() + env.tzOffsetMin * 60000);
  return { dia: d.toISOString().slice(0, 10), hora: d.getUTCHours(), dow: d.getUTCDay() };
}
export const hoy = () => parteFecha().dia;
export function sumarDias(dia, n) {
  const d = new Date(`${dia}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export const esDia = (s) =>
  typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

/** '?,?,?' para una lista (D1 admite como máximo 100 parámetros por consulta). */
export const placeholders = (arr) => arr.map(() => "?").join(",");

export const str = (v, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
export const optStr = (v, max = 200) => str(v, max) || null;
export const entero = (
  v,
) => (Number.isInteger(v)
  ? v
  : typeof v === "string" && /^-?\d+$/.test(v.trim())
  ? Number(v)
  : null);
export const esColor = (s) => typeof s === "string" && /^#[0-9a-fA-F]{6}$/.test(s);
export const esEmail = (s) =>
  typeof s === "string" && s.length <= 160 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

export function validarPassword(p) {
  if (typeof p !== "string" || p.length < 8 || p.length > 200) {
    throw new HttpError(400, "La contraseña debe tener al menos 8 caracteres.");
  }
  return p;
}

/** Escapa texto para meterlo en HTML. */
export const escHtml = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]),
  );

/** CSV con «;» (Excel en español) y BOM. columnas: [{ titulo, valor: 'campo' | (fila) => valor }] */
export function csv(filas, columnas) {
  const celda = (v) => {
    const s = v === null || v === undefined ? "" : String(v);
    // Evita que Excel interprete texto como fórmula.
    const seguro = /^[=+\-@\t\r]/.test(s) && Number.isNaN(Number(s)) ? `'${s}` : s;
    return /[;"\n\r]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro;
  };
  const lineas = [columnas.map((c) => celda(c.titulo)).join(";")];
  for (const f of filas) {
    lineas.push(
      columnas.map((c) => celda(typeof c.valor === "function" ? c.valor(f) : f[c.valor])).join(";"),
    );
  }
  return `﻿${lineas.join("\r\n")}\r\n`;
}
