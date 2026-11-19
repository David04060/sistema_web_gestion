# Retirada completa de campos opcionales

**Objetivo:** retirar la función autorizada, conservar los datos ajenos y publicar en los destinos existentes.
**Arquitectura:** conservar React/Express/PostgreSQL/R2; modificar contratos y consultas conjuntamente. Una migración 014 retira objetos específicos sin CASCADE y elimina exclusivamente auditoría CAMPO_OPCIONAL. Las funciones productivas de permisos se conservan; la alineación local se hace por separado tras pruebas.
**Especificación:** solicitud del usuario en este chat; informe previo recuperado del chat «Auditar elementos obsoletos».

## Restricciones

- Conservar el documento modificado y los ocho archivos inicialmente sin seguimiento.
- No reescribir 001–013; no recrear bases, clústeres ni usuarios productivos.
- Validar identidad local loopback y Neon/TLS/rama antes de operar.
- Respaldar y verificar integridad antes de DDL; conservar huellas de todas las tablas ajenas.
- No deshabilitar disparadores de manera general. Mantener protección de otras auditorías.
- Pruebas en la base habitual; escrituras de comprobación dentro de transacciones revertidas.

## Ejecución

- [x] Comparar Git, inspeccionar cambios previos, recuperar informe y consultar catálogos/filas en ambas bases.
- [x] Confirmar Pages y controles locales/publicados; completar grafo de consumidores.
- [x] Modificar primero pruebas XLSX para exigir ausencia de la columna en exportaciones con filas y vacías; comprobar fallo.
- [x] Retirar campos, valores y opcionales de consultas, contratos, interfaz y pruebas antiguas específicas.
- [x] Verificar índice duplicado por catálogo; retirar solo el redundante sin dependencias.
- [x] Comparar reglas documentales/PDF usando registros existentes, y ensayar permisos/guardas en transacciones revertidas.
- [x] Respaldar local, aplicar 014 y alinear exclusivamente local con definiciones productivas verificadas.
- [x] Actualizar instalador/documentación del esquema sin alterar migraciones históricas.
- [x] Ejecutar suites pertinentes sin runner de clúster, typecheck, lint, build y API/SQL local.
- [x] Revisar diff, publicar commit en main y desplegar Render/Pages.
- [x] Revalidar Neon, respaldo cifrado e integridad; aplicar exclusivamente limpieza 014 y verificar conservación.
- [x] Comprobar SQL, API autenticada, XLSX y navegador publicados; documentar resultados y límites.

## Focos de revisión

- XLSX vacío mantiene solo columnas vigentes, autofiltro, tipos y fechas de Perú.
- Corrección/alta rechazan propiedades retiradas y detalle deja de depender de tablas eliminadas.
- La auditoría general rechaza UPDATE/DELETE/TRUNCATE durante y después de la limpieza.
- Autor, tercero, destinatario, roles administrativos y titular vigente de oficina conservan reglas productivas.
- Scripts de instalación y pruebas no recrean accidentalmente objetos retirados después de 014.

Comprobación final: los candidatos con consumidores posibles se conservaron y explicaron en el informe. Render y Pages ejecutan 55d916b; SQL final coincide entre local y Neon. No se probó instalación nueva ni borrado real de retención, de acuerdo con los límites documentados.
