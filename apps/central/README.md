# Central de Dual Studio

La página de **dualstudio.app**: el catálogo de apps y, en **dualstudio.app/diseno**, el catálogo vivo del sistema de diseño. Solo tiene archivos fijos (Worker `dualstudio` sin código de servidor), así que no gasta peticiones de Workers.

## Agregar o cambiar una app del catálogo

Edita `apps.json`: cada app es un bloque con `nombre`, `ruta` (`/nombre` o su dominio propio `https://…`), `descripcion`, `estado` (`publicada`, `pruebas` o `proximamente`), `icono` (de `packages/diseno/js/iconos.js`) y `color` (`cat-1`…`cat-5`). Al compilar, `construir.js` genera las tarjetas de `public/index.html`. Si un dato no es válido, la compilación se detiene y dice cuál es.

`npm run nueva-app` ya agrega la app nueva como «Próximamente». Cuando esté publicada, cambia su estado a `pruebas` o `publicada`.

## Probar en local

```bash
npm run dev -w central      # http://localhost:8788  ·  /diseno
```

## Archivos

| Archivo                          | Qué es                                                                                                                                         |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps.json`                      | El catálogo de apps.                                                                                                                           |
| `construir.js`                   | Genera las tarjetas y publica el catálogo del sistema de diseño.                                                                               |
| `public/index.html`, `404.html`  | Las páginas (las tarjetas van en la marca `<!-- APPS -->`).                                                                                    |
| `public/css/tema.css`, `app.css` | El tema y los componentes propios de la central, sobre el sistema de diseño padre.                                                             |
| `wrangler.jsonc`                 | Worker `dualstudio`, ruta `dualstudio.app/*`. Las apps tienen rutas más específicas en sus Workers y Cloudflare siempre usa la más específica. |
