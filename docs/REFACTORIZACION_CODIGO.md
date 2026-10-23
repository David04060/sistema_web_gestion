# Refactorización, limpieza y documentación del código

Fecha de verificación: 22 de octubre de 2026. Proyecto local: `C:\Users\David\Sistema_Web_Final`.

## Resultado y alcance

Se revisaron los módulos de Autenticación, Dashboard, Roles, Oficinas, Usuarios, Tipos documentales, Ubicaciones, Documentos, Movimientos y SíseVe, junto con componentes, hooks, transporte, middlewares, seguridad, unidades de trabajo, pruebas y scripts propios. Se mantuvieron contratos, reglas institucionales, consultas SQL, esquema, datos institucionales, diseño y carga diferida. No se instalaron dependencias ni se publicó el sistema.

El inventario final contiene **183 archivos TS/TSX/MJS y 1208 implementaciones documentadas**, incluidos componentes, hooks, funciones internas, métodos, constructores, accesores y callbacks. Además se revisaron los diez CSS y los cuatro SQL históricos; las ocho funciones PL/pgSQL del SQL documental se documentaron externamente para conservar esos archivos sin alteraciones. La configuración declarativa no contiene funciones propias adicionales.

## Evaluación inicial

La arquitectura ya separaba rutas, controladores, servicios y repositorios; los esquemas y las suites cubrían reglas críticas. El problema principal era la documentación incompleta y desigual, con componentes y controladores comprimidos en líneas extensas. Algunos nombres locales dificultaban distinguir datos de consulta y presentación; no se realizó un renombrado masivo de variables estables sin beneficio funcional o de mantenimiento.

La copia inicial, reanalizada con el detector final y excluyendo el auditor creado durante esta revisión, contiene 172 archivos ejecutables y 1197 implementaciones: 165 con JSDoc detectado y 1032 sin él. El inventario inicial bruto se conserva como evidencia del primer detector; [cobertura-inicial-comparable.json](refactorizacion/cobertura-inicial-comparable.json) permite una comparación con el mismo criterio de detección final. No se interpreta la presencia de un comentario como una certificación automática de su precisión.

Se detectaron concretamente:

- Cinco pantallas de ubicaciones y dos formularios agrupados en archivos que mezclaban responsabilidades de varias vistas.
- Gestión del diálogo móvil embebida en la composición del layout.
- Envíos de formularios de tipos y ubicaciones dentro de expresiones JSX extensas.
- Etiquetas repetidas de estados en Dashboard y badges.
- Estados documentales del repositorio tipados como string sin limitar sus valores aprobados.
- Proyecciones de administración de SíseVe que dependían del tipo por defecto del cliente PostgreSQL.
- Callbacks, métodos internos y controladores sin explicación de su efecto, validaciones o condiciones de ejecución.
- Comentarios contradictorios: anulación que afirmaba conservar el estado de circulación y documentación histórica del frontend que ya no representaba los diez módulos.

## Estado inicial de las pruebas

Antes de modificar código de aplicación se ejecutaron TypeScript, ESLint, build y pruebas de ambos proyectos, además de integración documental y Dashboard. Todo pasó: frontend 43, backend 27, documental 35, regresiones hijas 33 y Dashboard 10. La suite documental confirmó limpieza QA y comparación institucional intacta. Los resultados se registraron en [estado-inicial.json](refactorizacion/estado-inicial.json).

## Refactorizaciones realizadas

| Área | Mejora | Comportamiento preservado |
| --- | --- | --- |
| Layout | `useMenuMovil` concentra referencia, apertura, cierre y limpieza del observador; `GrupoEnlaces` presenta grupos autorizados. | Diálogo nativo, Escape, devolución del foco, cierre al navegar y punto de quiebre de 801 px. |
| Ubicaciones | Una pantalla por archivo y formularios separados de estante y archivador. Los archivos originales conservan reexportaciones. | Rutas, filtros, consultas mínimas por pantalla, permisos y exportaciones utilizadas por lazy. |
| Formularios | Envíos de `TipoForm`, `EstanteForm` y `ArchivadorForm` extraídos del JSX a funciones explícitas. | Esquemas, valores por defecto, errores por campo, secuencia de guardado y estados de envío. |
| Estados visuales | Etiquetas centralizadas en `lib/estados-documentales.ts`. | Los mismos textos, tonos, fallback de badges y cinco estados existentes. |
| Tipos backend | Uniones de estados documental y de movimiento; proyecciones tipadas de configuración, autorización y acceso propio de SíseVe. | Sin validadores ni campos de respuesta nuevos; las anotaciones de tipo se eliminan al compilar. |
| Límites SíseVe | Identificación de cuenta compartida por las dos configuraciones de rate limit. | Mismo ID, orden posterior a autenticación, límites, ventana temporal y tratamiento de solicitudes exitosas. |
| Código y documentación | Bloques y JSX legibles, JSDoc en implementaciones propias y explicación próxima a concurrencia, sesión, autorización y errores. | Se compararon tokens de JavaScript emitido para detectar cambios ajenos a las extracciones previstas. |
| Guías | Actualización del README general y frontend; guía de los diez módulos y referencia de funciones SQL. | No se editó SQL histórico ni se aplicó DDL para documentar funciones. |

No se sustituyeron servicios correctos por abstracciones nuevas. En particular, las unidades de trabajo administrativas, restringidas y de solo lectura conservan sus diferencias de permisos, conexiones y aislamiento. El formato de consultas complejas conserva exactamente sus cadenas y parámetros; la documentación explica sus CTE, proyecciones y predicados sin reescribir reglas SQL.

## Mejoras y documentación por módulo

| Módulo | Partes revisadas y documentadas |
| --- | --- |
| Autenticación | Credenciales, scrypt, JWT y reconsulta de actividad/versión; almacenamiento por pestaña; vencimiento absoluto, revalidación compartida, descarte de respuestas antiguas y limpieza de eventos. |
| Dashboard | Instantánea de solo lectura; contadores SQL según alcance; exclusión expresa de SíseVe; listas limitadas; actualización por foco y etiquetas compartidas. |
| Roles | Configuración del catálogo compartido, nombres reservados, unicidad normalizada, asociaciones y controladores propios. |
| Oficinas | Catálogo, protección de Dirección/Mesa de Partes, conservación de IDs y asociaciones, formularios compartidos y autorización administrativa. |
| Usuarios | Asignaciones institucionales, protección del último administrador, cambios de actividad/contraseña, invalidez de JWT y conservación de documentos e historial. |
| Tipos documentales | Reservas, prefijos históricos, proyección constante para tipos restringidos y envío de formulario separado del JSX. |
| Ubicaciones | Alcance de consulta y edición, oficina fija, padre del archivador, responsable histórico, duplicados y separación de pantallas y formularios. |
| Documentos | Contenido frente a recorrido, filtros y paginación autorizados, código generado, corrección/anulación, decisiones y auditoría; autorización separada de salida. |
| Movimientos | Orden de bloqueos, reconsulta, salida/recepción, rechazo sin transferencia, recuperación y cancelación física atómicas. |
| SíseVe | JWT, permiso individual y clave por operación; hash interno frente a proyección pública; aislamiento asíncrono; reutilización de servicios y limpieza de clave en formularios. |

La explicación completa de comunicación entre capas y componentes está en [ARQUITECTURA_CODIGO.md](ARQUITECTURA_CODIGO.md). Las ocho funciones SQL se describen con entradas, retornos, errores y reglas en [FUNCIONES_SQL.md](refactorizacion/FUNCIONES_SQL.md).

## Cobertura de documentación

| Grupo | Archivos ejecutables | Implementaciones | Documentadas |
| --- | ---: | ---: | ---: |
| Frontend `src` | 79 | 395 | 395 |
| Backend `src` | 70 | 260 | 260 |
| Pruebas frontend | 8 | 152 | 152 |
| Pruebas backend | 22 | 377 | 377 |
| Scripts frontend | 2 | 23 | 23 |
| Scripts backend | 2 | 1 | 1 |
| **Total** | **183** | **1208** | **1208** |

El total distingue 482 implementaciones declaradas y 726 callbacks. No se eximieron callbacks por ser anónimos. Las 32 firmas de funciones sin cuerpo son contratos de tipos: se documentan con su interfaz u operación propietaria y no se cuentan como implementaciones pendientes. Hay 31 archivos sin implementaciones, principalmente esquemas declarativos, tipos, configuración, composición y reexportaciones; no corresponde inventar funciones ni añadir JSDoc por cada instrucción.

Los comentarios se revisaron para describir el efecto real, incluidos casos deliberadamente vacíos de adaptadores de prueba. Se corrigieron diferencias entre limpiar una promesa pendiente y limpiar el JWT, entre cerrar sesión propia y revalidarla, y entre limpiar campos antes o después de una operación. El auditor comprueba cobertura sintáctica; la precisión se revisó además leyendo contratos, condiciones y secuencias críticas. No se afirma que el análisis sintáctico pueda demostrar la calidad semántica de un comentario.

Evidencias: [inventario-final.json](refactorizacion/inventario-final.json), [cobertura-resumen.json](refactorizacion/cobertura-resumen.json). Comando repetible desde la raíz:

```powershell
node frontend/scripts/auditar-documentacion.mjs --check
```

## Archivos creados, modificados y eliminados

El manifiesto de código, configuración y README registra **154 modificados, 11 creados y 22 sin cambios**. No se eliminó ningún archivo de aplicación. Los dos archivos originales de ubicaciones ahora son puntos de reexportación compatibles. Los documentos e inventarios de esta revisión son artefactos adicionales listados al final.

Los once archivos ejecutables creados son:

- `frontend/scripts/auditar-documentacion.mjs`.
- `frontend/src/hooks/useMenuMovil.ts`.
- `frontend/src/lib/estados-documentales.ts`.
- `frontend/src/features/ubicaciones/pages/UbicacionesPage.tsx`.
- `frontend/src/features/ubicaciones/pages/DetalleEstantePage.tsx`.
- `frontend/src/features/ubicaciones/pages/DetalleArchivadorPage.tsx`.
- `frontend/src/features/ubicaciones/pages/FormularioEstantePage.tsx`.
- `frontend/src/features/ubicaciones/pages/FormularioArchivadorPage.tsx`.
- `frontend/src/features/ubicaciones/components/EstanteForm.tsx`.
- `frontend/src/features/ubicaciones/components/ArchivadorForm.tsx`.
- `backend/src/shared/documental/estados.ts`.

Los cambios de aplicación con organización o deduplicación están en `AdminLayout.tsx`, `EstadoBadge.tsx`, `DashboardPage.tsx`, `TipoForm.tsx`, los puntos de entrada de ubicaciones y `siseve.routes.ts`. Los repositorios documental y de movimientos reciben tipos de estados; el de SíseVe recibe tipos de proyecciones. Los demás cambios ejecutables son documentación y legibilidad preservando tokens emitidos. Los dos `tsconfig` solo cambian comentarios al español. Ninguna opción de compilación, dependencia o paleta cambia.

La lista completa por archivo y cobertura está en [ARCHIVOS.md](refactorizacion/ARCHIVOS.md) y [archivos.json](refactorizacion/archivos.json). No existe `.git` en este directorio; la comparación utiliza la copia de texto inicial, no un diff Git supuesto. Los auxiliares temporales de inspección permanecen dentro de `.private/refactorizacion/`, excluido por `.gitignore`; no forman parte de la aplicación ni del conteo de código mantenido.

## Verificación de arquitectura y conservación

El grafo de 149 archivos de aplicación y 356 relaciones locales de ejecución no presenta ciclos. No se detectaron imports directos controlador→repositorio, repositorio→servicio ni ruta→repositorio. Se incluyen imports dinámicos literales y reexportaciones. Este análisis no pretende demostrar ausencia de toda forma posible de acoplamiento. Evidencia: [arquitectura.json](refactorizacion/arquitectura.json).

La comparación de tokens de JavaScript emitido encontró diferencias previstas en siete archivos de aplicación: layout, badge, Dashboard, formulario de tipos, los dos puntos de entrada de ubicaciones y rutas de SíseVe. El auditor nuevo también cambia durante su elaboración. El resto conserva sus tokens ejecutables; las anotaciones de tipos no alteran la salida. No se interpreta esta comparación como sustituto de las regresiones de integración. Evidencia: [comparacion-ejecutable.json](refactorizacion/comparacion-ejecutable.json).

La entrada de Vite conserva exactamente **370940 bytes** antes y después de la refactorización. Los módulos administrativos siguen fuera de la descarga inicial según la prueba de grafo del build. Se mantienen React.lazy, Suspense, AuthProvider y los guards. No se aumentó el límite de advertencia. Los diez CSS y la paleta se conservaron; sus assets generados mantienen sus nombres/hash de contenido.

## Pruebas finales y resultados

| Verificación | Resultado |
| --- | --- |
| Frontend `npm run typecheck`, `npm run lint`, `npm run build` | Aprobados, sin advertencias ESLint. |
| Frontend `npm test` | 43 aprobadas, 0 fallos. |
| Backend `npm run typecheck`, `npm run lint`, `npm run build` | Aprobados, sin advertencias ESLint. |
| Backend `npm test` | 27 aprobadas, 0 fallos. |
| Integración documental y concurrencia | 35 aprobadas, 0 fallos. |
| Regresiones hijas en QA | Administración 14, catálogos 14, consultas 5; todas aprobadas con rollback dentro de QA. |
| Integración Dashboard HTTP/PostgreSQL | 10 aprobadas, 0 fallos. |
| Revisión integral HTTP/PostgreSQL/Chrome | 12 aprobadas, 0 fallos. |
| Auditor de documentación | 1208/1208 implementaciones; 0 pendientes. |

Los números de las suites son los que reporta Node Test y pueden incluir la prueba contenedora; no son un conteo de aserciones individuales. Las comprobaciones HTTP/PostgreSQL son diferentes de los tests con repositorio o Fetch simulados.

La integración ejecutó registros, decisiones sin cambio de estado, salidas, recepciones, derivación posterior, rechazo, recuperación, cancelación, corrección, historial, códigos con doce conexiones concurrentes, dos salidas simultáneas, aislamiento entre usuarios, JWT alterados/vencidos, desactivación, cambio de contraseña y restricciones de SíseVe y Dashboard.

Chrome ejecutó siete grupos de flujo y 37 combinaciones de ruta/perfil a 1440, 768 y 390 px: 111 comprobaciones de vistas. La suite incluye navegación, recargas, restauración y cierre de sesión, formularios y confirmaciones reales, filtros, menú móvil, Escape y restitución del foco, rutas protegidas y confidencialidad. Registró cero errores JavaScript, cero desbordamientos y cero controles sin etiqueta en el alcance comprobado. El contraste básico cubrió 105 revisiones con 2529 textos y 171 controles, sin fallos. Son verificaciones automatizadas de navegador; no se presenta una inspección manual adicional ni una certificación WCAG completa.

Resultados: [verificacion-final.json](refactorizacion/verificacion-final.json), [RESULTADOS_REVISION_FINAL.json](RESULTADOS_REVISION_FINAL.json), [RESULTADOS_INTEGRACION_DOCUMENTAL.json](RESULTADOS_INTEGRACION_DOCUMENTAL.json) y [RESULTADOS_SISEVE.json](RESULTADOS_SISEVE.json). Las dos últimas suites conservan sus fechas de metadatos históricas codificadas en el verificador; el resumen de esta revisión identifica la ejecución actual. Las capturas se generaron en `backend/.private/revision-final/` con fixtures QA.

## PostgreSQL y pendientes

La suite confirmó que se utilizaron bases QA efímeras, que se eliminaron y que estructura y huellas de datos institucionales quedaron intactas. Se detectó el esquema aprobado y no se reaplicó DDL institucional. La inspección agregada registró 32 claves foráneas y 32 triggers; cero restricciones sin validar, triggers deshabilitados, estados inválidos, códigos ausentes/duplicados, autorizaciones incoherentes, ubicaciones incompatibles o circulaciones duplicadas.

No se encontraron regresiones funcionales que requirieran cambiar el comportamiento durante esta refactorización. Permanecen decisiones operativas ya identificadas y verificadas nuevamente: la conexión configurada conserva privilegios de superusuario/CREATEDB y la clave institucional de SíseVe no está configurada. No se modificaron privilegios ni se creó una clave privada. Además, los comandos de integración antiguos con sandbox transaccional deben seguir ejecutándose solo dentro del wrapper QA; cambiar sus guardas sería una tarea aparte explícita.

El código queda refactorizado y verificado para los escenarios existentes, con documentación reproducible. Esta entrega no equivale a autorización de publicación ni a habilitación institucional sin resolver esas decisiones de configuración. No hubo instalación de dependencias, commit, push ni despliegue.

## Artefactos de esta revisión

- Este informe y `ARQUITECTURA_CODIGO.md`.
- `refactorizacion/FUNCIONES_SQL.md` y `refactorizacion/ARCHIVOS.md`.
- Inventarios inicial, final y de trabajo; cobertura comparable y resumen.
- Manifiesto de archivos, comparación de tokens y grafo de arquitectura.
- Estado inicial y resumen de verificación final.
