# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/paillardelle-documental/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** Paillardelle Documental
**Generated:** 2026-11-02 09:33:48
**Category:** Government/Public Service
**Design Dials:** Density 6/10 (Standard)

---

## Global Rules

### Color Palette

| Role | Hex | CSS Variable |
|------|-----|--------------|
| Primary | `#0F172A` | `--color-primary` |
| On Primary | `#FFFFFF` | `--color-on-primary` |
| Secondary | `#334155` | `--color-secondary` |
| On Secondary | `#FFFFFF` | `--color-on-secondary` |
| Accent/CTA | `#0369A1` | `--color-accent` |
| On Accent/CTA | `#FFFFFF` | `--color-on-accent` |
| Background | `#F8FAFC` | `--color-background` |
| Foreground | `#020617` | `--color-foreground` |
| Card | `#FFFFFF` | `--color-card` |
| Card Foreground | `#020617` | `--color-card-foreground` |
| Muted | `#E8ECF1` | `--color-muted` |
| Muted Foreground | `#475569` | `--color-muted-foreground` |
| Border | `#E2E8F0` | `--color-border` |
| Destructive | `#DC2626` | `--color-destructive` |
| On Destructive | `#FFFFFF` | `--color-on-destructive` |
| Ring | `#0F172A` | `--color-ring` |

**Color Notes:** High contrast navy + blue

### Typography

- **Heading Font:** Atkinson Hyperlegible
- **Body Font:** Atkinson Hyperlegible
- **Mood:** accessible, readable, inclusive, WCAG, dyslexia-friendly, clear
- **Google Fonts:** [Atkinson Hyperlegible + Atkinson Hyperlegible](https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&display=swap)

**CSS Import:**
```css
@import url('https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&display=swap');
```

### Spacing Variables

*Density: 6/10 — Standard*

| Token | Value | Usage |
|-------|-------|-------|
| `--space-xs` | `4px` / `0.25rem` | Tight gaps |
| `--space-sm` | `8px` / `0.5rem` | Icon gaps, inline spacing |
| `--space-md` | `16px` / `1rem` | Standard padding |
| `--space-lg` | `24px` / `1.5rem` | Section padding |
| `--space-xl` | `32px` / `2rem` | Large gaps |
| `--space-2xl` | `48px` / `3rem` | Section margins |
| `--space-3xl` | `64px` / `4rem` | Hero padding |

### Shadow Depths

| Level | Value | Usage |
|-------|-------|-------|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.05)` | Subtle lift |
| `--shadow-md` | `0 4px 6px rgba(0,0,0,0.1)` | Cards, buttons |
| `--shadow-lg` | `0 10px 15px rgba(0,0,0,0.1)` | Modals, dropdowns |
| `--shadow-xl` | `0 20px 25px rgba(0,0,0,0.15)` | Hero images, featured cards |

---

## Component Specs

### Buttons

```css
/* Primary Button */
.btn-primary {
  background: #0369A1;
  color: #FFFFFF;
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 600;
  transition: all 200ms ease;
  cursor: pointer;
}

.btn-primary:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}

/* Secondary Button */
.btn-secondary {
  background: transparent;
  color: #0F172A;
  border: 2px solid #0F172A;
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 600;
  transition: all 200ms ease;
  cursor: pointer;
}
```

### Cards

```css
.card {
  background: #F8FAFC;
  border-radius: 12px;
  padding: 24px;
  box-shadow: var(--shadow-md);
  transition: all 200ms ease;
  cursor: pointer;
}

.card:hover {
  box-shadow: var(--shadow-lg);
  transform: translateY(-2px);
}
```

### Inputs

```css
.input {
  padding: 12px 16px;
  border: 1px solid #E2E8F0;
  border-radius: 8px;
  font-size: 16px;
  transition: border-color 200ms ease;
}

.input:focus {
  border-color: #0F172A;
  outline: none;
  box-shadow: 0 0 0 3px #0F172A20;
}
```

### Modals

```css
.modal-overlay {
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
}

.modal {
  background: white;
  border-radius: 16px;
  padding: 32px;
  box-shadow: var(--shadow-xl);
  max-width: 500px;
  width: 90%;
}
```

---

## Style Guidelines

**Style:** Accessible & Ethical

**Keywords:** Accessible, inclusive interface, high contrast, large text (16px+), keyboard navigation, screen reader friendly, accessibility standards aware, focus state, semantic

**Best For:** Government, healthcare, education, inclusive products, large audience, legal compliance, public

**Key Effects:** Clear focus rings (3-4px), ARIA labels, skip links, responsive design, reduced motion, 44x44px touch targets

### Page Pattern

**Pattern Name:** Minimal Single Column

- **Conversion Strategy:** Single CTA focus. Large typography. Lots of whitespace. No nav clutter. Mobile-first.
- **CTA Placement:** Center, large CTA button
- **Section Order:** Hero headline > Short description > Benefit bullets (3 max) > CTA > Footer

---

## Anti-Patterns (Do NOT Use)

- ❌ Ornate design
- ❌ Low contrast
- ❌ Motion effects
- ❌ AI purple/pink gradients

### Additional Forbidden Patterns

- ❌ **Emojis as icons** — Use SVG icons (Heroicons, Lucide, Simple Icons)
- ❌ **Missing cursor:pointer** — All clickable elements must have cursor:pointer
- ❌ **Layout-shifting hovers** — Avoid scale transforms that shift layout
- ❌ **Low contrast text** — Maintain 4.5:1 minimum contrast ratio
- ❌ **Instant state changes** — Always use transitions (150-300ms)
- ❌ **Invisible focus states** — Focus states must be visible for a11y

---

## Pre-Delivery Checklist

Before delivering any UI code, verify:

- [ ] No emojis used as icons (use SVG instead)
- [ ] All icons from consistent icon set (Heroicons/Lucide)
- [ ] `cursor-pointer` on all clickable elements
- [ ] Hover states with smooth transitions (150-300ms)
- [ ] Light mode: text contrast 4.5:1 minimum
- [ ] Focus states visible for keyboard navigation
- [ ] `prefers-reduced-motion` respected
- [ ] Responsive: 375px, 768px, 1024px, 1440px
- [ ] No content hidden behind fixed navbars
- [ ] No horizontal scroll on mobile


## Adaptación institucional vigente — 2026-11-02

Esta sección concreta la recomendación generada y tiene prioridad sobre sus ejemplos genéricos de landing, paleta y tipografía. No había MASTER previo al comienzo de este trabajo. No se utilizó --force. Los nombres de tokens reales se conservan en español para integrarse con el frontend existente.

### Producto, alcance y evidencia

Aplicación interna de gestión documental de la I.E. Enrique Paillardelle. Personal administrativo adulto; trabajo frecuente con registros, búsquedas y PDF. React instalado 19.3.1, React Router 7, TypeScript y CSS Modules; no se cambia la plataforma ni se añaden dependencias. Búsquedas verificadas: government administrative dashboard (--design-system, density 6), theme state persistence y form state preserve (--stack react), responsive table mobile, dark mode contrast y accessible authentication (--domain ux). La base de la skill declara React 19.2.x; se aplica solo orientación compatible sobre estado, contexto y formularios. Se contrastó preservación de estado con https://react.dev/learn/preserving-and-resetting-state (documentación 19.3).

Se descartó education document management dashboard por devolver tipografía infantil y un patrón de marketing. Se conserva Accessible & Ethical del resultado afinado: contraste, foco, lectura, controles nativos y movimiento mínimo. No se aplican hero comercial, CTA repetidos, estadísticas ficticias ni fuentes remotas.

### Identidad y tipografía

Logo original: frontend/src/assets/logo-institucion.jpg (553 × 555). Mostrar completo, object-fit:contain, sin filtros ni recoloración; esquinas suaves del contenedor. Login 104 px en escritorio / 72 px móvil; navegación 48 px. Derivados nuevos de 16, 32 y 180 px en frontend/public; original intacto. Los favicons recortan solo el margen celeste exterior (región 125,88,304,381), conservan el escudo completo y su proporción, centrado con relleno transparente. Azul profundo y celeste proceden de la identidad visual; amarillo del borde del escudo solo como acento, nunca texto sobre blanco. Rojo reservado a errores y acciones destructivas.

Tipografía local: Segoe UI, Arial, system-ui, sans-serif, sin dependencia de red. Base 16 px / interlineado 1.65. H1 30 px (26 móvil), H2 18 px, cuerpo 15–16 px, etiquetas 14 px, metadatos 12–13 px. Pesos 400, 600, 700. Números de indicadores tabulares. Texto íntegro y saltos de línea en detalle, historial y auditoría.

### Tokens semánticos (fuente ejecutable: frontend/src/index.css)

| Token | Claro | Oscuro | Uso |
|---|---|---|---|
| --primario | #075a91 | #8bcdff | Acción, enlace, selección |
| --sobre-primario | #ffffff | #08263f | Texto sobre botón primario |
| --fondo | #f3f6fa | #101b2b | Página |
| --superficie | #ffffff | #17263a | Tarjeta, modal, cabecera |
| --superficie-secundaria | #edf2f8 | #20334b | Subpanel, filtro, controles |
| --texto | #18283d | #edf3fb | Contenido |
| --texto-secundario | #52647b | #b3c4d9 | Ayudas y metadatos |
| --borde | #d1dce8 | #364d68 | Separación |
| --borde-control | #7b8da3 | #7f98b5 | Controles |
| --acento | #edca39 | #f0d45f | Identidad |
| --error | #a72e38 | #ffb6be | Error / peligro |
| --exito | #22623e | #9ce0b6 | Éxito |
| --advertencia | #795313 | #f2d489 | Confirmación / aviso |

Cada estado tiene tokens propios de fondo y borde; no reutilizar un color literal claro en modo oscuro. Única excepción visual: papel del PDF conserva blanco y contenido original. La zona del visor, paginación y herramientas cambian de tema.

### Geometría y componentes

Escala 4/8/12/16/24/32/48/64 px. Tarjetas 28 px internos (20 móvil), separación 24 px, radio 14 px. Controles radio 8 px, altura 44–50 px, campos a 16 px para evitar zoom móvil. Sombra mínima. Escritorio ancho máximo 1480 px, listas documentales 1800 px; sidebar 264 px. Sin filas de más de dos campos en formularios de registro/configuración. Filtros de listado permiten tres columnas amplias.

Navegación por permisos existentes; misma marca y estilos en cinco roles. Activo con fondo azul suave, borde y línea lateral además del texto. Drawer nativo bajo 900 px; cerrar con botón/Escape, conservar trampa de foco. Cabecera móvil se divide en contexto y cuenta/apariencia. Saltar al contenido siempre disponible con teclado.

Buscador documental con etiqueta visible y ejemplo de código/asunto. Inputs con etiqueta real, estados invalid/disabled, botón ocupado y mensajes cerca del formulario. No se restablece ningún formulario al cambiar tema. Confirmaciones nombran Delegar documento, Anular registro, Eliminar PDF, Cambiar contraseña, Activar/Desactivar cuenta; salida Cancelar. Estado vacío con explicación y recuperación; carga anunciada por role=status y errores por role=alert.

Tablas en escritorio; tarjetas a 900 px con data-label por celda y todas las acciones/datos disponibles. No ocultar tipo ni ubicación en móvil. Solo resúmenes largos usan tres líneas y Leer más/Leer menos, conservando el texto íntegro; detalle e historial nunca se recortan. Enlaces y acciones con foco de 3 px, controles táctiles de 44 px. Sin movimiento decorativo; respetar prefers-reduced-motion.

### Tema y persistencia

Dos opciones visibles Claro/Oscuro en login y cabecera autenticada, con aria-pressed y grupo Apariencia. Primera visita usa prefers-color-scheme. Selección explícita se guarda en paillardelle-tema; se sincroniza entre pestañas. Si el almacenamiento falla, la pantalla sigue operativa. Script local anterior al render evita destello de tema. Cambio solo de data-tema en html, sin cambiar claves ni desmontar rutas/PDF. No usar filtros de inversión.

### Validación y límites

Ver docs/REDISENO_INTERFAZ_LOCAL.md para inventario, archivos y resultados reales. Verificar contraste en ambos temas, 375/768/1440 px, teclado, logo/favicons, persistencia y retención de formularios y PDF. No tocar backend, base, cuentas, documentos ni auditoría para aplicar el sistema. No commits, push ni despliegue.


## Decisión tipográfica aprobada — 2 de noviembre de 2026

El usuario seleccionó **C · IBM Plex Sans** tras revisar la comparación. Esta decisión reemplaza la pila Segoe UI de la adaptación anterior para todas las pantallas activas y los cinco perfiles. Se conservan márgenes, geometría y paletas.

- Familia única de títulos, texto, navegación, formularios, tablas, botones, cifras, etiquetas de gráficos, historial, auditoría y controles PDF: IBM Plex Sans.
- Token ejecutable: --fuente-interfaz en frontend/src/index.css. Respaldo Arial/system-ui/sans-serif.
- Binario variable original sin modificar en frontend/public/fuentes/ibm-plex-sans/normal.ttf; OFL.txt y METADATA.pb junto al archivo. SIL OFL 1.1; conservar avisos. Servido localmente con preload y font-display:swap, sin Google Fonts en ejecución.
- Pesos habituales 400 (texto), 500 (énfasis), 600 (etiquetas/botones/subtítulos), 700 (títulos/cifras); no usar pesos finos. Los pesos intermedios existentes quedan interpolados por la familia variable. Sin negrita sintética.
- Cifras tabulares y lining para comparaciones. Mantener escala existente: base/campos 16 px, texto administrativo 15–16, H1 30/26 móvil, H2 18, ayudas/metadatos 12–14.
- El canvas PDF conserva la tipografía y colores del documento original; sus controles heredan la nueva familia.
- Muestras y licencias comparativas permanecen disponibles como evidencia; no gobiernan el estilo global.
