// crearServidor(): todo lo que un Worker de Dual Studio hace igual en cualquier app.
//
//  • Monta la app bajo BASE_PATH (p. ej. /cotizalo): quita esa ruta antes de llegar a Hono, así que la app
//    trabaja como si estuviera en la raíz. Para mudarla a su dominio propio basta con BASE_PATH = "".
//  • Convierte las rutas declaradas en un Router (http.js) en rutas de Hono: JSON de entrada y salida,
//    protección CSRF con la cabecera x-app, sesión (opts.auth) y errores con su código.
//  • Sirve páginas HTML desde el binding ASSETS anteponiendo BASE_PATH a sus enlaces.
//  • Añade las cabeceras de seguridad a todo lo que sale del Worker.
//  • Si falta configuración (p. ej. SESSION_SECRET) lo dice, en vez del error genérico 1101 de Cloudflare.
import { Hono } from "hono";
import { env } from "./env.js";
import { bindD1 } from "./db.js";
import { rt } from "./runtime.js";
import { parseCookies } from "./auth.js";
import { HttpError, Raw } from "./http.js";
import { escHtml } from "./util.js";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

export function respJson(status, obj, cookies = []) {
  const h = new Headers(JSON_HEADERS);
  for (const c of cookies) h.append("set-cookie", c);
  return new Response(JSON.stringify(obj), { status, headers: h });
}

export function respHtml(status, html, cookies = []) {
  const h = new Headers({
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
  });
  for (const c of cookies) h.append("set-cookie", c);
  return new Response(html, { status, headers: h });
}

export const CSP =
  "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'";

/** Cabeceras de seguridad comunes. También se usan para generar el _headers de los archivos fijos. */
export const CABECERAS_SEGURIDAD = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "same-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Cross-Origin-Opener-Policy": "same-origin",
};

/** Copia mutable de la respuesta con las cabeceras de seguridad (las de ASSETS son inmutables). */
export function conSeguridad(res) {
  const r = new Response(res.body, res);
  for (const [k, v] of Object.entries(CABECERAS_SEGURIDAD)) r.headers.set(k, v);
  r.headers.set("Content-Security-Policy", CSP);
  if (env.cookieSecure) {
    r.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  return r;
}

// Detrás de Cloudflare la IP real llega en CF-Connecting-IP (Cloudflare la sobrescribe: el cliente no puede falsearla).
const clientIp = (h) =>
  h["cf-connecting-ip"] || String(h["x-forwarded-for"] || "").split(",")[0].trim() || "desconocida";

async function leerJson(req, max) {
  max = max || 400_000;
  const largo = Number(req.headers.get("content-length") || 0);
  if (largo > max) throw new HttpError(413, "La solicitud es demasiado grande.");
  const buf = await req.arrayBuffer();
  if (buf.byteLength > max) throw new HttpError(413, "La solicitud es demasiado grande.");
  if (!buf.byteLength) return {};
  if (!String(req.headers.get("content-type") || "").includes("application/json")) {
    throw new HttpError(415, "Formato no permitido.");
  }
  try {
    const v = JSON.parse(new TextDecoder().decode(buf));
    return v && typeof v === "object" ? v : {};
  } catch {
    throw new HttpError(400, "La solicitud no es válida.");
  }
}

/** Si falta configuración (p. ej. el secreto SESSION_SECRET), se dice cuál en vez del error genérico 1101 de Cloudflare. */
function faltaConfiguracion(e) {
  console.error("[config]", e?.message || e);
  const msg = escHtml(e?.message || "Error de configuración.");
  return new Response(
    `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Falta configuración</title></head><body style="font-family:system-ui,sans-serif;max-width:560px;margin:10vh auto;padding:0 16px;line-height:1.5"><h1 style="font-size:22px">La app no está configurada</h1><p>${msg}</p></body></html>`,
    {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    },
  );
}

/**
 * opciones:
 *  router          Router con las rutas de la API.
 *  configurar      (bindings) => configura env (lanza un Error si falta algo).
 *  asegurarEsquema (bindingD1) => Promise (de crearEsquema), opcional.
 *  alIniciar       async (c) => {} en cada petición, tras configurar y enlazar la base (opcional).
 *  rutaApi         (ruta) => patrón de Hono para esa ruta (por defecto, ruta.path).
 *  contexto        async (ctx, ruta) => {} completa ctx antes de la sesión (p. ej. el negocio de la ruta).
 *  paginas         (app, h) => {} registra las páginas; h trae asset, respHtml, paginaMensaje, noEncontrada…
 *  estaticos       carpetas de archivos fijos que el Worker sirve si una petición le llega (normalmente Cloudflare
 *                  los sirve sin pasar por él; ver run_worker_first en wrangler.jsonc).
 *  icono           ruta del ícono (para /favicon.ico).
 *  estilos         hojas de estilo de las páginas de mensaje (rutas dentro de la app).
 *  programado      async (bindings, ctx) => {} para el Cron Trigger (opcional).
 */
export function crearServidor({
  router,
  configurar,
  asegurarEsquema,
  alIniciar,
  rutaApi = (r) => r.path,
  contexto,
  paginas,
  estaticos = ["/css/*", "/js/*", "/img/*", "/_ds/*"],
  icono = "/img/favicon.svg",
  estilos = ["/_ds/diseno/diseno.css", "/css/tema.css", "/css/app.css"],
  programado,
}) {
  const app = new Hono();

  const paginaMensaje = (titulo, texto) => {
    const hojas = estilos.map((e) => `<link rel="stylesheet" href="${escHtml(env.basePath + e)}">`)
      .join("");
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${
      escHtml(titulo)
    }</title><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap">${hojas}</head><body class="mensaje"><main class="card centro"><h1>${
      escHtml(titulo)
    }</h1><p>${escHtml(texto)}</p></main></body></html>`;
  };
  const noEncontrada = () =>
    respHtml(404, paginaMensaje("No encontrado", "La página que buscas no existe."));

  // ── Middleware: configuración, base de datos, tarea en segundo plano, cabeceras ──
  app.use("*", async (c, next) => {
    configurar(c.env);
    if (c.env.DB) bindD1(c.env.DB);
    if (asegurarEsquema && c.env.DB) await asegurarEsquema(c.env.DB);
    if (alIniciar) await alIniciar(c);
    rt.waitUntil = (p) => {
      const q = Promise.resolve(p).catch(() => {});
      try {
        c.executionCtx.waitUntil(q);
      } catch { /* sin ExecutionContext (pruebas) */ }
    };
    await next();
    c.res = conSeguridad(c.res);
  });

  app.get("/healthz", () => new Response("ok", { headers: { "content-type": "text/plain" } }));

  // ── API: cada ruta registrada en el Router pasa por aquí ──
  async function atender(c, r) {
    const req = c.req.raw;
    const url = new URL(c.req.url);
    const headers = Object.fromEntries(req.headers);
    const ctx = {
      req: { headers },
      url,
      params: c.req.param(),
      ip: clientIp(headers),
      setCookies: [],
      query: Object.fromEntries(url.searchParams),
      cookies: parseCookies(headers.cookie),
      body: {},
    };
    if (contexto) await contexto(ctx, r);
    if (r.method !== "GET") {
      // Cabecera propia: un formulario de otro sitio no puede enviarla (requeriría CORS).
      if (!r.opts.noCsrf && headers["x-app"] !== "1") {
        throw new HttpError(403, "Solicitud no permitida.");
      }
      ctx.body = await leerJson(req, r.opts.maxBody); // opts.maxBody: bytes (por defecto 400 000)
    }
    if (r.opts.auth) ctx.usuario = await r.opts.auth(ctx);

    const out = await r.handler(ctx);
    if (out instanceof Raw) {
      const h = new Headers({
        "content-type": out.type,
        "cache-control": "no-store",
        ...out.headers,
      });
      for (const ck of ctx.setCookies) h.append("set-cookie", ck);
      return new Response(out.body, { status: 200, headers: h });
    }
    return respJson(200, out ?? { ok: true }, ctx.setCookies);
  }
  for (const r of router.routes) app.on(r.method, rutaApi(r), (c) => atender(c, r));

  // ── Archivos fijos y páginas (binding ASSETS) ──
  // herramientas/construir.js publica los archivos bajo BASE_PATH (/cotizalo/css/app.css), para que Cloudflare
  // sirva los fijos directamente, sin pasar por el Worker. Aquí `ruta` es relativa a la app ('/index.html').
  async function asset(c, ruta, { status = 200 } = {}) {
    if (!c.env.ASSETS) {
      throw new HttpError(500, "Falta el binding ASSETS (revisa wrangler.jsonc → assets).");
    }
    const u = new URL(c.req.url);
    u.pathname = env.basePath + ruta;
    u.search = "";
    const html = ruta.endsWith(".html");
    // Las páginas no se revalidan con ETag: se reescriben al servirlas (ver abajo).
    const r = await c.env.ASSETS.fetch(
      new Request(u, { method: "GET", headers: html ? {} : c.req.raw.headers }),
    );
    if (r.status === 404) return noEncontrada();
    const h = new Headers(r.headers);
    if (html) {
      // Los HTML enlazan sus archivos desde la raíz (href="/css/app.css"); se les antepone BASE_PATH.
      h.delete("etag");
      h.delete("content-length");
      h.set("cache-control", "no-cache");
      const texto = (await r.text()).replace(/(href|src)="\/(?!\/)/g, `$1="${env.basePath}/`);
      return new Response(texto, { status, headers: h });
    }
    h.set("cache-control", "no-cache"); // revalida con ETag: los cambios se ven al instante
    return new Response(r.status === 304 ? null : r.body, {
      status: r.status === 304 ? 304 : status,
      headers: h,
    });
  }

  for (const dir of estaticos) app.get(dir, (c) => asset(c, new URL(c.req.url).pathname));
  if (icono) app.get("/favicon.ico", (c) => asset(c, icono));

  const h = { asset, respHtml, respJson, paginaMensaje, noEncontrada };
  if (paginas) paginas(app, h);

  // ── Errores ──
  const esApi = (c) => /^\/(?:[^/]+\/)?api\//.test(new URL(c.req.url).pathname);
  app.notFound((c) => (esApi(c) ? respJson(404, { error: "No encontrado." }) : noEncontrada()));

  app.onError((e, c) => {
    const status = e instanceof HttpError ? e.status : 500;
    if (!(e instanceof HttpError)) console.error("[error]", c.req.method, c.req.url, e);
    const mensaje = e instanceof HttpError
      ? e.message
      : "Ocurrió un error inesperado. Intenta de nuevo.";
    if (esApi(c)) return respJson(status, { error: mensaje });
    return respHtml(status, paginaMensaje("Ups", mensaje));
  });

  /**
   * Monta la app bajo BASE_PATH: /cotizalo/demo/admin → Hono ve /demo/admin.
   * Lo que queda fuera de la base no es de esta app: la raíz del dominio redirige a la base
   * (útil en *.workers.dev; en dualstudio.app esas rutas las atiende la página central).
   */
  function fetch(request, bindings, ctx) {
    try {
      configurar(bindings);
    } catch (e) {
      return faltaConfiguracion(e);
    }
    const base = env.basePath;
    if (!base) return app.fetch(request, bindings, ctx);
    const url = new URL(request.url);
    const p = url.pathname;
    if (p === base || p.startsWith(`${base}/`)) {
      if (p === `${base}/`) {
        return new Response(null, { status: 301, headers: { location: base + url.search } });
      }
      url.pathname = p.slice(base.length) || "/";
      return app.fetch(new Request(url, request), bindings, ctx);
    }
    if (p === "/") return new Response(null, { status: 302, headers: { location: base } });
    return conSeguridad(
      respHtml(404, paginaMensaje("No encontrado", "La página que buscas no existe.")),
    );
  }

  async function scheduled(event, bindings, ctx) {
    if (!programado) return;
    configurar(bindings);
    if (bindings.DB) bindD1(bindings.DB);
    ctx.waitUntil(programado(bindings, ctx, event));
  }

  return { app, fetch, scheduled, h };
}
