# Retirada de consulta general de Secretaría — 2026-11-20

Alcance solicitado: retirar exclusivamente la lectura general de Secretaría de Dirección; Dirección conserva el acceso general y los demás roles conservan sus permisos.

La ruta HTTP vigente usa `lecturaSQL` y `public.documento_consultable_con_delegacion`, que deriva la lectura ordinaria a `public.documento_consultable`. La migración 015 reemplaza únicamente esta última función. Secretaría conserva el ámbito compartido con Dirección, la consulta del archivo histórico de su oficina y la consulta por delegación explícita. No se cambian permisos de escritura, funciones de delegación ni reglas de PDF.

El frontend obtiene listado, detalle, historial, auditoría y PDF del servidor; no concede un acceso general independiente. Por ello no requiere modificación ni publicación de assets.

Verificaciones locales:
- Prueba previa del bloqueo: falló con HTTP 200 en lugar de 404 antes del cambio.
- Backend completo: 67/67.
- Backend revisión: 39/39, incluidos administración, registro, delegación, ubicación, anulación, PDF y conservación con rollback.
- Frontend: 78/78; compilación, typecheck y lint correctos.
- Backend: typecheck y lint correctos.
- Se actualizaron expectativas del acceso de Secretaría. Se corrigieron dos fixtures de pruebas desactualizadas (campos opcionales retirados y metadatos adicionales del selector), sin cambios de producto asociados.
- Función aplicada también a la base local; definición anterior conservada privadamente.

Producción: migración 015 aplicada con respaldo cifrado verificado y control de integridad de documentos, auditoría, PDF y retención. Comparación de 12 cuentas activas y 5 documentos existentes: 48 solicitudes HTTP antes y 48 después, todas las comprobaciones finales correctas. Dirección conserva sus 3 documentos consultables; Secretaría pasa de 3 a 2, conservando sus permisos sobre los documentos que sigue autorizada a consultar. Los restantes roles conservan exactamente sus documentos autorizados y permisos observados. El acceso de Secretaría al documento ajeno queda denegado por ID, historial, auditoría y PDF con HTTP 404. No se crearon ni modificaron registros reales.

Durante la comprobación inicial hubo errores HTTP 500 con solicitudes agrupadas. La repetición secuencial previa y posterior completó todas las comprobaciones sin esos errores. No se cambió producto por este hallazgo.

Commit funcional publicado en main: `d72bab4`. La publicación efectiva del permiso es la migración PostgreSQL; no requiere recompilar o redesplegar frontend/backend.
