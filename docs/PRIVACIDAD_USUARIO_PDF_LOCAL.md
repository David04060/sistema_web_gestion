# Privacidad del usuario ordinario — corrección local

El rol Usuario solo consulta registros ordinarios cuyo registrado_por_id coincide con su cuenta. Ni la responsabilidad actual, ni una oficina compartida, ni una delegación abren registros ajenos en esta etapa. Las futuras excepciones por delegación requieren definición funcional expresa.

La condición se incorpora en contenidoAutorizadoSQL, compartida por listado, detalle, filtros, relaciones, recorrido y Dashboard. obtenerParaPdf la utiliza para Usuario. Por tanto, la consulta de metadatos, visualización y descarga del PDF se deniegan antes de generar URLs. Carga, confirmación y eliminación vuelven a consultar el documento dentro de la transacción. Además, exigirGestion rechaza explícitamente al Usuario sobre un registro ajeno.

No se modifican el contexto protegido SíseVe, las autorizaciones de Dirección/Secretaría, el esquema ni los archivos existentes. No se publica este cambio.

## Verificación ejecutada

- `npm test` en backend: 62 pruebas aprobadas, incluida protección adicional SíseVe con almacenamiento simulado.
- `node --import tsx --test tests/privacidad-usuario.local.integration.mjs`: conexión verificada a sistema_web_final local; un Usuario activo, 71 documentos institucionales y 152 solicitudes HTTP. Detalle/PDF institucionales: 404; listado solo propio; búsqueda de fixture institucional vacía; historial y operaciones PDF directas denegadas. Lectura de registro propio y sus metadatos PDF: 200.
- Comparación completa antes/después de documentos, documentos_pdf, pdf_cargas, pdf_objetos y pdf_eventos: sin cambios.

La prueba local utiliza únicamente solicitudes de escritura negativas sobre un fixture QA-PDF-PERMISOS existente. No crea bases, registros ni objetos R2. La verificación descrita es HTTP contra el sistema local; no constituye una comprobación visual en navegador ni una verificación productiva.
