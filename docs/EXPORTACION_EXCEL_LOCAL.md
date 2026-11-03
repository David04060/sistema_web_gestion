# Exportación documental mensual a Excel — implementación local

## Resultado y flujo

Desde Documentos, «Exportar a Excel» abre un diálogo; esta primera acción no consulta el endpoint ni descarga archivos. El usuario elige Año de registro y Mes de registro. La segunda acción «Exportar a Excel» genera y descarga documentos-AAAA-MM.xlsx. «Cancelar» cierra sin iniciar una descarga; durante una operación también aborta la solicitud y descarta respuestas tardías. El foco vuelve al botón que abrió el diálogo.

El diálogo reutiliza el modal nativo, IBM Plex Sans, los tokens, los botones y los controles del diseño vigente, con disposición adaptable en claro y oscuro. Muestra el alcance del perfil, explica que se exporta el mes completo sin limitarse a la página o filtros visibles, anuncia generación/descarga con progreso indeterminado y presenta éxito, vacío o error con reintento. No muestra porcentajes ficticios de generación. Año y mes se bloquean durante el envío y una referencia síncrona impide envíos repetidos incluso antes del siguiente render.

Se conservaron los cambios locales previos, rutas, cinco roles, datos y PDF. No hubo commit, push, migraciones ni despliegue. La aplicación local habitual en localhost:5173 y el endpoint del backend habitual en 127.0.0.1:3000 se comprobaron; no es únicamente una verificación sobre un servidor de pruebas.

## Endpoint y fecha de selección

GET /api/documentos/exportar-excel?anio=2026&mes=11

- Autenticación Bearer existente y revalidación de cuenta/rol/ámbito dentro de una transacción PostgreSQL REPEATABLE READ READ ONLY.
- Año: cuatro cifras, entre 1900 y 9999, rango admitido para fechas de Excel. Mes: 1–12, con o sin cero inicial. Se rechazan decimales, matrices de parámetros repetidos, valores fuera del rango y parámetros adicionales como rol, ámbito, página o filtros.
- Intervalo semiabierto desde el primer día del mes a las 00:00 hasta el primer día del mes siguiente a las 00:00, ambos interpretados con America/Lima, igual que los filtros documentales existentes.
- El criterio es documentos.creado_en, no el año del código, la fecha de delegación ni la última actualización.
- Todos los valores se leen en una sola instantánea. Un registro de noviembre corregido o delegado en diciembre aparece en noviembre con esos datos y su situación actual. No se reconstruye el estado histórico de fin de mes.
- No hereda búsqueda, situación, clasificación, límite ni página del listado. Se exportan todas las coincidencias autorizadas del mes, o se rechaza el conjunto completo si excede un límite; nunca se entrega solo una primera página o un subconjunto silencioso.
- Orden estable por fecha de registro e identificador, ascendente. Los identificadores se usan para ordenar y autorizar, pero no se exportan. Se conservan filas con códigos coincidentes de ámbitos distintos: código visible no se considera identificador global único.

Respuesta: MIME application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, Content-Disposition de descarga, Cache-Control no-store, private y X-Export-Total. X-Export-Generated-At indica el instante de la transacción. CORS expone estos metadatos de descarga a los orígenes ya autorizados; no se amplió la lista de orígenes ni los permisos.

## Reglas de acceso

Se reutiliza lecturaSQL, la condición que limita la consulta documental normal, sobre cada documento seleccionado. No depende de esconder el botón ni de un rol enviado por el navegador.

| Perfil | Exportación |
|---|---|
| Usuario | Documentos consultables de su ámbito personal; excluye anulados. La delegación no transfiere su propiedad a otra cuenta. |
| Secretaría | Todos sus documentos consultables según la consulta institucional normal, excluidos anulados. No se limita artificialmente al grupo compartido de sus gráficos. |
| Dirección | Todos sus documentos consultables institucionales, incluidos los de lectura personal ajena que su consulta normal autoriza; excluye anulados. Exportar no concede permisos de modificación. |
| Administrador | 403 en backend. No puede exportar documentos, aunque construya la URL directamente. Tampoco tiene el botón ni acceso al módulo documental. |
| Superadministrador | Todo el conjunto documental global autorizado del mes, incluidos anulados. El diálogo lo indica expresamente. |

Los campos opcionales se consultan únicamente a través del documento ya autorizado. No se exportan catálogos de campos de cuentas ajenas ni correos, contraseñas, sesiones, hashes, IDs, revisiones, claves de objetos R2, firmas, URLs temporales o contenido binario de PDF. Solo nombres documentales de personas/oficinas que la consulta normal permite leer.

## Hoja y columnas definitivas

Una hoja «Documentos», con primera fila inmovilizada, encabezados españoles resaltados, anchos por tipo de dato, texto ajustado y autofiltro. Una fila por documento. No se añaden filas de totales o mensajes que parezcan registros.

| Columna | Contenido y origen |
|---|---|
| Código | documentos.codigo_visible, como texto para preservar su representación |
| Tipo documental | tipo_nombre_guardado, nombre registrado del tipo |
| Asunto | Valor actual |
| Clasificación | Recibido, Emitido o Sin clasificar si el origen es nulo |
| Remitente | Valor actual, en blanco si falta |
| Observaciones | Valor actual |
| Registrado por | Nombre legible del registrador |
| Situación actual | Personal, Pendiente de Dirección, En Mesa de Partes, Guardado en Dirección, Delegado o Anulado |
| Fecha de registro (hora de Perú) | creado_en, fecha real de Excel con hora institucional |
| Última actualización (hora de Perú) | actualizado_en del documento |
| Oficina del registrador (actual) | Oficina actualmente asociada al registrador, como en el listado normal |
| Oficina de ubicación (registrada) | Nombre conservado en la ubicación vigente |
| Ubicación física vigente | Ruta guardada de la ubicación vigente, igual que el detalle documental |
| Ubicación registrada el (hora de Perú) | Fecha del registro de esa ubicación |
| Delegado a (nombre registrado) | nombre_persona_guardado de la delegación, también en delegaciones manuales |
| Oficina indicada en delegación | Nombre legible de la oficina indicada, si existe; no se inventa una oficina para delegaciones manuales |
| Delegación indicada por | Nombre legible de quien delegó |
| Fecha de delegación (hora de Perú) | delegado_en |
| Observaciones de delegación | Observaciones registradas |
| PDF: nombre | Nombre del PDF actualmente vinculado |
| PDF: tamaño (bytes) | Número entero, no una cadena de texto |
| PDF: tipo de archivo | tipo_mime |
| PDF: actualizado el (hora de Perú) | Fecha de actualización del PDF vinculado |
| Campos opcionales (nombre histórico: valor) | Representación descrita a continuación; continuaciones solo si se necesitan |

La ubicación y la delegación respetan los nombres guardados que utiliza el contrato documental; no se sustituyen por etiquetas actuales de un catálogo cuando el sistema conserva una etiqueta histórica. Los datos ausentes quedan en blanco. Los metadatos PDF proceden de PostgreSQL; la exportación no contacta con R2 ni descarga, reemplaza o borra PDF.

Excel almacena las fechas sin zona horaria. Se convierten a la hora de America/Lima antes de crear su valor de fecha, y los encabezados lo explican. Formato dd/mm/yyyy hh:mm:ss; siguen siendo fechas ordenables y filtrables. La fecha de generación del archivo se mantiene como metadato del libro y encabezado HTTP.

## Campos opcionales y texto seguro

Se reserva una columna al final con una línea «nombre histórico: valor» por campo, en orden estable. Se toma valores_documento.nombre_guardado, no campos_opcionales.nombre_actual. Las variaciones por cuenta no crean una columna por cada nombre de catálogo ni mezclan información de otras cuentas.

Si la representación supera 30 000 unidades UTF-16, se reparte en columnas contiguas «Campos opcionales (1/N; continuación)», «(2/N; continuación)», etc. La cantidad se define por el documento más largo del archivo; las filas cortas dejan en blanco las continuaciones. Al concatenarlas se recupera el texto completo, sin truncar nombres ni valores. Se evita cortar pares sustitutos de Unicode, comprobado con emojis. Las columnas documentales restantes conservan su posición.

ExcelJS recibe los valores proporcionados por usuarios como cadenas explícitas, nunca como objetos formula, sharedFormula o hyperlink. Cadenas que empiezan por =, +, -, @ o contienen HYPERLINK se conservan literalmente y no se convierten en fórmulas ni enlaces activos. Las pruebas leen el XLSX y comprueban los tipos de celda. Un campo documental individual ajeno a la representación de opcionales que supere los 32 767 caracteres de una celda produce 422 antes de crear el archivo; no se corta ni se modifica en la base. Los contratos normales de esos campos ya los limitan a 20 000 caracteres.

## Recursos, generación y limpieza

ExcelJS stream.xlsx.WorkbookWriter escribe a un archivo temporal con useSharedStrings=false y confirma cada fila. La descarga se inicia solo después de terminar el ZIP, para poder devolver errores JSON sin presentar un Excel incompleto como éxito. Express transmite el archivo terminado por flujo. No se usa writeBuffer para acumular el libro entero.

La selección de origen está acotada: máximo 10 000 documentos y 16 MiB de datos serializados en PostgreSQL. El recuento y el presupuesto se verifican antes de cargar las filas en Node.js. Esto no convierte el origen en un cursor de memoria constante: se carga el conjunto autorizado, limitado por ese presupuesto. Máximo dos generaciones simultáneas por proceso y una por cuenta; cada consulta tiene statement_timeout local de 30 segundos. Exceso de tamaño/filas: 422 explicado; concurrencia: 429 con opción de reintento. Son límites explícitos, no paginación oculta. Un mes que los exceda requiere exportación asistida fuera de esta interfaz.

El directorio temporal es aleatorio, no público; la ruta nunca se acepta del cliente. El archivo se crea con modo 0600 cuando el sistema lo aplica. Antes de la limpieza recursiva se comprueba que el directorio siga bajo el temporal del sistema y conserve el prefijo específico. Se limpia al terminar la transferencia, ante error y al cancelar la conexión. No quedaron directorios paillardelle-excel-* después de los recorridos. El frontend descarta respuestas de un componente/sesión anterior y revoca las URLs locales creadas para la descarga.

Prueba sintética local: 10 000 filas escritas y vueltas a leer por flujo, archivo de 1 086 064 bytes, unos 2 837 ms, máximo RSS observado de aproximadamente 171 MiB para el proceso completo de escritura y lectura. No se insertaron esas filas en la base. Esta medición no certifica el consumo de producción con cualquier distribución de textos o concurrencia.

## Verificación realizada

| Comprobación | Resultado |
|---|---|
| Frontend npm test | 69 aprobadas, 0 fallidas |
| Backend npm test | 37 aprobadas, 0 fallidas |
| Frontend y backend typecheck / lint / build | Salida 0 |
| Cinco roles en API real | Usuario, Secretaría, Dirección y Superadministración autorizados según alcance; Administrador 403; sin token 401 |
| Comparación PostgreSQL independiente | Códigos, tipos, asuntos, situaciones, fechas locales, remitentes, observaciones, campos históricos, metadatos PDF y cantidades coinciden con el XLSX de cada periodo existente |
| Noviembre de 2026, datos reales | Usuario 4 filas; Secretaría 15; Dirección 15; Superadministrador 16, incluido 1 anulado |
| Navegador | Cuatro perfiles documentales × claro/oscuro × 1440/375 px: 16 combinaciones; Admin comprobado por rechazo de ruta y API |
| Dos botones y cancelación inicial | Abrir y cambiar el periodo no solicitan el archivo; Cancelar no descarga |
| Paginación | Listado con limite=1 y una fila visible; archivo con todas las filas del mes |
| Doble envío y progreso | Botón/controles deshabilitados; dos eventos de envío adicionales no crean solicitudes nuevas; progreso visible |
| Fallo y reintento | HTTP 500 controlado sin mostrar SQL privado; reintento posterior descarga correctamente |
| Mes vacío | Enero de 1900: XLSX válido con solo encabezados y mensaje claro en el diálogo |
| Cancelación durante la descarga | No aparece archivo tardío; el diálogo se puede abrir y exportar de nuevo |
| Teclado | Cancelar devuelve el foco al botón de apertura; se corrigió el cierre nativo antes del desmontaje tras reproducir el fallo |
| Fecha y datos posteriores | Fixture temporal: 56 registros autorizados, límites UTC/Perú y un documento de noviembre corregido/delegado en diciembre con sus valores actuales |
| Protección de recursos | Fixture temporal supera 10 000 filas y otra supera 16 MiB: 422; nunca archivo parcial |
| Opcionales y tipos | Nombres históricos, texto largo con Unicode, fechas Excel reales y tamaño PDF numérico; cero fórmulas/hipervínculos |
| Apertura y estructura | 19 descargas reales leídas con ExcelJS; ZIP y XML de una descarga global validados además con bibliotecas estándar independientes, sin vínculos externos |
| Conservación | Huellas antes/después iguales para usuarios, documentos, PDF, valores, delegaciones, ubicaciones y auditorías en el recorrido de navegador |
| Dependencias | ExcelJS instalado en backend. Se resolvió un aviso transitivo de uuid mediante override acotado a 11.1.1, API v4 compatible; npm audit posterior sin vulnerabilidades |

Los escenarios de límites, fechas y cambios posteriores usan tablas TEMP que ocultan los nombres de tablas únicamente en su propia conexión y terminan con ROLLBACK. No se ejecutaron migraciones ni modificaciones sobre documentos existentes. Los errores de red de navegador fueron respuestas interceptadas, identificadas como tales; las descargas correctas fueron respuestas reales del backend.

Las descargas de QA se conservaron localmente bajo .private/exportacion-excel, fuera del código versionable. Las capturas y resultados resumidos están en docs/qa-exportacion-excel-20261102. Los JWT usados para verificar no se guardaron en los archivos de resultados.

## Inventario técnico y archivos

En README.md, sección Stack aprobado, se añadió la referencia solicitada: **ExcelJS: biblioteca de Node.js usada en el backend para generar archivos Excel .xlsx.** Se conserva para la posterior actualización del fundamento técnico y de los conceptos técnicos del entregable académico; no se reescribió ese capítulo.

Implementación: backend/src/modules/documentos/exportacion.repository.ts, exportacion.excel.ts y exportacion.controller.ts; registro de ruta estática en documentos.routes.ts y exposición de cabeceras en cors.middleware.ts. Frontend: api/client.ts, ExportarDocumentos.tsx y su CSS Module, integrado en DocumentosListaPage.tsx.

Pruebas: backend/tests/exportacion-excel.test.mjs, exportacion-excel.local.test.mjs y exportacion-limite.test.mjs; frontend/tests/exportacion-excel.test.mjs. Recorridos reproducibles: backend/scripts/verificar-exportacion-excel.local.mjs y verificar-cancelacion-excel.local.mjs. El primero levanta Express sin el colector PDF y un Vite temporal; el segundo utiliza los servidores locales habituales. No contactan almacenamiento remoto.

Documentación primaria de la biblioteca consultada: [ExcelJS](https://github.com/exceljs/exceljs) y su API de WorkbookWriter por flujo. La biblioteca se usa en el backend; no se incluyó ExcelJS en la descarga del frontend.

## Límites de la evidencia

- Los tamaños de escritorio y móvil se comprobaron en Chrome redimensionado, no en dispositivos físicos ni en todos los navegadores. No se hizo una auditoría completa con lector de pantalla.
- La apertura visual en Microsoft Excel de escritorio quedó pendiente: la automatización no pudo operar el selector de archivo y la captura de esa aplicación falló. Se cerró la instancia vacía. No se presenta la lectura automatizada con ExcelJS o la validación ZIP/XML como una apertura confirmada en Microsoft Excel.
- El volumen de 10 000 filas fue sintético. No se alteró la base para fabricar ese mes ni se confirmó una exportación asistida superior al límite.
- No se desplegó ni se verificó ningún servidor remoto. La disponibilidad comprobada corresponde al proyecto local.
