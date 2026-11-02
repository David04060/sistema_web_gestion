# Ajustes de usabilidad local — 1 de noviembre de 2026

Seguimiento: [revisión integral del sistema nuevo](REVISION_INTEGRAL_SISTEMA_NUEVO_LOCAL.md). En esa intervención posterior sí se aplicó el incremental 004, y la fecha de registro también pasó a mostrarse en las tarjetas móviles. Las afirmaciones siguientes describen el alcance de la etapa de usabilidad inicial.

## Alcance y conservación

Trabajo sobre el proyecto existente y PostgreSQL local `sistema_web_documental_final`, host `::1`, puerto `5432`. No se aplicó ninguna migración ni modificación de esquema en esta intervención. No se modificó `sistema_web_final` ni producción. No hubo commit, push, despliegue ni creación de bases adicionales.

Se preservaron los cambios locales anteriores. Los permisos documentales y la lógica de registro y carga a R2 permanecen en los módulos existentes.

## Cambios

- Oficinas tiene listado, detalle y formulario de nombre separados: `/oficinas`, `/oficinas/nuevo`, `/oficinas/:id` y `/oficinas/:id/editar`.
- La actividad se cambia exclusivamente mediante una acción con motivo y confirmación integrada en la pantalla. El formulario de nombre no contiene un checkbox de actividad. Dirección y Mesa de Partes conservan sus protecciones, también por API.
- Usuarios presenta un enlace visible «Ver detalle» por fila, con el mismo destino que el nombre de la cuenta.
- Registro documental utiliza como máximo dos columnas y una en móvil. Asunto y observaciones tienen ancho completo. Se mantienen los campos, permisos y validaciones existentes.
- El PDF seleccionado tiene bloques separados de metadatos, estado «Aún no enviado» y previsualización local. La selección no inicia una carga. El visor conserva su implementación PDF.js y limita el desplazamiento al área del PDF.
- Documentos mantiene una única tabla y un único conjunto de enlaces. A anchos de hasta 900 px las filas se presentan como tarjetas con etiquetas legibles; se ocultan únicamente tipo y fecha, conservando código, asunto, clasificación, registrador, situación, ubicación disponible y acceso al detalle. En escritorio las columnas se conservan y el desplazamiento de la tabla queda dentro de su contenedor.
- Se unificaron tamaños mínimos y espaciado de botones y se evitó que «Ver detalle» se divida en fragmentos en la tabla documental.

## Contratos de oficinas

Todos requieren permisos administrativos existentes y vuelven a comprobar el actor en el servidor.

| Método y ruta | Contrato |
| --- | --- |
| `GET /api/oficinas/:id` | `{ oficina: { id: string, nombre: string, activa: boolean } }` |
| `PUT /api/oficinas/:id` | `{ nombre, motivo }`; modifica únicamente el nombre |
| `POST /api/oficinas/:id/actividad` | `{ activa: boolean, motivo }`; modifica únicamente la actividad |

El cambio de actividad mantiene las asignaciones existentes. Los cambios reales se auditan con actor, motivo y estado anterior/posterior. Una solicitud que mezcle `activa` en el contrato de renombrado se rechaza. La confirmación integrada exige un primer envío para revisar y un segundo para confirmar; permite cancelar y bloquea envíos mientras procesa.

## Comprobaciones ejecutadas

- Backend: `npm run typecheck`, `npm run lint`, `npm test` y compilación incluida en `npm test`: correctos, 30 pruebas.
- API y PostgreSQL reales: `node --test tests/administracion-local.test.mjs tests/mejoras-local.test.mjs`: 14 pruebas correctas. Incluyen edición separada, consulta de oficina, desactivación/reactivación, motivo obligatorio, rechazo de roles sin permiso, protección institucional, asignación conservada y auditoría. Los datos auxiliares se revierten mediante transacción exterior y savepoints. La suite comprueba huellas de las 21 tablas antes y después; no elimina historia ni reinicia secuencias.
- Frontend: typecheck y lint correctos; `npm test`: 56 pruebas correctas. Incluye renderizado de los componentes reales con respuestas simuladas para formularios, vistas de oficinas, accesos de detalle, metadatos PDF y estructura de tarjetas. Esto no acredita por sí mismo el responsive ni el funcionamiento visual de PDF.js.
- Compilación frontend completa ejecutada correctamente; repetida tras el ajuste final de confirmación.
- `git diff --check`: correcto; solo avisos de normalización LF/CRLF en archivos existentes.

## Navegador real: comprobado y pendiente

Se recuperó el acceso a la pestaña existente de Chrome con sesión de Superadministrador.

Comprobado directamente:

- Listado documental en escritorio de 1440 × 1000. Se detectó una acción de detalle demasiado estrecha y se corrigió su ancho mínimo; esa corrección no se volvió a capturar en escritorio.
- Listado documental en móvil de 390 × 844 después de recargar: filtros en una columna y filas como tarjetas. La medición de la página dio ancho de contenido 375 px y ancho desplazable 375 px, sin desbordamiento horizontal en ese estado.
- Búsqueda `EMITIDO`: tres resultados de los seis documentos existentes.
- Apertura del detalle documental desde «Ver detalle» con Enter, conservando la ruta `/documentos/6`.
- Listado de oficinas en tableta de 820 × 1180.
- Creación de una oficina de prueba, acceso a su edición con Enter, cambio de nombre con motivo y vuelta al detalle actualizado.

No completado visualmente:

- El diálogo nativo de desactivación bloqueó la conexión. El intento de recuperación mediante la ventana de Chrome terminó con una parada de Computer Use porque no pudo determinar la URL con suficiente confianza. No se siguió automatizando el navegador después de esa parada.
- La confirmación nativa se sustituyó por una confirmación integrada en pantalla. Quedan por recorrer sus botones de confirmar/cancelar y el resultado visual de desactivación y reactivación; las operaciones del servidor sí fueron comprobadas por API.
- Formulario de registro y PDF real seleccionado en escritorio/tableta/móvil, controles de páginas y desplazamiento del visor; hace falta sesión de Secretaría o Dirección. Se solicitó al usuario iniciar sesión sin compartir la contraseña.
- Apertura de detalle de cuenta mediante el nuevo botón, recorrido completo Tab/Shift+Tab y foco visible.
- Listado con asuntos de longitud extrema y tabla/tarjetas en los tres tamaños. Los asuntos largos se cubrieron con renderizado automatizado, no con captura real.
- Paginación con más de una página: los seis documentos actuales no habilitaban Anterior/Siguiente; no se crearon documentos masivos para ello.
- Restablecer la anulación temporal de viewport del navegador (último tamaño utilizado: 820 × 1180); la parada impidió ejecutar el restablecimiento.

No se declara aprobada la verificación visual completa de responsive.

## Datos locales de prueba persistentes

Se creó por interfaz la oficina ID `10`, «PRUEBA LOCAL — Usabilidad revisada 01-11», sin asignarle cuentas. La consulta posterior confirmó que sigue activa y tiene los eventos `CREAR` y `EDITAR`, actor ID `1`. No se confirmó la desactivación en esta ejecución. Se conserva la oficina y su auditoría; no se borraron datos para ocultar la prueba.

Las pruebas automatizadas de administración y mejoras no dejaron sus cuentas, documentos ni oficinas auxiliares; sus transacciones se revirtieron. Pueden existir saltos normales de secuencia por esas operaciones revertidas; no se reiniciaron.

## Archivos de esta intervención

- Backend: `src/modules/usuarios/administracion.operaciones.ts`, `administracion.routes.ts`; pruebas `administracion-local.test.mjs` y `mejoras-local.test.mjs`.
- Frontend: `src/api/documental.ts`, `src/routes/AppRoutes.tsx`, `src/components/ui/Admin.module.css`; páginas `OficinasPages.tsx`, `ConfiguracionPages.tsx`, `UsuariosListaPage.tsx`, `DocumentoFormularioPage.tsx`, `DocumentosListaPage.tsx`; componente nuevo `PrevisualizacionRegistroPdf.tsx`, estilos `ArchivoPdf.module.css`; pruebas `detalle-documental.test.mjs`.

Los demás cambios sin confirmar pertenecientes a intervenciones anteriores se conservaron.

## Continuación: confirmación interna y sesión de una hora

El usuario confirmó el cierre del diálogo nativo e inició sesión con Secretaría. Se recuperó la conexión a Chrome y se continuaron las pruebas sobre el mismo entorno local.

- La duración central de JWT pasó de 900 a 3600 segundos para todos los roles (`backend/src/shared/security/jwt.ts`). La respuesta de login toma esa misma constante. El frontend ya utiliza `expiresIn` y el vencimiento absoluto firmado: no necesita ampliar artificialmente el token al recargar. Los tokens emitidos antes del cambio conservan su vencimiento anterior; hay que iniciar sesión de nuevo una vez para obtener una sesión de una hora.
- Se ajustaron las pruebas de autenticación del backend para exigir `exp - iat = 3600` y `expiresIn = 3600`. La prueba frontend con reloj controlado comprobó sesión válida a los 30 minutos, vencimiento conservado al revalidar y cierre al cumplir los 60 minutos. No se esperó una hora real.
- Oficinas ya no utiliza `window.confirm`. Su confirmación está integrada en la propia pantalla. También se retiró el diálogo nativo de eliminación de PDF: ahora muestra el nombre del archivo y los botones «Confirmar eliminación» y «Cancelar eliminación» dentro del componente. El contrato de eliminación, la revisión esperada, los permisos del servidor y el tratamiento de limpieza pendiente se conservan.
- Se corrigió la presentación de tamaños pequeños: el PDF de prueba mostraba «0 MiB»; ahora se utiliza KiB o bytes cuando corresponde.

### Comprobaciones adicionales reales en Chrome

- Secretaría abrió el formulario de registro existente.
- Se seleccionó `.private/usabilidad/previsualizacion-local.pdf`, un archivo ficticio de dos páginas y 1,28 KiB generado exclusivamente para previsualización. No se confirmó el registro ni se envió a R2.
- El visor PDF.js real mostró ambas páginas. Se probó «Siguiente» mediante clic y «Anterior» mediante Enter.
- En móvil de 390 × 844 se observaron metadatos, aviso de archivo no enviado y controles de páginas legibles. La página mantuvo 375 px de ancho de contenido y 375 px desplazables.
- En tableta de 820 × 1180 se observó el formulario con dos columnas, asunto y observaciones de ancho completo y bloques separados del PDF; ancho de contenido y desplazable de 805 px. Se comprobó Tab desde clasificación a tipo documental.
- Se escribió un asunto ficticio en el formulario para comprobar su lectura; no se guardó. Al vencer el token anterior de 15 minutos, la aplicación volvió correctamente al login y se solicitó un nuevo inicio de sesión. Ese cierre no demuestra un fallo de la duración nueva: el token se había emitido antes del cambio.
- Evidencia local móvil: `.private/usabilidad/pdf-movil.png`. No se publica ni se añade a Git.

Las comprobaciones pendientes indicadas arriba no se dan por aprobadas automáticamente. En particular, no se ejecutó una eliminación real de PDF para probar esta presentación, ni se completó aún el nuevo recorrido visual de actividad de oficinas con la sesión administrativa. Tipos, lint, compilación y las 30 pruebas backend/56 frontend se repitieron correctamente tras esta continuación.

No se cambiaron cuentas ni contraseñas, no se aplicó SQL y no se crearon documentos persistentes durante esta continuación. El archivo PDF ficticio y la captura permanecen únicamente en `.private/`, excluido de Git.

Antes de terminar se restableció el tamaño normal del navegador. La pestaña quedó en el login, preparada para que el usuario obtenga una sesión nueva de una hora.

### Verificación tras el nuevo inicio de sesión de Secretaría

Se confirmó de nuevo la sesión de Secretaría en el navegador y se retomó la comprobación sin cambios de código adicionales:

- PDF ficticio seleccionado y visor observados en escritorio 1440 × 1000, tableta 820 × 1180 y móvil 390 × 844. Anchos de página/contenido medidos: 1425/1425, 805/805 y 375/375 px, respectivamente.
- El contenedor del PDF en escritorio tenía 750 px de alto y 1131 px de contenido, con `overflow-y: auto`: el desplazamiento pertenece al visor, sin desbordar horizontalmente la página.
- Se comprobó el foco visible del paginador y «Siguiente» con Enter. «Quitar selección» retiró el visor y devolvió el botón a «Registrar documento». «Cancelar» volvió al listado sin guardar nada.
- El filtro de clasificación «Recibido» se ejecutó con Enter: tres resultados. El botón de detalle de la primera tarjeta abrió `/documentos/5`; «Volver al listado» regresó al listado general de seis documentos.
- Se volvió a observar la tabla de escritorio después de corregir el ancho de «Ver detalle»: los seis botones medían 112 px y mantenían el texto sin partir. La página no tenía desbordamiento horizontal en ese estado.
- Se restableció el tamaño normal del navegador.

Quedan pendientes los dos recorridos administrativos por interfaz (botón de detalle de usuarios y confirmación integrada de actividad de la oficina ficticia). Se solicitó una sesión administrativa. La nueva sesión de Secretaría se utilizó para navegar; no se inspeccionó ni se imprimió su token y no se esperó una hora real para verificar su duración.

### Cierre de los recorridos administrativos con Administrador

El usuario inició sesión como Administrador. Se utilizó esa cuenta, sin acceder a Superadministración ni cambiar permisos:

- Dashboard sin contenido documental; cuatro cuentas visibles, sin mostrar al Superadministrador.
- «Ver detalle» de la Directora abrió `/usuarios/3` desde escritorio mediante Enter y desde móvil mediante clic. El destino coincide con el enlace del nombre de la cuenta. Se conservaron «Editar cuenta y asignación» y «Volver».
- Usuarios en móvil de 390 × 844: filas con etiquetas y botones legibles, ancho de contenido/desplazable 375/375 px.
- Oficina ficticia ID 10: la primera pulsación mostró la confirmación dentro del sistema; cancelar con Enter conservó el estado activo y el motivo. Se volvió a solicitar y se confirmó la desactivación: apareció «Oficina desactivada» y el estado inactivo. Se confirmó luego la reactivación con Enter: apareció «Oficina activada» y el estado activo, sin F5 ni diálogo nativo.
- Se comprobó el acceso separado «Editar nombre» con Enter y se canceló sin cambiar el nombre.
- Una consulta de solo lectura confirmó `sistema_web_documental_final` local, oficina 10 activa y cero asignaciones. Su auditoría conserva `DESACTIVAR` (true → false) y `ACTIVAR` (false → true), ambos con motivos de verificación y actor ID 2, `administrador`. La cancelación no añadió un evento de actividad.
- Evidencias locales: `.private/usabilidad/confirmacion-oficina-movil.png` y `.private/usabilidad/oficina-reactivada-movil.png`.
- Al terminar se restableció el tamaño normal y se dejó la sesión de Administrador en el listado de usuarios.

Con esto se completaron los dos recorridos administrativos que estaban pendientes. Siguen sin verificarse visualmente una eliminación real de PDF, una segunda página de documentos y asuntos de longitud extrema dentro del listado. No se crearon documentos masivos ni se modificaron documentos existentes para cubrirlos. En esta continuación solo persistieron los dos eventos de actividad de la oficina ficticia; no hubo cambios de código, SQL de esquema, cuentas ni credenciales.
