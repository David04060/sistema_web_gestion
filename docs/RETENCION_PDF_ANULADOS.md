# Ubicación, delegación y retención de PDF anulados

## Comportamiento

- El detalle usa la ubicación vigente entregada por el backend: sin ella, «Guardar en una ubicación propia»; con ella, «Actualizar ubicación». Conserva el permiso `ubicar` y la validación transaccional de revisión y unidad propia.
- La delegación ya estaba implementada en `aplicar_delegacion`: Dirección, Secretaría y Usuario pasan a DELEGADO, la ubicación anterior queda no vigente y el evento conserva la situación y ruta anteriores. No se duplicó ese código. Superadministrador y Administrador no reciben esta operación.
- La anulación conserva documento e historia. Su evento de auditoría fija el inicio de una retención de 336 horas del PDF vinculado. Solo Superadministrador conserva lectura del anulado, incluido el PDF hasta su eliminación efectiva.

## Migración y coordinación con R2

Aplicar una sola vez `database/changes/007-retencion-pdf-anulados.sql`, con propietario y respaldo verificados, antes del backend nuevo. El instalador base es una instantánea anterior: una instalación nueva necesita también este incremental. El runner local lo instala automáticamente en el cluster efímero antes de los fixtures.

La tabla `pdf_retenciones_anulacion` guarda documento, revisión, clave, fecha de anulación, vencimiento calculado, próximo intento, intentos y eliminación confirmada. No guarda bytes. El trigger se ejecuta después de `auditar_documento` y usa la fecha exacta de ANULACION. El incremental recupera anulaciones históricas con PDF mediante su auditoría; si falta esa fecha, aborta. El rol de aplicación no puede insertar tareas, cambiar claves, adelantar el vencimiento ni marcar la eliminación directamente.

El recolector bloquea primero el documento y después la tarea mediante SKIP LOCKED. Comprueba que siguen anulados y vinculados el mismo documento, revisión y clave. Envía DELETE al endpoint S3 privado y después HEAD: solo acepta ausencia confirmada HTTP 404; un objeto presente, un timeout o un 403 conserva la tarea pendiente. Solo entonces la función SQL restringida retira los metadatos PDF y registra `RETENCION_14_DIAS_ELIMINADA` con fecha PostgreSQL. El registro documental y su historial permanecen.

Ante fallo R2 registra `RETENCION_14_DIAS_PENDIENTE`, incrementa intentos y espera al menos cinco minutos. Un fallo SQL posterior al borrado hace rollback: el próximo DELETE de la misma clave ausente y HEAD 404 permite completar la tarea sin éxito falso. La auditoría pública proyecta el motivo de política, sin claves R2 ni datos privados. El sistema no expone un endpoint de borrado por política a los usuarios.

## Programación

Se conserva el mantenimiento al arrancar y cada cinco minutos mientras el backend está activo. El workflow `.github/workflows/pdf-maintenance.yml` solicita `/api/health` cada hora, al minuto 17, para despertar Render Free; no lleva secretos ni descarga documentos. También permite ejecución manual. La tarea se procesa en la primera revisión disponible después del vencimiento; jamás antes. GitHub puede retrasar schedules: no se garantiza ejecución al segundo exacto ni una demora máxima absoluta. Un servicio siempre activo y un planificador con garantías serían necesarios para una obligación de plazo estricto.

No se configura una expiración de 14 días por edad en R2: su edad de objeto no equivale a la fecha de anulación. Se conservan bucket privado y regla de temporales existente. El adaptador verifica ausencia usando la consistencia fuerte de R2. No se trasladan ni eliminan PDF productivos durante la validación.

Fuentes operativas: [consistencia R2](https://developers.cloudflare.com/r2/reference/consistency/), [lifecycle R2](https://developers.cloudflare.com/r2/buckets/object-lifecycles/) y [schedule GitHub](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).

## Validación

La suite `politica-pdf` y la suite completa usan PostgreSQL 18 efímero con manifiesto/identidad, cuentas de los cinco roles y un PDF generado en un directorio temporal. El borrado se verifica contra ese archivo, con almacenamiento simulado. La prueba del adaptador S3 ejercita DELETE y HEAD mediante comandos reales interceptados, sin red.

Se ensayan con/sin ubicación para los tres roles delegadores, rechazo de los dos administrativos, conservación de ruta/historia, anulación sin PDF, lectura del PDF anulado por Superadministrador, rechazo de los otros cuatro roles, 14 días completos, una hora antes y justo después del límite, fallo de almacenamiento, backoff, bloqueo concurrente, fallo SQL después de eliminar, reintento idempotente, constancia de política y permanencia del documento. Los tiempos sintéticos solo se alteran dentro del cluster efímero; nunca en producción.

La verificación productiva es de consultas, definición SQL, permisos, servicio y publicación. No se anulan registros reales ni se simula allí un vencimiento de catorce días. El resultado operativo de la publicación se documenta en el informe de entrega separado.
