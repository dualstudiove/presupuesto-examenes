// Llamadas a la API del propio Worker, con los mismos acuerdos que crearServidor() en el servidor:
// JSON de ida y vuelta, cabecera x-app (protección CSRF), cookies del mismo sitio y errores con su mensaje.
//
//   const api = crearApi((ruta) => BASE + ruta);   // cómo convertir '/api/x' en la dirección real
//   const datos = await api('/api/x', { method: 'POST', body: { … } });
//
// Si falla, lanza un Error con el mensaje para el usuario y e.status (0 = sin conexión).

export function crearApi(resolver = (ruta) => ruta) {
  return async function api(path, { method = "GET", body } = {}) {
    const opt = { method, headers: { "x-app": "1" }, credentials: "same-origin" };
    if (body !== undefined) {
      opt.headers["content-type"] = "application/json";
      opt.body = JSON.stringify(body);
    }
    let r;
    try {
      r = await fetch(resolver(path), opt);
    } catch {
      const e = new Error(
        "No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo.",
      );
      e.status = 0;
      throw e;
    }
    const data = (r.headers.get("content-type") || "").includes("application/json")
      ? await r.json().catch(() => null)
      : null;
    if (!r.ok) {
      const e = new Error((data && data.error) || "Ocurrió un error. Inténtalo de nuevo.");
      e.status = r.status;
      throw e;
    }
    return data;
  };
}

/**
 * La ruta donde está montada la app ('/cotizalo', o '' en la raíz de su dominio), deducida de dónde se
 * sirve un archivo de la app: basePath(import.meta.url, 1) desde <base>/js/archivo.js → '/cotizalo'.
 * Así no se escribe a mano y sigue la variable BASE_PATH del servidor.
 */
export function basePath(urlArchivo, niveles = 1) {
  return new URL("../".repeat(niveles), urlArchivo).pathname.replace(/\/$/, "");
}
