# @dualstudio/comun

Lógica compartida por las apps de Dual Studio, sin nada visual (lo visual está en `packages/diseno`). Si algo se repite en dos apps y no es visual, va aquí.

## Servidor: `@dualstudio/comun/servidor`

```js
import { Router, crearServidor, crearEsquema, configurarEnv } from '@dualstudio/comun/servidor';

const router = new Router();
router.add('GET', '/api/estado', async (ctx) => ({ ok: true }));

export const { fetch, scheduled } = crearServidor({
  router,
  configurar: (b) => configurarEnv(b, (v, env) => { env.miVar = v.MI_VAR; }),
  asegurarEsquema: crearEsquema({ base: 'CREATE TABLE IF NOT EXISTS …', testigo: 'mi_tabla', columnas: [] }),
  paginas(app, { asset }) { app.get('/', (c) => asset(c, '/index.html')); },
});
export default { fetch, scheduled };
```

| Módulo | Qué da |
|---|---|
| `servidor.js` | `crearServidor()`: montaje bajo `BASE_PATH`, API (JSON, CSRF con `x-app`, `opts.auth`, errores), páginas desde `ASSETS`, cabeceras de seguridad, «falta configuración», Cron (`programado`). |
| `env.js` | `env` y `configurarEnv()`: `BASE_PATH`, `SESSION_SECRET` (**obligatorio** salvo `ENVIRONMENT=development`, mínimo 32 caracteres), `ENVIRONMENT`, `TZ_OFFSET_MIN`, `PBKDF2_ITER`, `SUPER_EMAIL`/`SUPER_PASSWORD`. |
| `db.js` | `db.all/get/run/tx` sobre D1. `tx` agrupa las escrituras en un lote atómico (D1 no tiene transacciones interactivas). |
| `cuentas.js` | Lo común de las cuentas de usuario: `tipoDeSesion()` (cookie firmada con versión de sesión), `cerrarOtrasSesiones()`, `frenoDeIntentos()`, `comprobarPassword()` (sin delatar correos) y `aplicarSecretosDeRecuperacion()` (`SUPER_EMAIL`/`SUPER_PASSWORD`, una sola vez). Lo usan Cotízalo y Planifica. |
| `auth.js` | Contraseñas PBKDF2 (`s2$…`/`s3$…`), sesiones firmadas con HMAC (`firmarToken`/`leerToken`, campo `sv` para cerrarlas a distancia), cookies limitadas a la ruta de la app, bloqueo por intentos y límites en memoria. |
| `esquema.js` | `crearEsquema()`: la app crea sus tablas sola en una base vacía y añade columnas nuevas. También crea las tablas comunes `_cuotas` y `_ajustes`. |
| `cuotas.js` | `cuotaDiaria(clave, max)`: topes diarios guardados en la base, válidos para todas las instancias. `leerAjuste`/`guardarAjuste`. |
| `util.js` | Fechas en el huso de la app, validadores, `escHtml`, CSV seguro para Excel. |
| `http.js` | `Router`, `HttpError(código, mensaje)`, `Raw` (respuestas que no son JSON). |
| `d1-local.js` | D1 sobre `node:sqlite` para pruebas y seeds (`@dualstudio/comun/servidor/d1-local`). No se despliega. |

**Plan gratuito:** el cifrado de contraseñas usa 100 000 iteraciones (el máximo de Workers). Si el inicio de sesión se pasa de los 10 ms de CPU, pon la variable `PBKDF2_ITER` (por ejemplo `"60000"`): las contraseñas nuevas usan ese valor y las anteriores siguen sirviendo.

## Navegador: `packages/comun/web`

Se copia en `/_ds/comun/web/` de cada app al compilar. Se importa con rutas relativas desde los JS de la app:

| Archivo | Qué da |
|---|---|
| `api.js` | `crearApi(resolver)`: llamadas a la API con los mismos acuerdos que el servidor. `basePath(import.meta.url)` deduce la ruta de la app. |
| `dom.js` | `$`, `$$`, `esc` (escapar HTML), `norm` (buscar sin acentos), `debounce`, `dispositivo`. |
| `formatos.js` | `fmtNum` (1.234,56), `fmtFecha` (31/12/2026), `diaLocal`. |
| `imagenes.js` | `imagenAJpeg` (logos pequeños). |

## Pruebas

`npm test -w @dualstudio/comun`
