# Planifica

Parrilla de contenido para redes sociales: publicaciones de Instagram y TikTok (formato, fecha, estado, copy, tomas a grabar, referencias), calendario, objetivos del mes y del trimestre con métricas, y la pauta audiovisual en PDF. Es **multicliente** y siempre pide iniciar sesión.

Nació como el artefacto «Parrilla de Contenido» de claude.ai (del que también salió el sistema de diseño de Dual Studio). Vive en **dualstudio.app/planifica** (Worker `planifica`).

## Direcciones

| Dirección | Qué es |
|---|---|
| `dualstudio.app/planifica` | Iniciar sesión. Con un solo cliente se entra directo; con varios, se elige. También está «Tu cuenta» (nombre, contraseña, cerrar sesiones). |
| `dualstudio.app/planifica/<cliente>` | La parrilla del cliente: Lista, Calendario, Objetivos y Pauta. |
| `dualstudio.app/planifica/admin` | Clientes y equipo (solo administradores). |

## Papeles

| Papel | Qué puede hacer |
|---|---|
| **Administrador** | Es del equipo de Dual Studio. Ve todos los clientes como editor, crea y archiva clientes, gestiona el equipo y los accesos, e importa datos. |
| **Editor** | Trabaja en los clientes que tiene asignados. |
| **Solo lectura** | Ve los clientes asignados sin poder cambiar nada. Sirve, por ejemplo, para que el cliente revise su parrilla. |

Un cliente sin acceso responde como si no existiera, y ninguna consulta cruza clientes. El primer administrador se crea con los secretos `SUPER_EMAIL` y `SUPER_PASSWORD` (ver «Publicar»).

## Estructura

| Archivo | Qué es |
|---|---|
| `src/server.js` | El Worker: `crearServidor()` de `@dualstudio/comun` y las páginas. |
| `src/rutas.js` | La API de la cuenta y de cada cliente: datos, publicaciones, objetivos, ajustes e imágenes. |
| `src/admin.js` | La API de administración: clientes, equipo, accesos e importación. |
| `src/sesion.js` | Sesión y permisos sobre las cuentas compartidas (`comun/servidor/cuentas.js`). |
| `src/esquema.js` | Las tablas, que la app crea sola: `usuarios`, `clientes`, `accesos`, `publicaciones`, `objetivos`, `imagenes`. |
| `src/validar.js` | Qué campos y tamaños se aceptan. Publicaciones y objetivos se guardan como JSON. |
| `src/almacen.js` | Las imágenes, con un almacenamiento intercambiable (hoy D1). |
| `public/parrilla.html` + `js/parrilla.js` + `css/parrilla.css` | La parrilla, portada del artefacto casi sin cambios. |
| `public/js/conexion.js` | Puente entre la parrilla y la API. Ofrece la misma interfaz que claude.ai daba al artefacto: datos en vivo, usuario, imágenes y descargas. |
| `public/index.html`, `admin.html` | Inicio y administración, con los componentes del sistema de diseño. |
| `public/css/tema.css` | Acento morado. Los formatos usan los colores de categoría del padre, salvo Diseño, que lleva su propio cian. |
| `construir.js` | Copia jsPDF (local, sin CDN) a `/vendor` al compilar. |

## Cómo funciona

- **Cambios de otras personas:** la parrilla se refresca cada 30 s mientras la pestaña está visible, al volver a ella y tras cada cambio propio. Cuando no hubo cambios, el servidor responde con una sola lectura en la base.
- **Guardado:** es automático, igual que en el artefacto. Lo que escribes se ve al instante y se confirma con el servidor.
- **Imágenes de referencia:** el navegador las reduce a 1080 px y las guarda en WebP, de unos 40 a 90 KB cada una. Hay un tope de 400 KB por imagen y de 50 MB por cliente (el uso aparece en Clientes y equipo), y se borran con su publicación.
  - Hoy se guardan en D1. Para pasarlas a otro sitio (por ejemplo Google Drive, una carpeta por cliente) se añade un almacén en `src/almacen.js`; el resto de la app no cambia. Para Drive hará falta conectar una cuenta de Google.
- **Topes diarios por cliente**, guardados en la base: 5 000 cambios y 200 imágenes. Frenan un uso desbocado antes de que agote la cuota gratuita de la cuenta.

## Importar una Parrilla de Contenido

Ve a Clientes y equipo → **Importar** en un cliente y elige el archivo `.json` de exportación (`formato: "parrilla-v1"`). La importación:
- suma las publicaciones;
- reemplaza los objetivos del mismo periodo;
- guarda las imágenes con un id nuevo;
- toma la cuenta de Instagram si el cliente no tenía una.

## Probar en local

```bash
cp .dev.vars.example .dev.vars     # y agrega SUPER_EMAIL / SUPER_PASSWORD para tener un administrador
npm run dev                        # http://localhost:8787/planifica
npm test
```

## Publicar por primera vez

1. **Bases de datos:** en Cloudflare → Almacenamiento y bases de datos → D1, crea `planifica` y `planifica-pruebas`. Pega sus ID en `wrangler.jsonc` (en `d1_databases` y en `previews.d1_databases`). La app crea sola sus tablas.
2. **Worker:** en Workers → Crear → Importar un repositorio, elige este repositorio con esta configuración:

   | Campo | Valor |
   |---|---|
   | Nombre | `planifica` |
   | Directorio raíz | `apps/planifica` |
   | Comando de compilación | `cd ../.. && npm ci` |
   | Despliegue y vistas previas | Los mismos comandos que Cotízalo |
   | Rutas a vigilar | `apps/planifica/*`, `packages/*`, `herramientas/*`, `package-lock.json` |

3. **Secretos:** en el Worker → Configuración → Variables y secretos:
   - `SESSION_SECRET`: texto aleatorio de 32 caracteres o más.
   - `SUPER_EMAIL` y `SUPER_PASSWORD`: tu correo y una contraseña. Crean tu cuenta de administrador.

   Los mismos tres van en los secretos de las vistas previas.
4. **Entra y limpia:** entra a `dualstudio.app/planifica` con ese correo y **borra** `SUPER_EMAIL` y `SUPER_PASSWORD`. Se aplican una sola vez; mientras sigan guardados, el inicio muestra un aviso.
5. **Datos:** en Clientes y equipo, crea el cliente e importa su Parrilla.
6. **Central:** en `apps/central/apps.json`, cambia el estado de Planifica a `"pruebas"` para que aparezca con enlace en dualstudio.app.
