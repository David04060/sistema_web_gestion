# Entorno local vigente — 27/10/2026

La instrucción actual sustituye el uso de copias QA para estas dos modificaciones.
Proyecto: C:\Users\David\Sistema_Web_Final. Base: sistema_web_final. PostgreSQL local ::1, puerto 5432, esquema public.

## Causa del 500 y corrección

El error real capturado del backend al consultar documentos era PostgreSQL 42P01:
`no existe la relación «entregas_secretaria»`. La base local también carecía de
`documentos.clasificacion_registro` y `entregas_secretaria_historial`.
Las pruebas previas habían migrado otra base, por lo que no acreditaban el esquema de sistema_web_final.

Ahora npm run dev vuelve a ejecutar src/server.ts con la conexión local de backend/.env.
La validación de desarrollo exige sistema_web_final en localhost, puerto configurado, esquema public
y ausencia de rama Neon; comprueba las estructuras nuevas antes de escuchar y antes de prestar
cada conexión física del pool. No depende de nombres ni OID de QA. Vite 5173 apunta a 127.0.0.1:3000.
No se alteran los comandos ni la configuración de producción.

## Migraciones aplicadas

1. 20261027-clasificacion-local.sql: clasificación obligatoria para nuevos registros; antecedentes
conservados con NULL, sin reclasificarlos. La privacidad por autor se mantiene en los predicados
SQL del backend, antes del listado y del conteo.
2. 20261027-entrega-secretaria-local.sql: tablas de asignación/entrega e historial, tres situaciones,
actores, fechas, referencia histórica, coherencia del destinatario, revisión y protección de entregas
confirmadas. Habilita antecedentes de Secretaría pendientes sin inventar asignaciones ni entregas.

Aplicador: scripts/migrar-local.mjs. Valida el destino antes de escribir, aplica las dos migraciones
en una transacción y registra nombre/checksum en migraciones_locales. No incluye las migraciones
históricas de archivos institucionales, ingresos, relevos ni sustituciones.

Comparación de migración: se conservaron los datos de las 12 tablas anteriores, los 3 documentos,
los códigos, el historial y todas las secuencias originales. No se importaron datos de otras bases.
No se borró, reinició ni creó ninguna base. No se conectó a producción.

## Verificación posterior sobre sistema_web_final

npm run test:local, contra http://localhost:5173 y el backend habitual:
39 solicitudes HTTP correctas, usando los cuatro perfiles locales existentes y tokens de sesión
firmados con el mecanismo habitual. No se crearon cuentas ni se cambiaron contraseñas.

Se registraron dos documentos nuevos identificados como verificación local (IDs 8 y 9),
recibido y emitido. Se comprobaron opciones, listado, detalle, clasificación, privacidad,
asignación a usuario y persona sin cuenta, confirmación de entrega, historial y nueva consulta
posterior conservando clasificación, destinatario y confirmación. Se rechazaron actores incorrectos,
entrega sin asignación, doble entrega y reasignación tras entregar.

Tras las pruebas seguían intactos los 3 documentos previos, sus 39 registros de historial y
los 2 movimientos anteriores. Las evidencias sin credenciales están en .private/local/.
Las pruebas QA de los informes anteriores no constituyen la evidencia de esta comprobación local.

## Arranque habitual

Terminal 1: cd C:\Users\David\Sistema_Web_Final\backend; npm run dev

Terminal 2: cd C:\Users\David\Sistema_Web_Final\frontend; npm run dev

Abrir http://localhost:5173 e iniciar sesión con las credenciales locales existentes.
No ejecutar scripts históricos de creación de copias. Los antiguos preparadores y el lanzador
servir-clasificacion-dev.mjs delegan ahora en los comandos locales actuales.

## Actualización: decisión de Dirección y entrega

Se aplicó únicamente la migración incremental `20261027-decision-direccion-local.sql` a
sistema_web_final, conservando los cinco documentos presentes, los datos de las doce tablas
anteriores y sus secuencias. No se modificaron las dos migraciones ya aplicadas.

La tabla de recorrido existente se amplió con observaciones de Dirección y referencia histórica
de ubicación. PENDIENTE_ASIGNACION se representa ahora como PENDIENTE_DECISION y
PENDIENTE_ENTREGA como DELEGADO. ENTREGADO se conserva y se incorpora GUARDADO_DIRECCION.
Las fechas, referencias de asignación y eventos anteriores permanecen intactos.

Dirección decide una sola vez: delegar o guardar. Guardar exige estante y archivador de su oficina
Dirección; conserva una referencia legible de la ubicación. No modifica la autoría ni concede edición
sobre otros datos. Delegar admite oficina, usuario, nombre manual, oficina+usuario u oficina+nombre;
rechaza ambos vacíos y oficina/usuario incompatibles. Las observaciones son opcionales.
Solo la Secretaría autora confirma la entrega de los delegados. La fecha es la confirmación registrada.

Rutas: POST /api/documentos/:id/delegar, /guardar-direccion y /confirmar-entrega.
La ruta anterior asignar-destinatario permanece como compatibilidad con las nuevas validaciones.
La decisión y la confirmación se serializan por bloqueo documental y revisión. Los triggers rechazan
la doble decisión, las combinaciones contradictorias y las modificaciones de recorridos terminados.

Verificación nueva en localhost:5173: 70 solicitudes HTTP y dos solicitudes concurrentes adicionales,
con perfiles locales existentes. Se comprobó registro recibido/emitido, opciones, detalle, todas las
combinaciones de destinatario, observaciones, ubicación de Dirección, entrega, historial, privacidad,
rechazo de edición/anulación por Dirección y conflicto entre decisiones simultáneas.
Se crearon siete documentos locales de verificación (10 a 16). Al no existir ubicación de Dirección,
se creó mediante el módulo existente el estante DIRECCION y archivador 1; se reutiliza en siguientes pruebas.
Los cinco documentos anteriores, las 41 entradas previas de historial y los dos movimientos originales
se compararon y conservaron sin cambios. No se crearon usuarios, bases ni copias.

Comprobación adicional de solo lectura: listado y opciones por los cuatro perfiles locales,
8 solicitudes correctas; Dirección solo obtiene registros propios o de Secretaría.
Typecheck y lint correctos; backend 36/36 y frontend 53/53; compilación frontend correcta.

## Consulta recíproca y documentos relacionados

Actualización posterior: el flujo también admite documentos propios de Dirección y
decisión opcional al registrar. Véase [DIRECCION_PROPIA_LOCAL.md](DIRECCION_PROPIA_LOCAL.md)
para la migración incremental aplicada, los permisos y las pruebas actuales.

Se aplicó la migración incremental 20261027-documentos-relacionados-local.sql.
El detalle vigente y la evidencia local están en [DOCUMENTOS_RELACIONADOS_LOCAL.md](DOCUMENTOS_RELACIONADOS_LOCAL.md).
