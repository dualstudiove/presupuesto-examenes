# Dual Studio Apps

Monorepo de las apps de **dualstudio.app**. Cada app vive en su carpeta, se levanta sola y se publica como su propio Worker de Cloudflare. Todas comparten un **sistema de diseño padre** y una **librería de lógica común**.

```
/
├─ apps/
│  ├─ central/        dualstudio.app            (Worker «dualstudio», solo archivos fijos)
│  └─ cotizalo/       dualstudio.app/cotizalo   (Worker «cotizalo» + D1)
├─ packages/
│  ├─ diseno/         @dualstudio/diseno: sistema de diseño padre (tokens, base, componentes, íconos)
│  └─ comun/          @dualstudio/comun: servidor (Workers + Hono + D1) y utilidades del navegador
├─ plantillas/app/    esqueleto de una app nueva (lo usa `npm run nueva-app`)
├─ herramientas/      construir.js (prepara lo que publica cada app) y nueva-app.js
└─ package.json       workspaces de npm y atajos
```

| Carpeta | Qué es | Documentación |
|---|---|---|
| `apps/central` | Página central con el catálogo de apps (sale de `apps.json`) y el catálogo del sistema de diseño en `/diseno`. | [README](apps/central/README.md) |
| `apps/cotizalo` | Cotízalo: presupuestos de exámenes para laboratorios (multinegocio). | [README](apps/cotizalo/README.md) |
| `packages/diseno` | El padre visual. Cada app solo ajusta tokens en su `tema.css` y agrega lo suyo en `app.css`. | [DESIGN.md](packages/diseno/docs/DESIGN.md) |
| `packages/comun` | `crearServidor()`, base de datos, sesiones, contraseñas, esquema, topes diarios y utilidades del navegador. | [README](packages/comun/README.md) |

## Comandos (desde la raíz)

```bash
npm install                 # una vez: instala todo y enlaza las librerías
npm test                    # pruebas de las librerías, las apps y las herramientas
npm run dev:cotizalo        # http://localhost:8787/cotizalo   (ver apps/cotizalo/README.md)
npm run dev:central         # http://localhost:8788
npm run nueva-app -- planifica --titulo "Planifica" --descripcion "…" --icono calendar --color cat-5
```

Cualquier comando de una app también funciona con `-w <app>` (p. ej. `npm run seed:demo -w cotizalo`) o desde su carpeta.

## Cómo encaja todo

- **Servidor.** Cada app crea su Worker con `crearServidor()` de `@dualstudio/comun/servidor`. La librería monta la app bajo su ruta (`BASE_PATH`), atiende la API (JSON, protección CSRF, sesión y errores), sirve las páginas y pone las cabeceras de seguridad. La app solo aporta sus rutas, sus páginas y sus tablas. Wrangler empaqueta la librería al publicar.
- **Navegador.** Antes de `wrangler dev` y `wrangler deploy`, `herramientas/construir.js` arma `apps/<app>/.publicar/` (no se sube a Git). Ahí van los archivos de `public/`, el sistema de diseño en `/_ds/diseno/` y las utilidades en `/_ds/comun/web/`, todo bajo `BASE_PATH`.
- **Archivos fijos sin Worker.** CSS, JS e imágenes los sirve Cloudflare directamente (`run_worker_first` en el `wrangler.jsonc` de cada app), con sus cabeceras en `_headers`. Esto es gratis y no tiene límite. Solo las páginas y la API pasan por el Worker: una visita de paciente en Cotízalo gasta 4 peticiones en vez de 8.
- **Diseño padre → hijos.** El orden de las capas CSS es fijo: `diseno.tokens → diseno.base → diseno.componentes → app.tema → app`. Las reglas están en [DESIGN.md](packages/diseno/docs/DESIGN.md) y las comprueban las pruebas de `packages/diseno`.
- **Dominio propio.** Para mudar una app basta con su `wrangler.jsonc`: `BASE_PATH: ""`, `routes` con su dominio, las rutas de `run_worker_first` sin el prefijo y su línea en `apps/central/apps.json`.

## Una app nueva

```bash
npm run nueva-app -- planifica --titulo "Planifica" --descripcion "Planificación de …" --icono calendar --color cat-5
npm install
cp apps/planifica/.dev.vars.example apps/planifica/.dev.vars
npm run dev -w planifica        # http://localhost:8787/planifica
```

Crea `apps/planifica` funcionando: Worker, ruta `dualstudio.app/planifica`, base D1 (real y de pruebas), acento propio, página de inicio y pruebas. También la agrega a la central como «Próximamente». Con `--sin-base`, la app no usa D1. Para publicarla, sigue el `README.md` que se genera dentro de la app.

## Publicar en Cloudflare

Cloudflare está conectado a este repositorio. Cada Worker compila **su** carpeta: lo que llega a `master` se publica en dualstudio.app, y lo que llega a `desarrollo`, en el sitio de pruebas de cada app.

### Configuración de cada Worker (Configuración → Compilación)

| Worker | Directorio raíz | Comando de compilación | Rutas a vigilar (incluir) |
|---|---|---|---|
| `cotizalo` | `apps/cotizalo` | `cd ../.. && npm ci` | `apps/cotizalo/*`, `packages/*`, `herramientas/*`, `package-lock.json` |
| `dualstudio` (central) | `apps/central` | `cd ../.. && npm ci` | `apps/central/*`, `packages/diseno/*`, `herramientas/*`, `package-lock.json` |
| cada app nueva | `apps/<app>` | `cd ../.. && npm ci` | `apps/<app>/*`, `packages/*`, `herramientas/*`, `package-lock.json` |

- El **comando de despliegue** sigue igual (`npx wrangler deploy`), y también el de **vistas previas**. Wrangler ejecuta solo `npm run construir` antes de publicar (bloque `build` del `wrangler.jsonc`).
- El comando de compilación instala las librerías del monorepo desde la raíz. Sin él, la compilación falla con «Cannot find module '@dualstudio/comun'».
- Gracias a las rutas a vigilar, un cambio en Cotízalo no recompila la central ni las otras apps. Un cambio en el sistema de diseño sí las recompila todas, y es lo correcto. En el plan gratuito hay 3 000 minutos de compilación al mes.

**Al pasar a este monorepo (una sola vez):** cambia el directorio raíz de los dos Workers existentes como dice la tabla. Antes era `/` para `cotizalo` y `central` para `dualstudio`. Los nombres de los Workers no cambian, así que los secretos, las bases de datos y los dominios se quedan como están. Pruébalo primero con la rama `desarrollo` (sitio de pruebas) y después pásalo a `master`.

### Protecciones del panel de Cloudflare (gratis, sin código)

1. **Límite de peticiones (lo más importante).** Ve a dualstudio.app → Seguridad → WAF → Reglas de limitación de velocidad y crea una regla:
   - Expresión: `(http.request.method eq "POST" and http.request.uri.path contains "/api/")`
   - Por IP, más de 20 peticiones en 10 segundos.
   - Acción: bloquear 10 segundos.

   Una sola regla cubre los inicios de sesión y las rutas públicas de **todas** las apps. Los límites en memoria del Worker no son globales; esta regla sí lo es. Los topes diarios en la base (visitas y presupuestos por negocio) son la segunda barrera.
2. **Cloudflare Access para el superadministrador.** Ve a Zero Trust → Access → Aplicaciones → Self-hosted y crea una aplicación con estas rutas:
   - `dualstudio.app/cotizalo/super`
   - `dualstudio.app/cotizalo/api/super/*`

   Como política, permite solo tu correo (código por correo). Así, antes de llegar al panel hay un segundo factor. Ten en cuenta que entrar a un negocio como superadministrador usa la misma sesión. Si sospechas que alguien la tiene, usa «Cerrar sesión en los demás dispositivos» en «Tu cuenta».
3. **Cloudflare Access para los sitios de pruebas.** En cada Worker, ve a Configuración → Dominios y rutas → URL de vista previa y activa Cloudflare Access. Así solo tú y tu equipo pueden entrar a los `*.workers.dev` de prueba.
4. **Turnstile (pendiente, solo si hace falta).** Si aparece abuso al generar presupuestos a pesar de los topes, se puede añadir Turnstile (el «no soy un robot» de Cloudflare, gratis) a ese paso. Requiere crear las claves en el panel; avísame cuando haga falta.

## Plan gratuito de Cloudflare

Los límites son de toda la cuenta, no de cada app.

| Límite | Qué se hace |
|---|---|
| 100 000 peticiones a Workers al día | Los archivos fijos no pasan por el Worker, la central no tiene Worker, y la regla de límite y los topes diarios frenan el abuso. |
| Bases D1 por cuenta | Cada app con datos usa 2 (real y de pruebas). Si una app no necesita base de datos, se crea con `--sin-base`. |
| Tareas programadas (cron) | Cotízalo usa 1 (tasa BCV). |
| 10 ms de CPU por petición | El cifrado de contraseñas se puede bajar con la variable `PBKDF2_ITER` si el inicio de sesión se pasa del límite (ver `packages/comun/README.md`). |
| 3 000 minutos de compilación al mes | Rutas a vigilar por app. |

## Pruebas

`npm test` desde la raíz ejecuta las pruebas de cada parte:

| Parte | Qué cubre |
|---|---|
| `packages/comun` | Configuración, contraseñas, sesiones, esquema, topes diarios y `crearServidor()`. |
| `packages/diseno` | Las reglas del sistema de diseño, comprobadas en todas las apps. |
| `apps/cotizalo` | La app completa contra un D1 simulado. |
| `herramientas` | La compilación, el catálogo de la central y `nueva-app`. |
