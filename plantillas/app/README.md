# __TITULO__

__DESCRIPCION__

Vive en **dualstudio.app/__APP__** (Worker `__APP__`). Se creó con `npm run nueva-app` desde la plantilla del monorepo.

## Probar en local

```bash
cp .dev.vars.example .dev.vars
npm run dev        # http://localhost:8787/__APP__
npm test
```

## Estructura

| Carpeta | Qué va ahí |
|---|---|
| `src/server.js` | El Worker: `crearServidor()` de `@dualstudio/comun` y las páginas. |
| `src/rutas.js` | La API (`/api/...`). |
| `src/esquema.js` | Las tablas; la app las crea sola en una base vacía. |
| `src/env.js` | Variables propias de la app. |
| `public/` | Páginas, `css/tema.css` (tokens propios), `css/app.css` (componentes propios) y `js/`. |
| `test/` | Pruebas (`npm test`). |

Sistema de diseño: `packages/diseno/docs/DESIGN.md` y el catálogo en dualstudio.app/diseno.

## Publicar por primera vez

1. Base de datos: `npx wrangler d1 create __APP__` y pega el `database_id` en `wrangler.jsonc`. Para el sitio de pruebas, otra: `npx wrangler d1 create __APP__-pruebas` (bloque `previews`).
2. Secreto: `npx wrangler secret put SESSION_SECRET` (texto aleatorio de 32 caracteres o más). En el sitio de pruebas, como secreto de las vistas previas.
3. En Cloudflare → Workers → Crear → Importar un repositorio: este repositorio, **directorio raíz `apps/__APP__`**, comando de despliegue `npx wrangler deploy`, comando de vistas previas `npx wrangler versions upload`, rutas a vigilar `apps/__APP__/**` y `packages/**`.
4. En `apps/central/apps.json`, cambia el estado de la app a `"pruebas"` para que aparezca con enlace en dualstudio.app.
