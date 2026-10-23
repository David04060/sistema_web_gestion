> Estado actual: migración permanente autorizada y aplicada; operaciones completas implementadas. Véase [DOCUMENTOS_MOVIMIENTOS.md](DOCUMENTOS_MOVIMIENTOS.md).
> Todo el contenido que sigue es la revisión histórica anterior a la autorización.

> Estado vigente: la opción A ya fue validada en PostgreSQL mediante ROLLBACK y base
> QA aislada. **No hay migración permanente aplicada.** Los hallazgos y resultados
> están en [VALIDACION_MIGRACION_DOCUMENTAL.md](VALIDACION_MIGRACION_DOCUMENTAL.md).
> Las notas siguientes conservan la revisión y propuestas históricas.

> Revisión vigente: **opción A**. Autorizar conserva PENDIENTE_DECISION; la salida
> cambia directamente a EN_TRASLADO. El diseño y el SQL corregidos están en
> [PROPUESTA_FLUJO_CINCO_ESTADOS.md](PROPUESTA_FLUJO_CINCO_ESTADOS.md).
> Las referencias de esta revisión histórica a RECIBIDO como paso de autorización
> quedan descartadas. No se ha aplicado el SQL.

> Actualizacion: el usuario definio exclusivamente cinco estados y ordeno revisar
> el SQL antes de ejecutarlo. Las propuestas previas de equivalencias quedan
> sustituidas por [PROPUESTA_FLUJO_CINCO_ESTADOS.md](PROPUESTA_FLUJO_CINCO_ESTADOS.md).
> El archivo SQL minimo anterior fue descartado; no se aplico ningun cambio de esquema.

# Revision previa de Documentos y Movimientos

Inspeccion de solo lectura del 21 de octubre de 2026. No se han aplicado cambios de
esquema ni modificado registros institucionales en esta tarea.

## Esquema comprobado

Documentos contiene id, codigo (48), tipo_documental_id, asunto, remitente (250)
nullable, observaciones nullable, archivador_id nullable, registrado_por_id,
responsable_actual_id, oficina_responsable_id, estado_tramite, activo y fechas.
No existen numero_documento, fecha_documento, numero_registro, anio_codigo ni
consecutivo_codigo.

Estados de documentos: PENDIENTE_ENVIO, EN_TRASLADO, RECIBIDO,
DEVOLUCION_PENDIENTE, CANCELADO. PENDIENTE_DECISION no esta admitido.
Movimientos admite los mismos estados mas DEVUELTO. Sus destinos son obligatorios.
El documento no tiene un estado DEVUELTO; la recuperacion necesita definir el
estado documental posterior sin inventar una equivalencia.

Los movimientos tienen oficinas/usuarios de origen y destino, registrado_por_id,
decidido_por_id, trasladado_por_id, salida, recepcion, rechazo con motivo,
confirmacion de devolucion y cancelacion con motivo, con fechas y autores.
El origen, destino y decidido_por_id son inmutables despues de crear la fila.
El indice parcial unico impide mas de un movimiento PENDIENTE_ENVIO, EN_TRASLADO
o DEVOLUCION_PENDIENTE por documento.

Los triggers impiden borrar documentos y movimientos, cambiar identificadores y
autoria documental, modificar documentos anulados y modificar movimientos cerrados.
Los cambios documentales requieren app.usuario_actor_id y app.motivo_documental.
La auditoria de tipos restringidos oculta contenido. Los endpoints generales deberan
excluirlos antes de consultar filas, conteos, filtros, detalles, historial y movimientos.

El generador existente utiliza prefijo, anio America/Lima y correlativo por tipo/anio
con INSERT ON CONFLICT DO UPDATE. Genera codigo, fecha y conserva el codigo en edicion.
No se creara un generador alternativo. Los documentos sin prefijo seran rechazados.

## Decisiones pendientes de confirmacion

Se consultaron al usuario el flujo Mesa de Partes/Direccion, permisos de correccion,
responsabilidad inicial y custodia durante traslado, recepcion, rechazo y recuperacion.

La propuesta SQL minima esta en backend/scripts/sql/20261021-documentos-pendiente-decision.sql.
Solo agrega PENDIENTE_DECISION al CHECK del documento. No necesita alterar movimientos:
se crearian con destino real cuando Direccion decide. Esta propuesta reemplaza la
idea inicial mas amplia de agregar el estado tambien a movimientos. No esta aplicada.

Ademas debe confirmarse si al recuperar fisicamente un documento devuelto su estado
documental vuelve a RECIBIDO (custodia confirmada) o requiere otra denominacion.
El movimiento conservaria DEVUELTO como resultado historico. No se asumira esa
correspondencia antes de aprobacion.

## Trabajo independiente iniciado

Se agregaron contratos estrictos de entrada y filtros, repositorio de consulta con
predicados SQL de autorizacion y exclusion de restringidos, y unidad transaccional
con contexto de auditoria. TypeScript pasa. No se montaron endpoints incompletos ni
se presentan como terminadas funcionalidades pendientes de las decisiones anteriores.

## Avance independiente de las decisiones

Se implementaron consultas GET /api/documentos, /api/documentos/:id,
/api/documentos/:id/historial, /api/movimientos y /api/movimientos/:id.
Los predicados de SQL excluyen tipos restringidos y SiseVe antes de conteos y filas.
El Director consulta documentos ordinarios; Administrador no recibe consulta global.
Los participantes historicos consultan recorrido sin adquirir automaticamente acceso
al asunto, observaciones o archivador. Las escrituras del flujo aun no se exponen.

Se agregaron listados/detalles React con API validada, paginacion, busqueda basica,
estados de carga/error y enlaces funcionales al recorrido. El menu autenticado incorpora
ambos modulos. Faltan formularios de escritura y acciones sujetas a la aprobacion.
No se declara completa la implementacion de ninguno de los dos modulos.

Verificaciones iniciales: backend TypeScript, lint, build y 25 pruebas aprobadas;
cinco resultados aprobados de consultas HTTP con PostgreSQL real y ROLLBACK.
Frontend TypeScript correcto. Las pruebas de consultas usan fixtures transaccionales
sobre Informe; no crean tipos ficticios ni modifican cuentas institucionales.
La propuesta SQL sigue sin aplicar y las transiciones siguen pendientes de respuesta.
