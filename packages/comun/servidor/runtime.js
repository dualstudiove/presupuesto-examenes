// Puente con el ciclo de vida de la petición: en Workers, el trabajo "en segundo plano" debe
// registrarse con executionCtx.waitUntil o se cancela al enviar la respuesta.
export const rt = {
  waitUntil: (p) => {
    Promise.resolve(p).catch(() => {});
  },
};
