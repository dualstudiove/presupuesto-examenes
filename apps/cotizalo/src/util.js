// Utilidades de Cotízalo: las comunes (de @dualstudio/comun) más las propias de esta app.
import { entero, HttpError } from "@dualstudio/comun/servidor";

export {
  csv,
  entero,
  escHtml,
  esColor,
  esDia,
  esEmail,
  hoy,
  HttpError,
  nowIso,
  optStr,
  parteFecha,
  placeholders,
  str,
  sumarDias,
  uuid,
  validarPassword,
} from "@dualstudio/comun/servidor";

/** Precio en céntimos de REF. */
export function precioCent(v) {
  const n = entero(v);
  if (n === null || n < 0 || n > 100_000_000) throw new HttpError(400, "El precio no es válido.");
  return n;
}

export function validarLogo(v) {
  if (v === null || v === "") return null;
  if (
    typeof v !== "string" || !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(v) ||
    v.length > 200_000
  ) {
    throw new HttpError(
      400,
      "El logo debe ser una imagen pequeña (se optimiza automáticamente al subirla).",
    );
  }
  return v;
}
