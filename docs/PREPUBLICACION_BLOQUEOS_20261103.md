# Prepublicación: bloqueo confirmado y propuesta — 3 de noviembre de 2026

## Estado

Se inspeccionaron las pestañas existentes de Google Chrome de Neon, Render y R2, el repositorio local y la configuración productiva. No se hizo commit, push, despliegue, migración ni modificación remota. Se detuvo la publicación por un problema importante, según la instrucción del usuario.

## Evidencia

1. backend/src/config/database.ts: verificarBaseDatos() lanza una excepción si perfilNeon es verdadero: «La adaptación documental nueva solo está habilitada en local». Render requiere DB_PROFILE=neon, por lo que el código actual no arrancaría allí.
2. Se consultó Neon con sistema_web_app, TLS verificado y transacción REPEATABLE READ READ ONLY. La rama efectiva coincide con production observada en Chrome. La base neondb mantiene el modelo anterior: documentos.codigo/tipo_documental_id/registrado_por_id/estado_tramite y documentos_pdf.clave/tamano/cargado_en. No existen las tablas nuevas ambitos_registro, miembros_ambito, delegaciones_documento y unidades_ubicacion. No basta con quitar la excepción del arranque.
3. Render muestra el servicio existente sistema-documental desplegado, actualizado hace cuatro días. No se solicitó un nuevo despliegue.
4. R2 documentos-pdf sigue privado. Sus reglas observadas son: abortar cargas multiparte incompletas a los siete días; eliminar objetos bajo tmp/ al día; eliminar objetos bajo qa/pdf-validacion-local/tmp/ al día. **No se observó una regla de expiración de toda la carpeta qa/**. CORS ya incluye el origen canónico de Pages y los dos orígenes locales, con GET/HEAD/PUT y content-type/if-none-match.

## Propuesta a aprobar por ser un cambio importante

- Conservar intacta la base productiva antigua neondb y preparar una base nueva del modelo actual dentro del mismo proyecto/rama Neon, sin crear cuentas ficticias ni proyectos de QA.
- Tomar la base local actual como origen de publicación, con sus cinco cuentas y datos existentes; conservar un respaldo verificable antes de transferir. No reconstruir ni borrar la base local.
- Adaptar los validadores de conexión para la identidad productiva elegida: base, usuario de aplicación, rama y TLS. Verificar estructura y permisos requeridos, en lugar de desactivar las guardas.
- Revisar los privilegios de sistema_web_app para el esquema nuevo y sus secuencias/funciones, manteniendo la separación con la credencial propietaria de preparación.
- Mantener documentos-pdf y qa/; configurar R2_PDF_PREFIX=produccion/ para que los nuevos definitivos queden en produccion/pdf/ y los temporales en tmp/produccion/. La regla actual tmp/ ya cubriría esos temporales. No aplicar expiración a produccion/pdf/.
- Comprobar las claves de los PDF existentes. Cambiar el prefijo solo afecta a las cargas nuevas: no mueve ni borra los archivos existentes. Conservar sus referencias mientras se verifica su presencia; cualquier traslado de archivos existentes debe ser copia, comprobación y actualización controlada de la nueva base, sin eliminación automática del origen.
- Preparar los cambios y pruebas de compatibilidad productiva; revisar los archivos que entrarán en Git para excluir secretos, respaldos y artefactos privados. Después commit/push y despliegue manual de Render; Pages se construye con el API productivo y se publica tras verificar el backend.

La alternativa es una migración de los datos antiguos de neondb al modelo nuevo. Requiere acordar cómo transformar circulación, responsables, ubicaciones y auditoría; no es una modificación de una palabra y no se hará automáticamente.

## Decisión pendiente

Autorizar la estrategia de publicar la base local actual en una base nueva dentro del Neon existente, conservando neondb antigua. Hasta recibir esa decisión no se cambia código de conexión, bases, roles SQL, variables de Render, objetos/reglas R2 ni despliegues.
