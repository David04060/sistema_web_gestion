> Actualización posterior: SíseVe ya cuenta con módulo específico y prefijo SISEVE elegido por el usuario. Véase [SISEVE.md](SISEVE.md). Los endpoints ordinarios conservan sus exclusiones. Las menciones siguientes a prefijo nulo o módulo pendiente corresponden a la etapa anterior.

# Documentos y movimientos: entrega verificada

Fecha local: 21 de octubre de 2026. Alcance: originales fisicos ordinarios; sin archivos digitales, copias ni modulo SiseVe.

## Migracion aplicada

El usuario autorizo expresamente aplicar permanentemente `backend/scripts/sql/20261021-flujo-documental-cinco-estados.sql` y continuar. Se comprobo su SHA-256 antes de ejecutarlo:

`5f5ab7e176ff5ea74a8cd9d78c880eb69035fb45726c4f536be033f3d36b0422`

Se creo un respaldo privado en `backend/.private/backups/antes-flujo-cinco-estados-20261021.dump` mediante pg_dump en formato custom. pg_restore --list pudo leer su catalogo. **No se realizo un simulacro de restauracion del respaldo.** `.private/` esta excluido por .gitignore.

El SQL se ejecuto completo con su COMMIT autorizado en `sistema_web_final`. No se modifico el archivo despues de aprobarse; su comentario inicial de pendiente corresponde al momento en que se preparo. No volver a ejecutar este SQL: agrega columnas y restricciones que ya existen.

La estructura aplicada esta en MIGRACION_DOCUMENTAL_APLICADA.json; la comprobacion posterior de indices, defaults y cantidades esta en VERIFICACION_FINAL_POSTGRESQL_DOCUMENTAL.json. Hay tres FK de autorizacion, CHECK de triada completa o nula, triggers de integridad, control diferido al COMMIT e indice unico de movimientos abiertos. El generador y correlativos existentes se conservan.

## Funcionalidades

Documentos: registro, codigo automatico, consulta autorizada paginada, busqueda por codigo/asunto/remitente, filtros por tipo/oficina/responsable/estado/archivador/vigencia, detalle, correccion con motivo, anulacion logica con motivo, responsable/oficina, ubicacion registrada, ultimo antecedente auditado, historial y recorrido.

Movimientos: bandejas de recepcion propia, salidas propias y recuperaciones pendientes; consulta del recorrido, decision y retiro de decision de Direccion, solicitud de nueva decision en Mesa de Partes, salida fisica, recepcion con archivador propio opcional, rechazo con motivo, recuperacion fisica y cancelacion con recuperacion y motivo. Las acciones se presentan segun rol, custodia y estado; Express y PostgreSQL vuelven a comprobarlas.

## Estados y custodia

| Evento | Documento | Movimiento |
|---|---|---|
| Registro inicial en Mesa de Partes | PENDIENTE_DECISION | No existe |
| Autorizacion o retiro por Direccion | PENDIENTE_DECISION | No existe |
| Registro inicial fuera de Mesa de Partes | RECIBIDO, custodia inicial confirmada | No existe |
| Salida fisica | EN_TRASLADO, conserva origen como responsable de entrega, sin archivador confirmado | EN_TRASLADO |
| Recepcion por destinatario | RECIBIDO, custodia/oficina del destinatario | RECIBIDO |
| Rechazo con motivo | RECHAZADO, custodia en origen, sin archivador confirmado | RECHAZADO abierto |
| Recuperacion confirmada por origen | RECIBIDO en origen | Conserva RECHAZADO, queda cerrado con actor/fecha de recuperacion |
| Cancelacion del traslado recuperado | RECIBIDO en origen | CANCELADO con motivo, actor y recuperacion |
| Anulacion logica del registro | CANCELADO y activo=false | No altera movimientos cerrados |

No existen estados adicionales. PENDIENTE_DECISION pertenece al documento, nunca a un movimiento fisico. La presencia de los tres campos de autorizacion distingue visualmente espera de decision y espera de salida.

Una autorizacion conserva destinatario, oficina de destino y usuario autorizante. La salida copia esa informacion al movimiento, retira la triada del documento y cambia su estado dentro de la misma transaccion. La oficina del destinatario se comprueba de nuevo; no se sustituye silenciosamente por otra.

Solo el destinatario confirma recepcion o rechazo. Solo origen confirma recuperacion o cancelacion en traslado. Cancelar exige confirmar que el original ya se recupero, no sirve como solicitud de devolucion. No se cancela un movimiento recibido ni se modifica un movimiento cerrado. Un rechazo sin recuperacion bloquea otro envio.

Tras recibir, un custodio ordinario puede derivar de nuevo. Si la custodia vuelve a Mesa de Partes, se solicita una nueva decision de Direccion. Ninguna edicion de contenido cambia codigo, tipo, autoria, responsable, oficina o archivador.

## Contratos HTTP

Todas las rutas requieren Bearer JWT y responden sin cache. GET de listados devuelve filas, total, pagina y limite; detalle devuelve `{documento}` o `{movimiento}`. IDs bigint se serializan como texto. Las escrituras aceptan objetos estrictos Zod; nunca aceptan actor, fechas, codigo ni estado arbitrario.

| Metodo | Endpoint | Entrada o finalidad |
|---|---|---|
| GET | /api/documentos | q, tipo_documental_id, oficina_id, responsable_id, archivador_id, estado, activo, pagina, limite |
| GET | /api/documentos/opciones | Tipos ordinarios, destinos activos con oficina, archivadores propios, filtros autorizados y capacidad de registro |
| POST | /api/documentos | tipo_documental_id, asunto, remitente nullable, observaciones nullable, archivador_id nullable |
| GET | /api/documentos/:id | Contenido autorizado, triada, permisos de interfaz y antecedente de ubicacion |
| PUT | /api/documentos/:id | asunto, remitente nullable, observaciones nullable, motivo |
| GET | /api/documentos/:id/historial | Auditoria autorizada, actor, fecha, valores anteriores/nuevos y motivo |
| POST | /api/documentos/:id/anular | motivo |
| POST | /api/documentos/:id/autorizar | usuario_destino_id, motivo |
| POST | /api/documentos/:id/retirar-autorizacion | motivo |
| POST | /api/documentos/:id/solicitar-decision | motivo |
| GET | /api/movimientos | documento_id, estado, bandeja=entrada/salida/recuperacion, pagina, limite |
| GET | /api/movimientos/:id | Recorrido y resultado historico, sin asunto ni ubicacion confidencial |
| POST | /api/movimientos | documento_id, usuario_destino_id, motivo; confirma la salida real |
| POST | /api/movimientos/:id/recibir | archivador_id nullable |
| POST | /api/movimientos/:id/rechazar | motivo |
| POST | /api/movimientos/:id/recuperar | archivador_id nullable, motivo, confirmar_recuperacion=true |
| POST | /api/movimientos/:id/cancelar | archivador_id nullable, motivo, confirmar_recuperacion=true |

Creacion devuelve 201; consultas y confirmaciones 200; entrada invalida 400; JWT ausente/invalido 401; operacion prohibida sobre recurso visible 403; recurso inexistente o no visible 404; transicion incompatible 409. Los detalles internos de SQL no se devuelven al cliente. Cambiar contraseña o desactivar mantiene el mecanismo existente de version JWT.

## Permisos y confidencialidad

- El registrador y el custodio consultan su contenido autorizado. Solo el custodio actual corrige o anula, sin circulacion abierta.
- Director(a) consulta documentos ordinarios institucionales y autoriza desde Direccion. La consulta global no le concede edicion de documentos ajenos.
- Secretaria no recibe consulta global. Mesa de Partes utiliza el circuito de decision y confirma la salida como remitente.
- Administrador no recibe acceso global al contenido por su rol tecnico. Si no tiene oficina no puede registrar documentos; puede gestionar su asignacion con el modulo de cuentas existente.
- Participantes historicos consultan el recorrido autorizado sin adquirir por ello contenido completo, ubicacion ni derecho de edicion.
- Todo tipo `requiere_clave=true` o denominado SiseVe queda excluido en SQL antes de conteos, paginacion, detalle, historial y recorrido. Tampoco se ofrece para registro general. No se implemento el modulo reservado.
- Opciones de filtro de oficina/responsable/ubicacion proceden de documentos visibles. El catalogo de tipos es institucional y los destinos solo incluyen cuentas activas con oficina; no se serializan correos ni hashes.

## Arquitectura y concurrencia

Routes autentica y define contratos; Controllers adapta solicitudes/respuestas y valida con Zod; Services decide permisos, custodia y transiciones; Repositories contiene SQL parametrizado y proyecciones; PostgreSQL genera codigos y protege integridad/auditoria.

`transaccionDocumental` configura actor/motivo con set_config local y revierte toda la escritura ante un fallo. Se bloquea primero el documento y despues el movimiento; se revalidan cuenta y destino. Comparte el bloqueo administrativo existente para coordinar cambios de cuentas y ubicaciones. Este bloqueo serializa las escrituras de la aplicacion; los correlativos y restricciones de PostgreSQL protegen tambien conexiones SQL concurrentes.

El codigo se genera exclusivamente con el trigger y correlativo institucional: PREFIJO + anio America/Lima + consecutivo, con unicidad e inmutabilidad. Doce sesiones PostgreSQL independientes comprobaron codigos consecutivos y unicos. Dos salidas concurrentes produjeron exactamente una confirmacion. El indice parcial tambien rechaza duplicados dentro de una misma transaccion. Los triggers diferidos impiden confirmar un movimiento sin actualizar documento/custodia, o viceversa.

React separa paginas de listado/detalle/formulario, componentes de operaciones e historial, contratos Zod y API. Reutiliza AuthProvider, React Router, React Hook Form, Fetch y componentes/estilos compartidos. El historial tiene CSS Module propio y se renderiza como texto seguro sin HTML inyectado. Tailwind conserva su integracion existente.

## Auditoria y ubicacion

Se conserva el trigger de historial existente y su actor autenticado. Correccion, decision, salida, recepcion, rechazo, recuperacion, cancelacion y anulacion dejan fecha, cambios y motivo contextual. Las modificaciones de contenido y decisiones exigen motivo introducido por el usuario; recepcion utiliza el evento explicito confirmado por su destinatario.

Durante EN_TRASLADO y RECHAZADO no se presenta un archivador como posicion confirmada. El ultimo archivador retirado se consulta en la auditoria y aparece como antecedente con fecha, separado de la ubicacion registrada. Sus nombres se resuelven con el catalogo conservado; los IDs y valores anteriores permanecen en la auditoria aunque una denominacion cambie.

## Verificaciones realizadas

| Comprobacion | Resultado |
|---|---|
| Backend typecheck, lint, build | Aprobados |
| Backend npm test | 25 resultados aprobados; regresiones aisladas de contratos/autenticacion |
| Frontend typecheck, lint, build Vite | Aprobados |
| Frontend npm test | 37 resultados aprobados |
| test:migracion-documental | 34 resultados aprobados, contando el grupo principal |
| Suite anterior admin.integration.mjs, ejecutada dentro de QA | 14 resultados aprobados y ROLLBACK comprobado |
| Suite anterior catalogos.integration.mjs, dentro de QA | 14 resultados aprobados y ROLLBACK comprobado |
| Suite anterior documentos.consultas.integration.mjs, dentro de QA | 5 resultados aprobados y ROLLBACK comprobado |
| Navegador, React contra Express/PostgreSQL reales en QA | Registro, correccion, autorizacion, salida, recepcion, derivacion posterior, rechazo, recuperacion, cancelacion y anulacion comprobados |
| Sesion y navegacion reales en QA | Tres sesiones independientes; recarga conserva sesion; logout redirige a login |
| Movil | Viewport 390 x 844; detalle, filtros y operaciones sin desbordamiento horizontal de pagina |
| Consola del navegador consultada | Sin errores ni advertencias en la vista revisada |

Comando de integracion desde backend (PowerShell):

```powershell
$env:VALIDAR_FLUJO_DOCUMENTAL='ROLLBACK_Y_QA_AISLADA'
npm run test:migracion-documental
```

El verificador utiliza una base efimera con nombre aleatorio y guardas de identidad. Copia exclusivamente esquema y catalogos, crea cuentas de QA con scrypt y ejecuta SQL y HTTP reales. Alinea las secuencias de catalogos solo en QA. Las suites anteriores se ejecutan en procesos independientes, comprobando su numero de pruebas y el mensaje de ROLLBACK; no se confunde la salida vacia de un runner heredado con una suite ejecutada.

Las escrituras de los nuevos flujos se confirmaron solo en esa base aislada, posteriormente eliminada. Las suites heredadas usan ademas transacciones revertidas. Se compararon estructura y huellas de todas las tablas institucionales antes y despues. No se afirman registros permanentes de documentos en la base institucional: sigue con 0 documentos, 0 movimientos y 0 correlativos al cierre, conservando su cuenta existente.

Resultados reproducibles: RESULTADOS_INTEGRACION_DOCUMENTAL.json. Evidencias del navegador: evidencias/documento-movil-qa.png y evidencias/recorrido-escritorio-qa.png, exclusivamente con datos de QA. La presentacion se comprobo por emulacion de viewport; no se probo en un telefono fisico ni en todos los navegadores.

## Incidencias resueltas y limites

- El formulario tenia un evento de seleccion que sobrescribia React Hook Form: se corrigio y se repitieron registro y edicion desde el navegador.
- La cancelacion utiliza un mismo instante SQL para recuperacion y cancelacion, evitando inconsistencias por orden de evaluacion del reloj.
- Los fixtures anteriores se adaptaron al estado inicial real de Mesa de Partes y al numero de ubicaciones existentes, sin cambiar reglas de producto.
- La base institucional recibio exclusivamente el cambio de esquema aprobado. No se crearon cuentas ni documentos institucionales de prueba.
- La verificacion no constituye una prueba de carga prolongada, un simulacro de restauracion ni una comprobacion fisica del traslado de un papel: la confirmacion depende de la declaracion del responsable autenticado.
- No hay decisiones funcionales pendientes dentro de este alcance. No se desarrollo SiseVe, archivos adjuntos, copias ni otros modulos.

## Archivos

Consultar CAMBIOS_DOCUMENTOS_MOVIMIENTOS.md para el manifiesto de esta entrega.
