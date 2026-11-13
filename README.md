# Presupuesto de exámenes · versión Cloudflare (Hono + D1)

**Cotízalo**: aplicación multi-negocio (una ruta por laboratorio; paciente / administrador / superadministrador) sobre **Cloudflare Workers + Hono + D1**.

## Direcciones

Hoy vive dentro de la central de apps de Dual Studio:

| Dirección | Qué es |
|---|---|
| `dualstudio.app` | Página central con las apps (carpeta `central/`, Worker aparte) |
| `dualstudio.app/cotizalo` | **Inicio de sesión único**: el superadministrador va a su panel; el administrador, a su negocio (si administra varios, elige) |
| `dualstudio.app/cotizalo/<negocio>` | App del paciente de cada negocio |
| `dualstudio.app/cotizalo/<negocio>/admin` | Administración del negocio |
| `dualstudio.app/cotizalo/super` | Panel del superadministrador: crea y suspende negocios, gestiona credenciales y entra a cualquier negocio con «Abrir panel» |

**El superadministrador puede con todo:** con su propia sesión ve la app del paciente y el panel de administración de cualquier negocio (también de los suspendidos, que nadie más ve), sin necesitar la contraseña del negocio. Dentro de un negocio aparece un aviso «Estás dentro de … como superadministrador» con un enlace para volver al panel general. Lo único que no hace ahí es cambiar la contraseña del administrador: eso se hace con «Credenciales» en el panel general.

**Nada de esto está escrito en el código.** La ruta sale de la variable `BASE_PATH` de `wrangler.jsonc` (`"/cotizalo"`) y el dominio, de `routes`. El navegador deduce la ruta de dónde se sirven sus scripts. Para mudar la app a su propio dominio (p. ej. `cotizalo.com/<negocio>`) solo se cambia `wrangler.jsonc`: `"BASE_PATH": ""` y `"routes": [{ "pattern": "cotizalo.com", "custom_domain": true }]`.

Las cookies de sesión quedan limitadas a `BASE_PATH` (y la del administrador a `BASE_PATH/<negocio>`), así que no se mezclan con otras apps del mismo dominio.

> **Estado:** la lógica se probó en Node con 26 pruebas (20 de API + 6 de D1/seed/contraseñas), pero **no se ejecutó en el entorno real de Cloudflare** (`wrangler dev` / despliegue) ni con el paquete `hono` real: el entorno donde se escribió no tenía acceso a npm. Las pruebas usan un D1 simulado sobre SQLite y un sustituto mínimo de Hono (si `hono` está instalado, `npm test` usa el real). Prueba primero con `wrangler dev` antes de publicar.

## Qué cambió respecto a la versión Node

| Archivo | Cambio |
|---|---|
| `src/server.js` | **Reescrito**: app Hono. Monta la app bajo `BASE_PATH`, resuelve el negocio por la ruta, convierte las rutas de `src/routes/*` en rutas de Hono, sirve páginas con el binding `ASSETS` y exporta `{ fetch, scheduled }`. |
| `src/seed.js` | **Reescrito**: D1 no se llena desde Node. Genera `seed.sql` (siembra sobre un SQLite temporal y lo vuelca); se carga con `wrangler d1 execute`. |
| `src/db.js` | Ahora es el adaptador **D1**. Sin transacciones interactivas: `db.tx` ejecuta las lecturas al momento y envía las escrituras juntas con `D1.batch()` (atómico). |
| `src/env.js` | Sin `process.env`/archivos: `configurarEnv(bindings)` en cada petición. |
| `src/auth.js` | Contraseñas con PBKDF2-SHA256 (WebCrypto, 100 000 iteraciones: el máximo en Workers). Los hashes `s1$` (scrypt) de la versión Node **no** sirven aquí. |
| `src/bcv.js` | Sin temporizadores: la tasa se actualiza con un **Cron Trigger** cada hora; las consultas en segundo plano usan `waitUntil`. |
| `src/http.js`, `src/util.js`, `src/negocio.js`, `src/routes/admin.js` | Ajustes menores (router neutral; reintento del código correlativo del presupuesto; consultas con ≤ 90 parámetros porque D1 admite 100). |
| `migrations/0001_schema.sql` | El esquema (antes `db/schema.sql`). |
| `src/db.local.js`, `test/` | Solo desarrollo: imitan D1 sobre `node:sqlite` para probar y generar el seed. No se despliegan. |

Eliminados: `src/db.pg.js` (PostgreSQL) y `.env.example` (ahora `wrangler.jsonc` y `.dev.vars`).

## Probar en local

```bash
npm install
cp .dev.vars.example .dev.vars              # y cambia SESSION_SECRET
npx wrangler d1 create presupuesto          # copia el database_id a wrangler.jsonc (en local sirve cualquier valor)
npm run db:migrar:local                     # crea las tablas
npm run seed:demo                           # genera seed.sql (negocios de ejemplo)
npx wrangler d1 execute presupuesto --local --file=seed.sql
npm run dev                                 # http://localhost:8787/cotizalo/demo  ·  /cotizalo/demo/admin  ·  /cotizalo/super
```

Credenciales de ejemplo: `admin@demo.test` / `Demo12345`, `admin@norte.test` / `Norte12345`, `super@plataforma.test` / `Super12345` (cámbialas con `SUPER_EMAIL`/`SUPER_PASSWORD` antes de `npm run seed`; no uses `seed:demo` en producción).

## Publicar

**Día a día:** Cloudflare está conectado a este repositorio (`dualstudiove/cotizalo`). Cada cambio que llega a la rama `master` se publica solo:

- Worker `cotizalo` (raíz del repo) → `dualstudio.app/cotizalo`
- Worker `dualstudio` (directorio raíz `central`) → `dualstudio.app`

Las rutas de `wrangler.jsonc` aparecen solas en Cloudflare → Worker → Dominios al publicar; no hace falta añadirlas a mano.

**Primera instalación desde cero** (con la terminal):

1. `npx wrangler d1 create presupuesto` → pega el `database_id` en `wrangler.jsonc`.
2. `npm run db:migrar` (tablas en producción).
3. `SUPER_EMAIL=tu@correo SUPER_PASSWORD='una-clave-larga' npm run seed` y `npx wrangler d1 execute presupuesto --remote --file=seed.sql` (crea solo el superadministrador).
4. Secretos: `npx wrangler secret put SESSION_SECRET` (texto aleatorio de 32+ caracteres) y, si lo usas, `CRON_SECRET`.
5. DNS (una sola vez): en Cloudflare → `dualstudio.app` → DNS, un registro **AAAA** con nombre `@`, contenido `100::` y **proxy activado** (nube naranja). Las `routes` de los Workers necesitan que el dominio pase por Cloudflare; ese registro no apunta a ningún servidor.
6. `npm run deploy` (Cotízalo, en `dualstudio.app/cotizalo`) y `npm run deploy:central` (la página central, en `dualstudio.app`). Crea los negocios desde `/cotizalo/super`.

El Worker se llama `cotizalo` y solo responde en `dualstudio.app/cotizalo` (`workers_dev: false`). Si cambias el nombre del Worker, Cloudflare crea uno nuevo: vuelve a cargar los secretos (`wrangler secret put …`) y borra el anterior.

**Otra app en la central** (p. ej. Planifica): su propio Worker con `routes` `dualstudio.app/planifica` y `dualstudio.app/planifica/*`, y una tarjeta más en `central/public/index.html`. Cloudflare siempre elige la ruta más específica, así que la central (`dualstudio.app/*`) no la tapa.

## Límites a tener en cuenta

- **D1 sin transacciones interactivas.** El código correlativo del presupuesto se calcula y, si dos personas generan a la vez, la restricción UNIQUE lo detecta y se reintenta (hasta 10 veces con espera aleatoria). Probado con 12 simultáneos.
- **Bloqueo por intentos fallidos y límites de peticiones** viven en la memoria de cada instancia del Worker, así que **no son globales**. Para protección real contra fuerza bruta añade una regla de *Rate Limiting* de Cloudflare sobre `/api/*/login`.
- **Direcciones de los negocios.** Dentro de `BASE_PATH`, cada negocio está en `/<negocio>` (pacientes) y `/<negocio>/admin` (administración); su API, en `/<negocio>/api/...`. La plataforma usa `/`, `/super` y `/api/super/...`. Por eso no se puede crear un negocio llamado `api`, `super`, `css`, `js`, `img`, `admin`… (ver `RESERVADOS` en `src/negocio.js`).
- **Un solo origen para todos los negocios.** La cookie de sesión del administrador se limita a `Path=/<negocio>`, así que cada negocio tiene su propia sesión. Los datos guardados en el navegador del paciente ya llevan el nombre del negocio en la clave.
- **Plan gratuito de Workers:** 10 ms de CPU por petición. PBKDF2 con 100 000 iteraciones puede superarlo en el login; usa el plan de pago (Workers Paid) o baja `ITER` en `src/auth.js` bajo tu criterio de seguridad.
- La descarga de CSV y el resto de funciones son las mismas que en la versión Node.

## Pruebas

`npm test` (26 pruebas). Sin `hono` instalado usa `test/hono-minimo.js`; con `npm install` usa Hono real.
