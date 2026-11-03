# Ajuste local de paleta oscura y gráficos — 2 de noviembre de 2026

## Alcance

Se ajustaron exclusivamente colores y su identificación en gráficos. Se conservaron estructura, tamaños de paneles y gráficos, márgenes, espacios internos, IBM Plex Sans, funciones, permisos, rutas, preferencia de tema y agregados del backend. Sin nuevas dependencias. Los cambios locales anteriores se mantuvieron. No hubo commit, push, migración ni despliegue.

No se editaron cuentas, documentos, archivos PDF ni tablas de la base. Todas las solicitudes del recorrido fueron GET; los tokens de sesión de prueba se mantuvieron en memoria, sin guardarlos en el informe. Las huellas de usuarios, documentos, documentos_pdf, auditoria_documental, auditoria_configuracion y pdf_cargas coincidieron antes y después de cada recorrido.

## Modo oscuro: antes y después

Capturas nuevas, tomadas antes de editar y después con la misma sesión de Dirección, mismos agregados y ventana de 1440 × 1000 px:

| Antes | Después |
|---|---|
| ![Antes](qa-paleta-oscura-20261102/antes-oscuro.png) | ![Después](qa-paleta-oscura-20261102/despues-oscuro.png) |

| Uso / token | Antes | Después |
|---|---|---|
| Fondo principal | #181a1b | **#08090b** |
| Tarjetas y paneles | #222526 | #141619 |
| Campos | Compartían superficie de tarjeta | #0d1013 |
| Superficie secundaria | #2c3031 | #202328 |
| Capa elevada, tooltip y diálogo | Compartían superficie principal | #25292f |
| Hover | #363b3c | #2b3036 |
| Borde | #414647 | #343a42 |
| Borde de control | #858e90 | #72808e |
| Texto | #f2f1eb | #f6f7f9 |
| Texto secundario | #bdc3c2 | #bbc5d0 |
| Acción / hover | #8bcdff / #b8dfff | #69c2ff / #a3daff |

El fondo es casi negro; las tarjetas quedan por encima, los campos se hunden ligeramente y las capas elevadas se distinguen. Los acentos se mantienen en enlaces, selección, bordes de indicadores, estados y gráficos. Se ajustaron los fondos y bordes semánticos oscuros de información, éxito, advertencia y error sin extenderlos a todas las superficies. Los estados focus, hover, active y disabled conservan su comportamiento.

El modo claro conserva sus superficies, tipografía, textos, controles y colores de las tarjetas. Se separaron --indicador-* de --grafico-* para que mejorar los gráficos claros no recoloree las tarjetas. Las dimensiones de cada gráfico se compararon entre las capturas previas y finales en los veinte escenarios.

## Paleta de gráficos

| Color | Claro anterior → actual | Oscuro anterior → actual | Uso |
|---|---|---|---|
| Azul | #176c9c → #0078bd | #79bae2 → #40b5ff | Vigentes, personal y categoría asignada |
| Dorado | #ac7b18 → #a36c00 | #e3bd5e → #ffd44a | Pendientes y categoría asignada |
| Terracota | #ad5e3b → #cf511f | #e79d79 → #ff965a | Delegados y Administración |
| Verde | #39765a → #00885b | #85c3a1 → #4cdda2 | Guardados, activas y Dirección |
| Celeste | Nuevo #007d89 | Nuevo #36d8dc | Categoría documental asignada y Superadministración |
| Neutro | #747b80 → #606e7e | #a9b1b5 → #a5b1bf | Inactivas y Mesa de Partes |
| Anulado | #a72e38 → #c62b42 | #ffb6be → #ff657d | Serie y sector de anulados |

Azules, celeste, dorado y terracota se relacionan con el escudo; el verde conserva el significado de actividad y guardado. En claro se usan variantes de mayor profundidad para evitar que el dorado o celeste se pierdan sobre blanco. En oscuro se usan acentos luminosos sobre negro y superficies oscuras.

La leyenda de las barras por categoría está integrada en las etiquetas del eje mediante una marca del mismo color que la barra. Las cantidades siguen visibles al final de cada barra. Nombres completos, cantidades y porcentajes permanecen en tooltip y tabla. Las series mensuales conservan su leyenda independiente; se añadieron cantidades visibles a las columnas sin cambiar el tamaño del gráfico.

## Datos reales y razón para usar uno o varios colores

Se consultó la respuesta real de /api/dashboard de cinco cuentas activas, una por rol, antes de decidir los colores. Las respuestas previas y finales coinciden salvo los campos de reloj. No se descargaron documentos para obtener estadísticas.

| Perfil | Categorías documentales reales | Serie mensual real | Administración |
|---|---|---|---|
| Usuario | 2 tipos, cantidades 2 y 2, colores azul y celeste | Un mes con 4 vigentes: una columna azul | Sin datos administrativos |
| Secretaría | 2 tipos, cantidades 7 y 4, colores azul y dorado | Un mes con 11 vigentes: una columna azul | Sin datos administrativos |
| Dirección | Compartido: 2 tipos (7 y 4). Personales ajenos: 2 tipos (2 y 2) | Un mes por grupo: 11 y 4 vigentes, respectivamente; una serie azul en cada gráfico | Sin datos administrativos |
| Administrador | No recibe documentos | No tiene gráfico documental | 4 roles, una cuenta por rol: cuatro colores. Actividad: 4 activas, 0 inactivas; el anillo solo tiene sector verde visible |
| Superadministrador | 3 tipos, cantidades 9, 4 y 2, colores azul, dorado y celeste | Un mes con **15 vigentes y 1 anulado**: dos series, azul y rojo | 5 roles, una cuenta por rol: cinco colores. Actividad: 5 activas, 0 inactivas |

Los nombres son los registrados en la base: «[PRUEBA REVISIÓN INTEGRAL a465ee] tipos», «FUT» y «Prueba local de registro único». Se conservaron íntegros. El mismo nombre mantiene su color entre grupos, roles, ordenamientos y temas. El tema cambia la variante clara/oscura del color, no su significado.

Las cinco vistas tienen un único mes con actividad. No se inventó una evolución multimes ni se asignaron colores diferentes a los ceros de la misma serie. «Actividad concentrada en un mes» identifica ese caso; los doce meses y los ceros siguen en la tabla. El gráfico global tiene dos columnas porque existen dos series reales, no porque se quiera llenar la paleta.

Cada rol administrativo tiene una sola cuenta en esta base: todas sus barras valen 1, pero representan roles distintos y por eso tienen colores distintos. Las oficinas siguen siendo 6 activas y 0 inactivas en cifras, sin introducir otro gráfico. El anillo de cuentas muestra un solo sector visible porque no hay cuentas inactivas; la leyenda conserva el cero.

El caso de un solo tipo documental se comprobó en una prueba de componente con un dato controlado: etiqueta «Un tipo documental», cantidad y 100 %, sin inventar otras categorías. Esa prueba no modificó la base ni sus capturas reales.

## Verificación

- Capturas previas: cinco roles × claro/oscuro × 1440/375 px = 20 vistas.
- Capturas finales y comprobación del DOM: las mismas 20 vistas con datos reales. Sin errores JavaScript ni desbordamiento horizontal. IBM Plex Sans, composición y espacios conservados.
- Se contrastaron cantidades por tipo y mes de las tablas con la API, dimensiones de cada gráfico antes/después, tokens de superficies y texto claro, correspondencia de marcas de leyenda y barras, colores estables entre roles y un solo color en cada serie mensual.
- Administrador continúa sin recibir grupos documentales ni conteos de Superadministración. No se cambió la autorización del backend.
- Frontend npm test: **67 aprobadas, 0 fallidas**, incluidas dos regresiones nuevas de color estable y categoría única; se observaron fallar antes de implementar el cambio.
- Frontend npm run typecheck, npm run lint y npm run build: **salida 0**.
- Backend npm run lint: **salida 0** para el script nuevo y el código existente. No se cambiaron sus servicios, SQL ni contratos. No se ejecutaron suites que preparan tablas temporales para esta corrección: la comprobación de datos fue de solo lectura.

Contraste de tokens calculado con luminancia sRGB:

| Pareja | Claro | Oscuro |
|---|---:|---:|
| Texto / tarjeta | 15,06:1 | 16,91:1 |
| Texto secundario / tarjeta | 6,10:1 | 10,37:1 |
| Texto secundario / superficie secundaria | 5,30:1 | 9,01:1 |
| Texto secundario / campo | Conservado | 10,91:1 |
| Texto secundario / capa elevada | Conservado | 8,36:1 |
| Texto de botón / primario | Conservado | 9,67:1 |
| Borde de control / tarjeta | 3,71:1 | 4,48:1 |
| Marcas de gráficos / tarjeta, mínimo | 4,33:1 | 6,40:1 |

Los textos de categorías y cantidades usan colores de texto, no el dorado como texto pequeño. No es una certificación de accesibilidad ni una auditoría de cada píxel. El recorrido usa Chrome con movimiento reducido y tamaños de escritorio/móvil; no sustituye pruebas en dispositivos físicos u otros navegadores.

## Archivos y evidencia

Código de presentación: frontend/src/index.css; components/ui/SelectorTema.tsx; components/ui/Admin.module.css; features/dashboard/pages/DashboardPage.tsx; features/dashboard/components/GraficosDashboard.tsx. Los dos archivos de tarjetas solo cambian referencias a tokens para conservar el claro. No se cambiaron sus elementos ni eventos.

Pruebas: frontend/tests/dashboard-graficos.test.mjs y backend/scripts/verificar-paleta-dashboard.local.mjs. Diseño guardado: design-system/paillardelle-documental/MASTER.md y pages/dashboard.md, con una nota posterior limitada al color.

[Evidencia previa](qa-paleta-oscura-20261102/antes.json), [evidencia final](qa-paleta-oscura-20261102/despues.json), [contraste](qa-paleta-oscura-20261102/contraste.json) e [índice de capturas](qa-paleta-oscura-20261102/CAPTURAS.md).

La aplicación permanece disponible para revisión local en http://localhost:5173/dashboard. No hay verificación ni cambio de publicaciones remotas.
