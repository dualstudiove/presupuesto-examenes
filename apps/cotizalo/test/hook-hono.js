export async function resolve(specifier, context, next) {
  if (specifier !== 'hono') return next(specifier, context);
  try {
    return await next(specifier, context);
  } catch (e) {
    if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e;
    return next(new URL('./hono-minimo.js', import.meta.url).href, context);
  }
}
