# Presupuesto de exámenes

Calculadora de presupuestos para laboratorios clínicos y clínicas. Aplicación **multi-negocio** (marca blanca): una sola instalación atiende a muchos negocios, cada uno en su propio **subdominio** (`labcentral.tudominio.com`), con su nombre, logo y color.

- **Paciente** (sin login): arma su presupuesto, lo exporta en PDF, imagen o texto.
- **Administrador del negocio** (`/admin`): exámenes, perfiles, categorías, precios, configuración y dashboard de estadísticas.
- **Superadministrador** (`/super`): crea negocios/subdominios y sus administradores; gestiona la tasa BCV.

Sin dependencias externas: solo Node.js ≥ 22.13.

## Probar en local

```bash
npm run seed:demo     # crea la base con datos de ejemplo
npm start             # http://localhost:3000
```

| Qué | Dirección | Usuario | Clave |
|---|---|---|---|
| Laboratorio Demo (paciente) | http://demo.localhost:3000 | — | — |
| Admin del demo | http://demo.localhost:3000/admin | admin@demo.test | Demo12345 |
| Admin de Clínica Norte | http://norte.localhost:3000/admin | admin@norte.test | Norte12345 |
| Superadmin | http://localhost:3000/super | super@plataforma.test | Super12345 |

> ⚠️ Son credenciales de prueba. **No las uses en producción**: crea tu superadmin con `SUPER_EMAIL` y `SUPER_PASSWORD` y no ejecutes `seed:demo`.

`*.localhost` suele resolverse solo en Chrome/Firefox. Si no, usa `http://localhost:3000/?negocio=demo` (solo en desarrollo, `ALLOW_TENANT_QUERY`).

Pruebas automáticas: `npm test` (20 pruebas de API).

## Variables de entorno (`.env`, ver `.env.example`)

| Variable | Uso |
|---|---|
| `PORT`, `HOST` | Dónde escucha el servidor |
| `BASE_DOMAIN` | Dominio base, p. ej. `tudominio.com` (los negocios son `slug.tudominio.com`) |
| `SESSION_SECRET` | Texto largo y aleatorio para firmar sesiones (obligatorio en producción) |
| `TRUST_PROXY` | `true` si hay proxy/balanceador (toma IP y Host reales) |
| `COOKIE_SECURE` | `true` con HTTPS |
| `DATABASE_FILE` / `DATABASE_URL` | SQLite (archivo) o PostgreSQL |
| `BCV_API_URL`, `BCV_STALE_HOURS`, `BCV_DISABLED` | Fuente y comportamiento de la tasa |
| `CRON_SECRET` | Protege `/api/cron/tasa` |
| `TZ_OFFSET_MIN` | Zona horaria para estadísticas (Caracas: `-240`) |
| `SUPER_EMAIL`, `SUPER_PASSWORD` | Superadmin inicial |

## Tasa BCV

- Se consulta automáticamente cada hora (por defecto `https://ve.dolarapi.com/v1/dolares/oficial`, campo `promedio`) y se guarda.
- Si la fuente falla se usa la última tasa conocida con aviso de "desactualizada" (tras 36 h). El superadmin puede fijar una tasa manual y cada negocio puede tener la suya.
- Para entornos sin proceso permanente, llama a `/api/cron/tasa` con `CRON_SECRET` desde un cron externo.
- La conversión a Bs. se aplica **solo al total**.
- La tasa `100` del seed es solo un ejemplo (fuente "ejemplo").

## Reglas del presupuesto

- Cada examen aparece una sola vez (suelto o dentro de un perfil). Un perfil que se solapa con otro se bloquea y se ofrece reemplazar; los exámenes sueltos cubiertos por un perfil se retiran solos. Se valida también en el servidor.
- Moneda: `12,50 REF`; bolívares `1.234,56 Bs.`

## Privacidad

Los datos del paciente (nombre, cédula, teléfono, médico) **no se guardan** en el servidor: solo van en el documento exportado. Se guarda únicamente lo estadístico: negocio, fecha/hora, código, exámenes, categorías, total REF, tasa, origen y tipo de dispositivo. Las visitas son anónimas.

## Publicar con dominio propio

1. DNS: registro comodín `*.tudominio.com` y `tudominio.com` hacia el servidor.
2. Certificado TLS comodín (`*.tudominio.com`).
3. Proxy inverso (Nginx/Caddy) que **conserve el encabezado Host** y apunte al puerto de la app.
4. Variables: `NODE_ENV=production`, `BASE_DOMAIN`, `SESSION_SECRET`, `TRUST_PROXY=true`, `COOKIE_SECURE=true`, `SUPER_EMAIL`/`SUPER_PASSWORD`.
5. `npm run seed` (crea solo el superadmin) y `npm start`. Luego crea los negocios desde `/super`.

## Pasar a PostgreSQL

El esquema (`db/schema.sql`) y las consultas son portables. Para usar una base externa:

```bash
npm install pg
DATABASE_URL=postgres://usuario:clave@host:5432/base npm start
```

El adaptador `src/db.pg.js` convierte `?` en `$n`, pero **aún no se ha probado contra un PostgreSQL real**: pruébalo en un entorno de preparación y corre `npm test` apuntando a esa base antes de publicar.

## Estructura

```
src/        servidor (http, auth, bcv, negocio, dashboard, rutas, db)
db/         schema.sql
public/     interfaz (paciente, admin, super) en JS/CSS sin frameworks
test/       pruebas de API
```
