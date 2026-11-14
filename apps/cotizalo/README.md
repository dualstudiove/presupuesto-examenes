# Cotízalo

Presupuestos de exámenes para laboratorios clínicos. Es una app multinegocio, con una ruta por laboratorio y tres papeles: paciente, administrador y superadministrador. Corre sobre **Cloudflare Workers + Hono + D1** y usa las librerías del monorepo (`@dualstudio/comun` y el sistema de diseño `packages/diseno`).

## Direcciones

| Dirección                                 | Qué es                                                                                                                         |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `dualstudio.app/cotizalo`                 | **Inicio de sesión único**: el superadministrador va a su panel; el administrador, a su negocio (si administra varios, elige). |
| `dualstudio.app/cotizalo/<negocio>`       | App del paciente de cada negocio.                                                                                              |
| `dualstudio.app/cotizalo/<negocio>/admin` | Administración del negocio.                                                                                                    |
| `dualstudio.app/cotizalo/super`           | Panel del superadministrador: crea y suspende negocios, gestiona credenciales y entra a cualquier negocio con «Abrir panel».   |

**El superadministrador puede con todo.** Con su propia sesión ve la app del paciente y el panel de administración de cualquier negocio, sin necesitar la contraseña del negocio. Eso incluye los negocios suspendidos, que nadie más ve. Dentro de un negocio aparece un aviso «Estás dentro de … como superadministrador» con un enlace para volver al panel general. Lo único que no hace ahí es cambiar la contraseña del administrador: eso se hace con «Credenciales» en el panel general.

**Nada de esto está escrito en el código.** La ruta sale de `BASE_PATH` en `wrangler.jsonc` (`"/cotizalo"`) y el dominio, de `routes`. El navegador deduce la ruta de dónde se sirven sus scripts. Para mudar la app a su propio dominio (p. ej. `cotizalo.com/<negocio>`), solo cambia `wrangler.jsonc`:

- `"BASE_PATH": ""` (también en `previews.vars`);
- `"routes": [{ "pattern": "cotizalo.com", "custom_domain": true }]`;
- `run_worker_first` sin el prefijo `/cotizalo`.

Después, cambia su línea en `apps/central/apps.json`.

## Estructura

| Carpeta                                         | Qué va ahí                                                                                                                                  |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/server.js`                                 | El Worker: `crearServidor()` de `@dualstudio/comun` más lo propio (negocio por ruta, páginas, tarea programada de la tasa BCV).             |
| `src/routes/`                                   | La API: `public.js` (paciente), `admin.js` (administración), `super.js` (plataforma), `acceso.js` (inicio de sesión único).                 |
| `src/negocio.js`, `bcv.js`, `dashboard.js`      | Negocios y presupuestos, tasa BCV, estadísticas.                                                                                            |
| `src/esquema.js`, `esquema-base.js`             | Las tablas (la app las crea sola en una base vacía) y sus columnas posteriores. `esquema-base.js` es copia de `migrations/0001_schema.sql`. |
| `src/env.js`, `util.js`                         | Variables y utilidades propias, sobre las comunes.                                                                                          |
| `src/seed.js`, `ejemplo.js`, `datos-ejemplo.js` | Datos iniciales y de ejemplo.                                                                                                               |
| `public/`                                       | Páginas, `css/tema.css` (tokens propios), `css/app.css` (componentes propios) y `js/`.                                                      |
| `test/`                                         | Pruebas contra un D1 simulado sobre `node:sqlite`.                                                                                          |

## Probar en local

```bash
# desde la raíz del monorepo
npm install
cp apps/cotizalo/.dev.vars.example apps/cotizalo/.dev.vars    # y cambia SESSION_SECRET
cd apps/cotizalo
npm run db:migrar:local                                       # crea las tablas
npm run seed:demo                                             # genera seed.sql (negocios de ejemplo)
npx wrangler d1 execute presupuesto --local --file=seed.sql
npm run dev        # http://localhost:8787/cotizalo/demo  ·  /cotizalo/demo/admin  ·  /cotizalo/super
```

Credenciales de ejemplo (solo en local): `admin@demo.test` / `Demo12345`, `admin@norte.test` / `Norte12345`, `super@plataforma.test` / `Super12345`.

## Recuperar el acceso del superadministrador (sin terminal)

1. Ve a Cloudflare → Workers y Pages → **cotizalo** → **Configuración** → **Variables y secretos** → **Agregar**.
2. Agrega dos secretos (tipo _Secreto_): `SUPER_EMAIL` con tu correo y `SUPER_PASSWORD` con una contraseña nueva de 8 caracteres o más.
3. Al guardar, Cloudflare publica la versión con esos secretos. En la próxima visita, la app crea ese superadministrador o, si el correo ya existía, le pone esa contraseña.
4. Entra en `dualstudio.app/cotizalo` con ese correo y esa contraseña.
5. **Borra los dos secretos.** Se aplican una sola vez, así que no volverán a cambiar la contraseña aunque la cambies en el panel. Aun así, no conviene dejarlos guardados. Mientras existan, «Tu cuenta» muestra un aviso.

Desde el panel general (tarjeta **Tu cuenta**) el superadministrador cambia su contraseña y puede **cerrar la sesión en los demás dispositivos**. Los administradores tienen lo mismo en Configuración → Seguridad.

## Publicar

La configuración de Cloudflare común a todas las apps está en el [README del monorepo](../../README.md#publicar-en-cloudflare): directorio raíz `apps/cotizalo`, comando de compilación y rutas a vigilar. También están ahí las protecciones del panel (límite de peticiones y Cloudflare Access).

- Lo que llega a `master` se publica en `dualstudio.app/cotizalo`.
- **Sitio de pruebas.** Se trabaja en la rama `desarrollo`. Cloudflare publica cada cambio como _vista previa_ (Configuración → Compilación → _Base de vistas previas_, comando `npx wrangler preview`) en `*-cotizalo.<cuenta>.workers.dev/cotizalo`, sin tocar `dualstudio.app`.
  - Usa **su propia base de datos** (`presupuesto-pruebas`, bloque `previews` de `wrangler.jsonc`) y nunca toca los datos reales. La app crea sola las tablas la primera vez.
  - Necesita en _Base de vistas previas_ → Variables y secretos tres **secretos**: `SESSION_SECRET` (texto al azar de 32 caracteres o más), `SUPER_EMAIL` y `SUPER_PASSWORD`.
  - En el panel general aparece **«Crear negocio de ejemplo»** (por `DATOS_DE_EJEMPLO = "true"` en `previews.vars`). Crea un laboratorio con catálogo, perfiles y un mes de presupuestos y visitas inventados, por pasos, para no pasar los límites de consultas por petición.
- Cuando todo esté bien, se une `desarrollo` en `master`.

Si una compilación falla con «The name in your wrangler.jsonc file (cotizalo) must match the name of your Worker», la conexión con GitHub quedó con un nombre viejo. En Configuración → Compilación, desconecta y vuelve a conectar el repositorio, y repite la configuración de compilación.

**Primera instalación desde cero** (con la terminal, desde `apps/cotizalo`):

1. `npx wrangler d1 create presupuesto` y pega el `database_id` en `wrangler.jsonc`.
2. `npm run db:migrar` (tablas en producción).
3. `SUPER_EMAIL=tu@correo SUPER_PASSWORD='una-clave-larga' npm run seed` y `npx wrangler d1 execute presupuesto --remote --file=seed.sql`. Sin `SUPER_PASSWORD` el seed se niega: no crea nunca la cuenta de ejemplo para una base real.
4. `npx wrangler secret put SESSION_SECRET` (texto aleatorio de 32 caracteres o más). Sin él la app no arranca y lo dice.
5. DNS (una sola vez): en Cloudflare → `dualstudio.app` → DNS, crea un registro **AAAA** con nombre `@`, contenido `100::` y **proxy activado**. Las `routes` de los Workers necesitan que el dominio pase por Cloudflare.
6. `npm run deploy`. Crea los negocios desde `/cotizalo/super`.

## Límites a tener en cuenta

- **D1 no tiene transacciones interactivas.** El código correlativo del presupuesto se calcula antes de guardarlo. Si dos personas generan a la vez, la restricción UNIQUE lo detecta y se reintenta (hasta 10 veces con espera aleatoria).
- **Protección contra abuso, en tres capas:**
  - el bloqueo por intentos y el límite por IP viven en la memoria de cada instancia (no son globales);
  - los **topes diarios por negocio** (5 000 visitas y 1 000 presupuestos, en `src/routes/public.js`) viven en la base y sí lo son;
  - la regla de límite de peticiones de Cloudflare (ver el README del monorepo) es la protección real.
- **Direcciones de los negocios.** Cada negocio está en `/<negocio>` y su API en `/<negocio>/api/...`. Por eso no se puede crear un negocio llamado `api`, `super`, `css`, `js`, `img`, `admin`… (ver `RESERVADOS` en `src/negocio.js`).
- **Cada negocio tiene su propia sesión.** La cookie del administrador se limita a `Path=/cotizalo/<negocio>`.
- **CPU en el plan gratuito (10 ms).** Si el inicio de sesión se pasa del límite, pon la variable `PBKDF2_ITER` (ver `packages/comun/README.md`). El inicio de sesión único revisa como mucho 5 cuentas por correo.

## Pruebas

`npm test -w cotizalo` (o `npm test` aquí). Usan Hono real y un D1 simulado sobre `node:sqlite`.
