# Presupuesto de exámenes · versión Cloudflare (Hono + D1)

Misma aplicación multi-negocio (subdominio por laboratorio, paciente / administrador / superadministrador), portada a **Cloudflare Workers + Hono + D1**.

> **Estado:** la lógica se probó en Node con 26 pruebas (20 de API + 6 de D1/seed/contraseñas), pero **no se ejecutó en el entorno real de Cloudflare** (`wrangler dev` / despliegue) ni con el paquete `hono` real: el entorno donde se escribió no tenía acceso a npm. Las pruebas usan un D1 simulado sobre SQLite y un sustituto mínimo de Hono (si `hono` está instalado, `npm test` usa el real). Prueba primero con `wrangler dev` antes de publicar.

## Qué cambió respecto a la versión Node

| Archivo | Cambio |
|---|---|
| `src/server.js` | **Reescrito**: app Hono. Resuelve el negocio por `Host`, convierte las rutas de `src/routes/*` en rutas de Hono, sirve páginas con el binding `ASSETS` y exporta `{ fetch, scheduled }`. |
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
npm run dev                                 # http://demo.localhost:8787  ·  /admin  ·  http://localhost:8787/super
```

Credenciales de ejemplo: `admin@demo.test` / `Demo12345`, `admin@norte.test` / `Norte12345`, `super@plataforma.test` / `Super12345` (cámbialas con `SUPER_EMAIL`/`SUPER_PASSWORD` antes de `npm run seed`; no uses `seed:demo` en producción).

## Publicar

1. `npx wrangler d1 create presupuesto` → pega el `database_id` en `wrangler.jsonc`.
2. `npm run db:migrar` (tablas en producción).
3. `SUPER_EMAIL=tu@correo SUPER_PASSWORD='una-clave-larga' npm run seed` y `npx wrangler d1 execute presupuesto --remote --file=seed.sql` (crea solo el superadministrador).
4. Secretos: `npx wrangler secret put SESSION_SECRET` (texto aleatorio de 32+ caracteres) y, si lo usas, `CRON_SECRET`.
5. En `wrangler.jsonc`: `BASE_DOMAIN="tudominio.com"`, `ENVIRONMENT="production"` y las dos `routes` (`tudominio.com/*` y `*.tudominio.com/*`). El dominio debe estar en Cloudflare, con un registro DNS `*` (proxied) para los subdominios.
6. `npm run deploy`. Crea los negocios desde `/super`.

## Límites a tener en cuenta

- **D1 sin transacciones interactivas.** El código correlativo del presupuesto se calcula y, si dos personas generan a la vez, la restricción UNIQUE lo detecta y se reintenta (hasta 10 veces con espera aleatoria). Probado con 12 simultáneos.
- **Bloqueo por intentos fallidos y límites de peticiones** viven en la memoria de cada instancia del Worker, así que **no son globales**. Para protección real contra fuerza bruta añade una regla de *Rate Limiting* de Cloudflare sobre `/api/*/login`.
- **Certificado comodín:** los subdominios de primer nivel (`lab.tudominio.com`) los cubre el certificado universal de Cloudflare.
- **Plan gratuito de Workers:** 10 ms de CPU por petición. PBKDF2 con 100 000 iteraciones puede superarlo en el login; usa el plan de pago (Workers Paid) o baja `ITER` en `src/auth.js` bajo tu criterio de seguridad.
- La descarga de CSV y el resto de funciones son las mismas que en la versión Node.

## Pruebas

`npm test` (26 pruebas). Sin `hono` instalado usa `test/hono-minimo.js`; con `npm install` usa Hono real.
