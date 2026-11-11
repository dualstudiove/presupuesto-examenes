import crypto from 'node:crypto';
import { env } from './env.js';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const uuid = () => crypto.randomUUID();
export const nowIso = () => new Date().toISOString();

/** Fecha local (huso configurado) de un instante: { dia:'YYYY-MM-DD', hora:0-23, dow:0-6 } */
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
export const esDia = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

export const placeholders = (arr) => arr.map(() => '?').join(',');

export const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
export const optStr = (v, max = 200) => str(v, max) || null;
export const entero = (v) => (Number.isInteger(v) ? v : typeof v === 'string' && /^-?\d+$/.test(v.trim()) ? Number(v) : null);
export const esColor = (s) => typeof s === 'string' && /^#[0-9a-fA-F]{6}$/.test(s);
export const esEmail = (s) => typeof s === 'string' && s.length <= 160 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

export function precioCent(v) {
  const n = entero(v);
  if (n === null || n < 0 || n > 100_000_000) throw new HttpError(400, 'El precio no es válido.');
  return n;
}

export function validarLogo(v) {
  if (v === null || v === '') return null;
  if (typeof v !== 'string' || !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(v) || v.length > 200_000) {
    throw new HttpError(400, 'El logo debe ser una imagen pequeña (se optimiza automáticamente al subirla).');
  }
  return v;
}

export function validarPassword(p) {
  if (typeof p !== 'string' || p.length < 8 || p.length > 200) {
    throw new HttpError(400, 'La contraseña debe tener al menos 8 caracteres.');
  }
  return p;
}

export function csv(filas, columnas) {
  const celda = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    // Evita que Excel interprete texto como fórmula.
    const seguro = /^[=+\-@]/.test(s) && Number.isNaN(Number(s)) ? `'${s}` : s;
    return /[;"\n\r]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro;
  };
  const lineas = [columnas.map((c) => celda(c.titulo)).join(';')];
  for (const f of filas) lineas.push(columnas.map((c) => celda(typeof c.valor === 'function' ? c.valor(f) : f[c.valor])).join(';'));
  return `﻿${lineas.join('\r\n')}\r\n`;
}
