# Sistema de diseño (referencia: Parrilla de Contenido)

Estética: limpia, mobile-first, mucho aire, tarjetas blancas sobre fondo gris azulado muy claro, un solo color de acento (índigo), color semántico por categoría y por estado. Claro y oscuro con el mismo peso de diseño.

## Archivos de referencia
- `tokens.css`: variables de color y tipografía, tema claro, oscuro automático (`prefers-color-scheme`) y manual (`data-theme`).
- `referencia-parrilla.html`: la app completa; el CSS de componentes está en su `<style>`. Úsalo como fuente visual y de CSS, NO copies su lógica.

## Tipografía
- Títulos y números grandes: **Space Grotesk** (600-700, `letter-spacing:-.02em`).
- Texto: **Inter**, 14px, `line-height:1.5`.
- Etiquetas de sección: 11-12px, MAYÚSCULAS, `letter-spacing:.07em`, peso 600, color `--ink-3`.
- Cargar desde Google Fonts, con fallback `system-ui`.

## Color (usar siempre vía variables)
- Superficies: `--bg` (página), `--surface` (tarjetas), `--surface-2` (inputs, cajas suaves). Bordes: `--line`, `--line-2`.
- Texto: `--ink` (principal), `--ink-2` (secundario), `--ink-3` (apagado).
- Acento: `--accent` + `--accent-ink` (texto sobre acento) + `--accent-bg` (fondo suave).
- Semánticos: `--ok`, `--warn`, `--danger`, cada uno con su `-bg`.
- Categorías (`--reel`, `--carrusel`, `--foto`, `--historia`, `--diseno`, cada una con `-bg`): en la Parrilla identifican formatos. En otra app, **reasignarlas** a las categorías propias (p. ej. tipos de examen, estados del presupuesto).
- Regla: nunca colores literales en componentes; todo por variable. `body` siempre con `background:var(--bg)`.

## Forma y espaciado
- Radios: tarjetas 12px, botones/inputs 8px, filas 10px, chips 6px, píldoras 999px.
- Tarjeta: `--surface`, borde 1px `--line`, padding 14-18px, sin sombra.
- Gutter lateral mínimo 16px; usar `gap` en flex/grid, no márgenes.
- Foco visible: `outline:2px solid var(--accent);outline-offset:2px`.

## Componentes
- **Botón** `.btn`: borde `--line`, fondo `--surface`, radio 8, alto mín. 34. Variantes: `.primary` (fondo acento), `.ghost`, `.danger`, `.sm`.
- **Input** `.in`: fondo `--surface-2`, borde `--line`, radio 8, padding 8x10.
- **Segmentado** `.seg`: grupo con borde; el activo (`aria-pressed=true`) va en `--ink` con texto `--bg`.
- **Toggle/pill** `.tog`: píldora; activo con `--accent-bg`, borde y texto `--accent`.
- **Chip de categoría** `.tag`: 11px, peso 600, radio 6, texto `--c` sobre `--cbg` (variables por categoría).
- **Píldora de estado** `.st`: 12px, peso 600, punto de color + texto, fondo `--sbg` y texto `--sc`; en la app es un selector clicable con chevron.
- **Tarjeta de lista** `.row`: grid [fecha | contenido | estado], borde `--line`, hover borde `--ink-3`; toda la tarjeta es un enlace (enlace extendido con `::after`), los controles internos van por encima con `z-index`.
- **Cabecera de resumen**: tres bloques (tema, objetivos, métricas) en tarjeta única, con etiquetas en mayúsculas, número grande en Space Grotesk y barra de progreso 8px.
- **Barra de progreso** `.bar`: 8px, radio 4, fondo `--line-2`.
- **Estado vacío** `.empty`: borde punteado, centrado, título en Space Grotesk.
- **Filtros**: un solo botón con icono y contador (`.badge`) que abre un panel en tarjeta.
- Navegación: pestañas con subrayado en la activa.
- Móvil primero: todo apila a una columna bajo ~720px; nada con scroll horizontal.

## Iconos y emojis
Imágenes PNG de emojis como iconos de categoría, tamaño 14px dentro de chips, 18px en títulos de grupo.

## Reglas al migrar
1. Primero tokens y base (`body`, tipografía), luego componentes, luego cada vista.
2. No cambiar lógica, datos ni rutas.
3. Verificar claro y oscuro, y móvil (~400px) y escritorio.
