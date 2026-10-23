# Optimización y revisión técnica final

Fecha: 22 de octubre de 2026. Entorno local; sin publicación.

## Resultado

La advertencia del chunk principal quedó resuelta mediante carga diferida real. El chunk de entrada pasó de **504.054 bytes a 370.940 bytes**, una reducción del **26,41 %**, sin elevar el umbral de advertencia de Vite.

El diseño y los tokens globales se conservaron. Solo se corrigió el contraste de los bordes de campos y del placeholder del login usando el gris secundario que ya pertenecía a la paleta aprobada. Los textos negros permanecen negros. No hubo cambios de esquema, datos institucionales, endpoints ni reglas documentales.

## 1. Diagnóstico del bundle

`AppRoutes.tsx` importaba estáticamente todas las pantallas, incluido el layout privado y los módulos administrativos. Por ello una visita anónima al login descargaba el mismo archivo con todo el código de las páginas.

El análisis del grafo de Vite identificó como dependencias predominantes React DOM, Zod, React Router y React Hook Form. Entre las funcionalidades con más código figuran SíseVe, Documentos, Usuarios y Ubicaciones. Los detalles por módulo están en `optimizacion/bundle-antes.json` y `bundle-despues.json`.

Los `renderedLength` por módulo del plugin describen contribuciones previas a la minificación final y son orientativos; no deben sumarse como si fueran los bytes comprimidos finales. La comparación de archivos y de rutas se realiza leyendo los artefactos finales y observando los recursos solicitados por Chrome.

### Optimización aplicada

- `React.lazy` declara las pantallas y el layout fuera de los componentes.
- Cada ruta descarga su pantalla al renderizarla. Los archivos que ya agrupaban varias pantallas pequeñas, como Roles, Oficinas o Tipos, permanecen agrupados por funcionalidad.
- `Suspense` muestra carga accesible. El límite interior conserva sidebar y topbar mientras se carga una pantalla privada; el proveedor de autenticación permanece fuera de estos límites.
- `RutaPrivada` y `SoloAdministrador` se evalúan antes de renderizar las páginas diferidas. Chrome comprobó que una cuenta ordinaria no descarga las pantallas de Usuarios/Roles/Oficinas al visitar rutas generales ni al intentar `/usuarios`.
- La división del código es una medida de rendimiento; no convierte los archivos JavaScript estáticos en información secreta. La autorización de datos y operaciones sigue en Express/PostgreSQL.
- `ErrorRuta` captura fallos de carga/renderizado con un mensaje público y permite recargar. La recarga vuelve a verificar `/me` y no reenvía operaciones POST. Se ensayó abortando realmente un chunk y volviendo a descargarlo.

Se utilizaron los mecanismos normales de Vite para extracción de CSS y dependencias compartidas. No se modificó `vite.config.ts`, no se elevaron límites y no se agregaron dependencias.

Referencias técnicas: [React.lazy](https://react.dev/reference/react/lazy), [Suspense](https://react.dev/reference/react/Suspense), [Vite: producción](https://vite.dev/guide/build).

## 2. Comparación antes/después

Unidades decimales: 1 kB = 1.000 bytes. Las cifras gzip se calcularon de forma homogénea con Node y nivel 9; no representan una captura de compresión HTTP del servidor de producción. Pueden diferir de la estimación mostrada por el log de Vite.

| Medida | Antes | Después | Reducción |
| --- | ---: | ---: | ---: |
| Chunk JS de entrada | 504,05 kB | 370,94 kB | 26,41 % |
| Entrada gzip calculada | 146,07 kB | 112,62 kB | 22,90 % |
| JS solicitado en login frío | 504,05 kB | 407,42 kB | 19,17 % |
| JS solicitado en Dashboard frío | 504,05 kB | 383,73 kB | 23,87 % |
| JS solicitado en Documentos frío | 504,05 kB | 386,21 kB | 23,38 % |
| JS solicitado en SíseVe frío | 504,05 kB | 433,31 kB | 14,04 % |
| JS solicitado en Usuarios por Administrador | 504,05 kB | 385,95 kB | 23,43 % |

La descarga real de una ruta incluye el chunk de entrada y sus dependencias compartidas/diferidas necesarias. Por eso el login no descarga únicamente 370,94 kB: también utiliza su formulario y React Hook Form.

**Coste de la división:** la suma de todos los JS emitidos pasa de 504,05 a 519,65 kB y de un archivo a 38 chunks. La suma gzip de todos los archivos por separado pasa de 146,07 a 165,07 kB. Existe coste de envolturas, enlaces entre archivos y menor compresión conjunta. La mejora comprobada consiste en descargar menos código por pantalla, especialmente antes de necesitar la administración, no en reducir todo el código instalado ni en prometer una velocidad proporcional al porcentaje de bytes.

Los recursos compartidos se reutilizan mediante la caché del navegador. Las mediciones son navegaciones locales de muestra, no un benchmark estadístico, un ensayo con red móvil ni una evaluación de Web Vitals. Los tiempos registrados incluyen esperas de estabilización y no se usan como promesa de latencia.

## 3. Consultas y solicitudes HTTP

### SíseVe

Antes, layout y página ejecutaban independientemente `GET /api/siseve/acceso`; Chrome registró dos peticiones en una visita fría a `/siseve`.

Ahora `AccesoSiseveProvider`, dentro del layout autenticado, comparte ese metadato entre navegación y página. La visita fría produce una sola petición. El transporte y su esquema mínimo se separaron de los contratos documentales para no arrastrar el módulo restringido al cargar la navegación.

No se comparten claves ni contenido. No se almacena un permiso en sessionStorage ni se crea un desbloqueo. Cada operación sigue exigiendo JWT, autorización individual y contraseña adicional en el backend. El contexto desaparece al desmontar el layout; puede recargarse mediante el mecanismo existente.

### Revalidación JWT

`AuthSession.recuperar()` comparte únicamente una revalidación `/me` que ya esté pendiente para la misma versión de operación. Eventos simultáneos de foco, restauración de página o visibilidad dejan de lanzar verificaciones competidoras. Al terminar se elimina esa referencia: la siguiente revalidación vuelve a consultar al servidor.

Logout, login, vencimiento y otras invalidaciones cambian la versión y no pueden reutilizar la promesa anterior. Las pruebas comprueban que una respuesta tardía no resucita una sesión ni retrasa su vencimiento absoluto. No se introdujo una caché con TTL ni se amplió la duración JWT.

`AuthProvider` y su posición en la aplicación no se modificaron.

### Ubicaciones

El hook anterior consultaba opciones, estantes y archivadores en las tres pantallas, aunque no todas necesitaban las tres respuestas.

| Pantalla | Antes, según implementación inspeccionada | Después, comprobado en Chrome |
| --- | --- | --- |
| Listado de ubicaciones | Opciones + estantes + archivadores | Estantes + archivadores |
| Formulario de estante | Opciones + estantes + archivadores | Opciones |
| Formulario de archivador | Opciones + estantes + archivadores | Estantes |

Las consultas de detalle de un registro que se está editando continúan cuando corresponden. Se reutilizan los mismos endpoints autorizados. No se modificaron SQL, índices ni repositorios backend.

## 4. UI/UX y accesibilidad

La matriz cubre las mismas 37 rutas/pantallas de los diez módulos, ahora a **1440, 768 y 390 píxeles**: 111 comprobaciones de viewport sobre el build productivo servido por Vite preview.

Se comprobaron navegación, estado activo, sidebar/modal, Escape, retorno del foco, salto al contenido, formularios, validaciones, tablas, filtros, paginación, confirmaciones y mensajes. Las pantallas con tablas anchas mantienen el scroll dentro del contenedor, sin desbordamiento horizontal de la página en los tamaños examinados.

### Corrección limitada de contraste

El borde `#D7E0E0` sobre blanco tenía aproximadamente 1,34:1 de contraste. En campos vacíos, el borde constituye información relevante para localizar el control. La guía [W3C sobre contraste no textual](https://www.w3.org/WAI/WCAG22/understanding/non-text-contrast.html) exige 3:1 para ese indicador.

Se usa ahora `--texto-secundario` (`#6B7280`, ya aprobado) en los bordes de inputs/selects/textarea y del contenedor de contraseña, con aproximadamente 4,83:1 sobre blanco. El hover utiliza el principal ya existente. El placeholder del login también utiliza ese gris. Las tarjetas conservan sus bordes suaves; no se aplicó el criterio de campos vacíos a todas las divisiones decorativas.

No se cambiaron dimensiones, radios, disposición de pantallas, tipografía ni valores de los tokens de la paleta. `index.css` conserva su hash original. Solo dos hojas cambiaron por esta corrección: `Admin.module.css` y `Login.module.css`.

La comprobación automatizada examina texto visible con umbral 4,5:1, o 3:1 para texto grande, y bordes de campos activos con umbral 3:1. Considera fondos sólidos heredados y no pretende resolver todas las combinaciones posibles de transparencias, imágenes, pseudoelementos o estados. La auditoría es básica y no constituye certificación WCAG ni prueba con lectores de pantalla. Se comprobaron 2.529 muestras de texto y 171 campos en las pantallas privadas, más seis campos del login en tres tamaños, sin fallos en esas comprobaciones.

## 5. Funcionalidad y seguridad

Se conservaron los diez módulos, los contratos y los cinco estados documentales aprobados. Se verificaron:

- Login real, restauración y recargas, logout, JWT alterados/vencidos y cuenta inactiva.
- Cambio de contraseña y rechazo de tokens/credenciales anteriores.
- Protección de rutas y endpoints; denegación administrativa por URL directa.
- Usuarios, Roles, Oficinas, Tipos, Estantes y Archivadores mediante operaciones autorizadas.
- Registro, código SQL, búsqueda, edición con motivo e historial.
- Circuito completo de Mesa/Dirección, autorización conservando `PENDIENTE_DECISION`, salida, recepción, derivación, rechazo, recuperación y cancelación.
- Actualización de indicadores y alcance del Dashboard.
- SíseVe: autorización individual, clave por operación, revocación/rotación, límites y exclusión en consultas generales.
- Concurrencia y restricciones mediante la suite integral existente.

Los archivos de aplicación del backend no cambiaron. Las escrituras de prueba se realizaron exclusivamente en bases QA efímeras, posteriormente eliminadas. Los verificadores compararon estructura y huellas de registros institucionales y las encontraron intactas.

## 6. Verificación y resultados

| Comprobación | Resultado |
| --- | --- |
| TypeScript frontend y backend | Aprobado |
| ESLint frontend y backend | Aprobado |
| Compilación frontend | Aprobada, sin advertencia de chunk >500 kB |
| Compilación backend | Aprobada |
| Pruebas frontend | 43 aprobadas: incluyen el grafo compilado y dos regresiones nuevas de sesión |
| Pruebas backend | 27 aprobadas |
| Suite integral documental/SíseVe | 35 aprobadas |
| Regresiones administrativas, catálogos y consultas en QA | 14 + 14 + 5 aprobadas |
| Dashboard HTTP/PostgreSQL | 10 aprobadas |
| Revisión final HTTP/PostgreSQL/Chrome | 12 aprobadas, contando la principal y sus subcasos |
| Chrome productivo | 37 pantallas/rutas × 3 tamaños, recargas y guards |
| Red y chunks | 10 navegaciones frías finales más escenario de error/carga/teclado |
| Texto, controles y referencias accesibles | Comprobaciones básicas aprobadas en las pantallas privadas de la matriz |

El verificador de red también fuerza un fallo real de descarga, comprueba el mensaje público, recupera la pantalla recargando y retrasa un chunk para comprobar `Suspense`. Las transiciones concurrentes pueden conservar la pantalla anterior mientras descargan; el estado de carga se verifica mediante navegación fría, donde sí debe aparecer.

Los conteos de Node incluyen pruebas principales/subpruebas y no son una suma de procesos institucionales distintos. Las mediciones originales y finales usan cuentas y documentos de QA.

## 7. Archivos modificados

Aplicación:

- `frontend/src/routes/AppRoutes.tsx`: pantallas/layout diferidos y límites de carga/error.
- `frontend/src/components/layout/AdminLayout.tsx`: proveedor compartido del metadato SíseVe y límite interior.
- `frontend/src/components/ui/CargaRuta.tsx`: nuevo fallback accesible.
- `frontend/src/components/ui/ErrorRuta.tsx`: nuevo manejo de fallo de pantalla.
- `frontend/src/features/auth/services/AuthSession.ts`: revalidaciones pendientes compartidas por versión.
- `frontend/src/features/siseve/context/AccesoSiseveContext.ts`: nuevo contexto tipado.
- `frontend/src/features/siseve/context/AccesoSiseveProvider.tsx`: nueva consulta compartida del layout.
- `frontend/src/features/siseve/hooks/useAccesoSiseve.ts`: consumidor del contexto.
- `frontend/src/features/siseve/api/acceso.api.ts`: nuevo transporte mínimo.
- `frontend/src/features/siseve/schemas/acceso.schema.ts`: nuevo contrato mínimo.
- `frontend/src/features/siseve/api/siseve.api.ts` y `schemas/siseve.schema.ts`: reexportaciones compatibles.
- `frontend/src/features/ubicaciones/hooks/useUbicaciones.ts` y `pages/UbicacionesPages.tsx`: consultas ajustadas a cada pantalla.
- `frontend/src/components/ui/Admin.module.css` y `frontend/src/features/auth/styles/Login.module.css`: contraste de campos, sin nueva paleta.

Pruebas, análisis y documentación:

- `frontend/scripts/analizar-bundle.mjs`: nuevo análisis con Vite y módulos reales.
- `frontend/package.json`: comando `analyze:bundle`.
- `frontend/eslint.config.js`: incluye scripts de análisis.
- `frontend/tests/routes.test.mjs`: nuevo contrato del grafo compilado.
- `frontend/tests/session.test.mjs`: nuevas regresiones de revalidación concurrente y logout.
- `backend/tests/optimizacion.browser.mjs`: nuevo verificador productivo de recursos/HTTP y carga.
- `backend/tests/accesibilidad-browser.mjs`: nuevo verificador básico de contrastes.
- `backend/tests/revision-final.integration.mjs`: medición opcional antes/después en la misma QA.
- `backend/tests/revision-final.browser.mjs`: usa preview productivo, tablet y contraste.
- `README.md`: enlace al estado técnico actual.
- `docs/OPTIMIZACION_FINAL.md` y `docs/optimizacion/*.json`: informe y evidencia.

Las suites existentes regeneran sus informes documentales y de revisión. No se añadieron dependencias ni se modificaron archivos de bloqueo, configuración privada o `vite.config.ts`.

## 8. Evidencias y reproducción

- `optimizacion/bundle-antes.json` / `bundle-despues.json`: archivos finales y contribuciones de módulos.
- `optimizacion/red-antes.json` / `red-despues.json`: recursos solicitados, HTTP y recargas.
- `optimizacion/comparacion.json` / `comparacion-rutas.json`: diferencias calculadas.
- `optimizacion/estilos-antes.json` / `estilos-verificacion.json`: conservación de tokens y hojas cambiadas.
- `optimizacion/verificacion-final.json`: resumen final de pruebas y cobertura.
- `optimizacion/login-accesibilidad.json`: teclado, foco y contraste del login.
- `RESULTADOS_REVISION_FINAL.json`: pantallas, contraste, origen PostgreSQL y limpieza QA.
- `backend/.private/revision-final/`: capturas de los tres tamaños, excluidas por `.gitignore`.

Desde frontend:

```powershell
npm run typecheck
npm run lint
npm test
npm run build
npm run analyze:bundle -- despues
```

El JSON `antes` se capturó antes de modificar las rutas. Ejecutar de nuevo una fase llamada `antes` sobre el código ya optimizado no recrea el estado original; no debe sobrescribirse esa evidencia como si fuera otro baseline.

Desde backend, con el build final y el JSON `bundle-despues` disponibles:

```powershell
npm run typecheck
npm run lint
npm test
$env:QA_OPTIMIZACION='despues'
npm run test:revision-final
$env:VALIDAR_FLUJO_DOCUMENTAL='ROLLBACK_Y_QA_AISLADA'
node --test tests/flujo-migration.integration.mjs
npm run test:dashboard
```

La QA requiere las herramientas PostgreSQL existentes, permiso para crear/eliminar la propia base temporal, Chrome y el Playwright ya instalado en el runtime local. El import de Playwright usa la ruta de esta máquina y debe adaptarse en otro entorno. El análisis no es una dependencia del producto.

## 9. Pendientes y preparación para producción

La optimización quedó funcionalmente verificada en el build productivo local. La advertencia inicial está resuelta y no quedaron fallos reproducibles en los procesos examinados.

**Siguen pendientes antes de habilitación institucional:**

1. Sustituir la conexión PostgreSQL superusuario por credenciales de aplicación con privilegios mínimos, separadas de mantenimiento/QA. No se cambiaron permisos en esta tarea.
2. Configurar privadamente la clave y autorizaciones institucionales SíseVe; la QA no configura el entorno real.
3. Verificar el servidor real: TLS, proxy, fallback de SPA en recargas, caché y publicación atómica de assets con hash. Mantener assets de versiones aún abiertas evita fallos de chunks; el error boundary permite recuperarse pero no reemplaza esa configuración.
4. Realizar restauración integral de un respaldo, aceptación institucional y pruebas de carga/red representativas. No se hicieron aquí ni deben presentarse como completadas.
5. Una auditoría completa de accesibilidad y dependencias/seguridad requiere alcance adicional; las comprobaciones actuales no certifican ausencia de todas las vulnerabilidades o barreras.

No se publicó el sistema ni se realizaron commit/push. La reducción de bytes y las regresiones locales son evidencia de mejora técnica, no una autorización automática de producción.

