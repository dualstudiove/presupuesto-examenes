# Sistema de diseño Dual Studio

El **padre** de todas las apps de dualstudio.app. Define cómo se ve y se comporta todo: tokens, tema claro y oscuro, tipografía y componentes. Cada app (el **hijo**) solo ajusta tokens y agrega los componentes que únicamente ella tiene.

Catálogo visual vivo: [`catalogo.html`](catalogo.html), publicado en **dualstudio.app/diseno**.

Estética: limpia, mobile-first, mucho aire, tarjetas blancas sobre fondo gris azulado muy claro, un solo color de acento (índigo por defecto), color semántico por categoría y por estado. Claro y oscuro con el mismo peso de diseño.

## Archivos

| Archivo                         | Qué tiene                                                                                                                                          |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `diseno.css`                    | Punto de entrada único. Declara el orden de las capas e importa los tres siguientes.                                                               |
| `tokens.css`                    | Variables de color y tipografía. Claro, oscuro automático (`prefers-color-scheme`) y manual (`data-theme`). Acento por marca con `--primary`.      |
| `base.css`                      | Reset, tipografía, utilidades (`.muted`, `.k`, `.sr`…), foco visible, movimiento reducido, impresión en claro.                                     |
| `componentes.css`               | Botones, formularios, tarjetas, avisos, chips, píldoras, pestañas, tablas, estado vacío, ventanas, avisos emergentes, acceso y páginas de mensaje. |
| `js/iconos.js`                  | `icon('nombre')`: los íconos SVG de trazo.                                                                                                         |
| `js/componentes.js`             | `toast()`, `modal()`, `confirmar()`, `conBoton()`.                                                                                                 |
| `docs/referencia-parrilla.html` | Referencia histórica de la que nació el sistema (Parrilla de Contenido). Solo como fuente visual.                                                  |

Al compilar, `herramientas/construir.js` copia todo esto en `<app>/.publicar/<BASE_PATH>/_ds/diseno/`.

## Cómo lo usa una app

```html
<link rel="stylesheet" href="/_ds/diseno/diseno.css">
<!-- padre -->
<link rel="stylesheet" href="/css/tema.css">
<!-- hijo: @layer app.tema { tokens } -->
<link rel="stylesheet" href="/css/app.css">
<!-- hijo: @layer app { componentes propios } -->
```

```js
import { icon } from "../_ds/diseno/js/iconos.js";
import { conBoton, confirmar, modal, toast } from "../_ds/diseno/js/componentes.js";
```

### Capas (de menor a mayor prioridad)

`diseno.tokens` → `diseno.base` → `diseno.componentes` → `app.tema` → `app`

El orden es fijo (`@layer` en `diseno.css`), así que una app siempre gana al padre sin pelear con la especificidad de los selectores.

Hay dos detalles a tener en cuenta:

- Con `!important` el orden se invierte, así que no lo uses para ganarle al padre.
- Un token redefinido en `tema.css` gana a los del padre **en claro y en oscuro**. Por eso hay que dar los dos valores, con el mismo patrón de `tokens.css`.

## Reglas

1. **Los hijos cambian tokens.** `tema.css` solo redefine variables (acento, categorías, fuente de títulos…). Nunca reescribe un componente del padre.
2. **Nada de colores sueltos.** Todo color en una app sale de `var(--…)`. Así funciona solo en claro y oscuro. `body` siempre con `background: var(--bg)`.
3. **Dos apps, sube al padre.** Si un componente aparece en una segunda app, se mueve a `componentes.css` (y al catálogo).
4. **Escapar siempre.** Todo texto que venga del usuario o de la base pasa por `esc()` antes de ir a HTML. `toast()` y `confirmar()` ya lo tratan como texto.
5. **Verificar** claro y oscuro, en móvil (~400px) y en escritorio, antes de publicar.

## Tipografía

- Títulos y números grandes: **Space Grotesk** (600-700, `letter-spacing: -.02em`) → `--font-display`.
- Texto: **Inter**, 14px, `line-height: 1.5` → `--font-body`.
- Etiquetas de sección (`.k`): 11-12px, MAYÚSCULAS, `letter-spacing: .07em`, peso 600, color `--ink-3`.
- Se cargan desde Google Fonts, con fallback `system-ui`.

## Color (siempre vía variables)

- Superficies: `--bg` (página), `--surface` (tarjetas), `--surface-2` (campos, cajas suaves). Bordes: `--line`, `--line-2`.
- Texto: `--ink` (principal), `--ink-2` (secundario), `--ink-3` (apagado).
- Acento: `--accent` + `--accent-ink` (texto sobre acento) + `--accent-bg` (fondo suave).
  - **Acento por marca:** si una app escribe `--primary` en el `style` de `<html>` (p. ej. el color de cada negocio en Cotízalo), el padre lo convierte en acento y lo aclara en oscuro para mantener el contraste.
- Estados: `--ok`, `--warn`, `--danger`, cada uno con su `-bg`.
- Categorías: `--cat-1…5`, cada una con `-bg`. Cada app decide qué significan (tipos de examen en Cotízalo, una app por color en la central). Las clases `.cat-1…5` ponen `--c`/`--cbg` para chips e íconos.

## Forma y espaciado

- Radios: tarjetas 12px, botones y campos 8px, filas 10px, chips 6px, píldoras 999px.
- Tarjeta: `--surface`, borde 1px `--line`, padding 16-18px, sin sombra.
- Gutter lateral mínimo 16px; `gap` en flex/grid, no márgenes.
- Foco visible: `outline: 2px solid var(--accent); outline-offset: 2px`.
- Móvil primero: todo apila a una columna bajo ~720px; nada con scroll horizontal.

## Componentes (ver el catálogo)

- **Botón** `.btn` + `.btn-primary` / `.btn-soft` / `.btn-ghost` / `.btn-danger` (`.solid`) / `.btn-sm` / `.btn-lg` / `.btn-icon`.
- **Campos** `.field` (etiqueta + campo + `.hint`), `.row` / `.row3` (columnas), `.input-unit`, `.search`, `.check`.
- **Tarjeta** `.card` (con `h3` de sección o `.card-h`).
- **Aviso** `.notice` (+ `.ok` / `.warn` / `.bad`).
- **Chip de categoría** `.tag` / `.badge` con `.cat-N`; **píldora de estado** `.badge.ok` / `.off` / `.bad` / `.warn` (clicable si es `button`).
- **Filtro** `.chips` > `.chip` (`.on`).
- **Pestañas** `.tabs` (subrayado) y **segmentado** `.seg`.
- **Barra** `.bar`; **tabla** `table.t` dentro de `.tw` (en móvil, cada fila es una tarjeta).
- **Estado vacío** `.empty`; **carga** `.skeleton`.
- **Ventana** `.overlay` > `.modal` (JS: `modal()`, `confirmar()`); **aviso emergente** `.toast` (JS: `toast()`).
- **Acceso** `.login` > `.card`; **página de mensaje** `body.mensaje` > `.card.centro` (la usa `crearServidor()` para errores).
