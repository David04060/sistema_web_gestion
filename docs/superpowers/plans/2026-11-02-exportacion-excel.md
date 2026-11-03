# Exportación documental mensual a Excel

**Objetivo:** implementar la solicitud de exportación .xlsx desde Documentos, sin escrituras en los registros existentes ni cambios de permisos/diseño.

**Arquitectura:** endpoint autenticado GET /api/documentos/exportar-excel?anio=2026&mes=11 antes de /:id. Instantánea REPEATABLE READ READ ONLY con actor revalidado y lecturaSQL. ExcelJS WorkbookWriter hacia archivo temporal privado; descarga solo tras terminar y limpieza al cerrar/error. Fuente acotada explícitamente a 10 000 filas / 16 MiB de datos serializados, sin truncar resultados.

**Decisiones:** registro filtrado por America/Lima; valores actuales en la instantánea. Superadministrador incluye anulados; Administrador 403. No heredar paginación ni otros filtros del listado. Campos opcionales en texto con nombre histórico, repartido en continuaciones de hasta 30 000 unidades UTF-16 cuando sea necesario. Fechas Excel reales con hora local institucional y encabezados que lo indiquen. Texto siempre string, jamás fórmula/hipervínculo. No exportar identificadores internos, claves R2, credenciales, firmas ni URLs.

- [x] Pruebas backend primero: validación estricta, mes límite en Lima, lectura y rechazo por rol, XLSX vacío, tipos de celda, fórmulas como texto, campos largos y todas las coincidencias.
- [x] Repositorio exportacion.repository.ts: consultas parametrizadas de solo lectura y límites previos; mismas reglas documentales.
- [x] Servicio exportacion.excel.ts: columnas y estilos, límites de Excel, streaming a temporal, salida con conteo y limpieza.
- [x] Endpoint exportacion.routes.ts e integración de ruta estática. Encabezados de descarga/no-store y exposición CORS del conteo.
- [x] Transporte binario frontend con 401 integrado, errores públicos, aborto y sin reintentos automáticos de generación.
- [x] Diálogo ExportarDocumentos con año/mes, alcance breve, cancelar sin solicitud, bloqueo de doble envío, progreso indeterminado, éxito/error/reintento y foco nativo.
- [x] QA: cinco sesiones reales, consulta PostgreSQL independiente, filas actuales, vacío y descarga abierta con ExcelJS; navegador ambos temas escritorio/móvil, error/cancelación/reintento. Fixture temporal aislada para más de una página y fechas posteriores, rollback sin tocar datos persistentes.
- [x] Pruebas completas, typecheck, lint, build, huellas antes/después; informe e inventario de tecnologías con ExcelJS. Sin commits, push ni despliegue.

## Riesgos a comprobar

1. Ruta estática confundida con /:id o permiso basado solo en el botón.
2. Código visible no único entre ámbitos: una fila por documento, sin deduplicar códigos.
3. Textos con =, +, -, @, fórmulas, URLs y campos históricos extensos.
4. Noviembre en Perú frente a límites UTC y estado actualizado en diciembre.
5. Cambio de sesión o cierre del componente durante la descarga; no iniciar descarga de una respuesta antigua.
