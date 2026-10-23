# Flujo definitivo aplicado — Opción A

21 de octubre de 2026. **Aplicado permanentemente con autorización expresa y verificado en PostgreSQL.** Esta versión
sustituye la propuesta que utilizaba RECIBIDO como paso intermedio de la autorización.
La implementación de operaciones y su integración HTTP/React se documentan en [DOCUMENTOS_MOVIMIENTOS.md](DOCUMENTOS_MOVIMIENTOS.md). El SQL conserva su hash aprobado; no debe ejecutarse una segunda vez.

## Decisiones y estados

Solo existen los cinco estados aprobados: PENDIENTE_DECISION, EN_TRASLADO, RECIBIDO,
RECHAZADO y CANCELADO. Documentos utiliza los cinco; un movimiento físico utiliza
los últimos cuatro y nace únicamente al confirmarse la salida del remitente.

En Mesa de Partes el documento permanece PENDIENTE_DECISION tanto antes como después
de la autorización de Dirección. La presencia de los tres datos de autorización
completos distingue «Espera decisión» de «Autorizado; espera salida». Son descripciones
visuales derivadas, no estados nuevos, columnas de estado ni movimientos físicos.

## Campos de autorización propuestos

Se mantienen las tres FK opcionales ya propuestas en documentos:

- destinatario_autorizado_id → usuarios(id).
- oficina_destino_autorizada_id → oficinas(id).
- decision_autorizada_por_id → usuarios(id).

El CHECK exige las tres nulas o las tres completas y, en ese último caso,
estado_tramite=PENDIENTE_DECISION. Solo Dirección puede informar/revisar esos datos,
sin cambiar asunto, custodia, archivador ni estado. La revocación antes de salir deja
las tres nulas y conserva PENDIENTE_DECISION, con motivo e historial.

El destinatario debe estar activo y pertenecer a la oficina autorizada al
autorizar, al salir y al recibir. Se bloquea su fila FOR SHARE durante cada operación para
coordinar cambios concurrentes de cuenta/oficina. Si cambia de oficina entre ambos
momentos, la salida se rechaza y Dirección debe revisar el destino; no se sustituye
la oficina autorizada silenciosamente. Las referencias históricas ya confirmadas
no se reinterpretan cuando cambia una cuenta.

## Transiciones de documentos

| Origen | Destino | Operación |
|---|---|---|
| Nuevo en Mesa de Partes | PENDIENTE_DECISION | Registro con custodio inicial |
| PENDIENTE_DECISION | PENDIENTE_DECISION | Dirección autoriza o revisa; sin movimiento |
| PENDIENTE_DECISION | PENDIENTE_DECISION | Revocar autorización antes de salir; sin movimiento |
| PENDIENTE_DECISION | EN_TRASLADO | Remitente confirma salida con autorización válida |
| Nuevo fuera de ese flujo | RECIBIDO | Custodia inicial confirmada del registrador |
| RECIBIDO | PENDIENTE_DECISION | Solicitar decisión cuando corresponda al circuito de Dirección |
| RECIBIDO | EN_TRASLADO | Derivación directa autorizada fuera de ese circuito |
| EN_TRASLADO | RECIBIDO | Destinatario confirma recepción, o remitente recupera al cancelar |
| EN_TRASLADO | RECHAZADO | Destinatario rechaza con motivo |
| RECHAZADO | RECIBIDO | Remitente confirma recuperación física |
| PENDIENTE_DECISION / RECIBIDO | CANCELADO | Anulación lógica sin movimiento abierto y con motivo |
| CANCELADO | Ninguno | Registro inmutable |

No se admite PENDIENTE_DECISION → RECIBIDO. La autorización no altera el estado.
Para derivaciones posteriores, los custodios fuera de Mesa de Partes conservan el
circuito directo; Mesa de Partes vuelve a solicitar decisión antes de otra salida.
RECIBIDO conserva su significado de custodia confirmada al registrar fuera del
circuito de decisión, recibir o recuperar físicamente; no representa una autorización.

## Movimientos y recuperación

| Origen | Destino | Operación |
|---|---|---|
| Nuevo | EN_TRASLADO | Salida física del remitente |
| EN_TRASLADO | RECIBIDO | Recepción por el destinatario |
| EN_TRASLADO | RECHAZADO | Rechazo por el destinatario, con motivo |
| EN_TRASLADO | CANCELADO | Remitente cancela y confirma recuperación física, con motivo |
| RECHAZADO sin recuperación | Conserva RECHAZADO, con recuperación | Completar una vez autor/fecha de recuperación |
| RECIBIDO / CANCELADO / RECHAZADO recuperado | Ninguno | Historial cerrado inmutable |

RECHAZADO sin recuperación confirmada continúa siendo un movimiento abierto y
bloquea otro envío. La confirmación utiliza los campos existentes de devolución;
no crea un sexto estado. El documento vuelve a RECIBIDO en origen y el movimiento
conserva RECHAZADO con su resultado y fechas. Cancelar un traslado tampoco anula el
registro documental: documento RECIBIDO en origen, movimiento CANCELADO. La anulación
documental usa activo=false y CANCELADO y conserva código, autoría e historial.

## Salida atómica y custodia

El servicio futuro deberá ejecutar en una única conexión pg y transacción:

1. BEGIN; adquirir el advisory lock ya compartido y configurar actor/motivo locales.
2. Bloquear el documento FOR UPDATE y validar sesión, permisos y autorización.
3. INSERT del movimiento EN_TRASLADO copiando los destinos y autor de autorización
   del documento, además del origen y remitente actuales y la salida generada en SQL.
4. UPDATE del documento directamente PENDIENTE_DECISION → EN_TRASLADO, dejando
   archivador_id y los tres datos de autorización en null. El responsable de entrega
   y la oficina de origen se conservan hasta recepción o recuperación confirmada.
5. Comprobar los constraint triggers diferidos y COMMIT. Ante error: ROLLBACK.

El orden importa: insertar el movimiento y después actualizar el documento. El
trigger de salida comprueba el documento aún autorizado; el trigger del documento
comprueba que el movimiento corresponde exactamente a su autorización anterior.
Las comprobaciones diferidas inspeccionan el resultado final: no permiten confirmar
solo una mitad. También controlan recepción, rechazo y recuperación: al cerrar un
movimiento, la custodia documental final debe corresponder a su resultado.

El movimiento conserva decidido_por_id, destino, origen, registrado_por_id,
trasladado_por_id y fecha_salida. Esos datos históricos quedan inmutables. La fecha
de la autorización y los valores anteriores siguen en la auditoría del documento,
vinculable por documento_id; no se elimina el historial al consumir la autorización.

El archivador es opcional al registrar y confirmar recepción/recuperación y debe
corresponder al responsable y oficina de custodia. Salir elimina su condición de
ubicación confirmada; la última ubicación permanece como antecedente auditado.
No se permite editar el archivador desde una corrección genérica.

## CHECK, fechas y concurrencia

- CHECK de documento con exactamente cinco valores; CHECK de movimiento con cuatro.
- Autorización completa únicamente en PENDIENTE_DECISION; se rechazan combinaciones parciales.
- Estado CANCELADO del documento exige activo=false y viceversa.
- EN_TRASLADO y RECHAZADO no admiten archivador confirmado en el documento.
- Salida exige fecha finita, no anterior al registro documental y remitente/registrador coherentes.
- Recepción exige destinatario y fecha; rechazo exige destinatario, fecha y motivo.
- Recuperación exige remitente y fecha; cancelación de traslado exige motivo y recuperación física.
- Se conservan y refuerzan las parejas autor/fecha para evitar que NULL eluda un CHECK.
- Fechas de recepción/rechazo no preceden a la salida; recuperación no precede al
  rechazo o salida según el evento; cancelación no precede a la recuperación.
- Fechas no admiten infinitos. La salida no puede anteceder a la última modificación
  del documento, incluida su autorización. Los servicios generarán los instantes con PostgreSQL,
  sin aceptar fechas de evento del cliente. Para cancelar, utilizarán un mismo
  instante SQL para fecha_cancelacion y fecha_confirmacion_devolucion.
- Índice único parcial: estado EN_TRASLADO o RECHAZADO con recuperación sin confirmar.
- Bloqueo FOR UPDATE del documento coordina salida y eventos; el índice impide dos
  movimientos abiertos incluso ante solicitudes concurrentes.

## Auditoría

Se conservan fn_documentos_generar_codigo, correlativos y los triggers de bloqueo
de eliminación física. Se actualiza fn_documentos_auditar únicamente para clasificar
como DECISION la modificación de la autorización manteniendo PENDIENTE_DECISION.
DECISION es una clase de evento JSON de auditoría; no es otro estado.

Se mantienen actor autenticado, fecha/hora, motivo de 1 a 1000 caracteres y cambios
antes/después. Salida y consumo de autorización se auditan junto al movimiento.
Las reglas existentes que ocultan contenidos restringidos se preservan. Estos
cambios no habilitan acceso al módulo específico SíseVe ni conceden permisos globales
al Administrador técnico.

## Cambios de estructura propuestos, no aplicados

SQL completo: backend/scripts/sql/20261021-flujo-documental-cinco-estados.sql.

- Tres columnas de autorización con FK, CHECK y defaults de estados revisados.
- Sustitución de las funciones de protección de documentos y movimientos.
- Trigger de documento ampliado a INSERT/UPDATE para validar custodia y estado inicial.
- Funciones auxiliares para actor vigente, destino y archivador.
- Trigger de movimiento BEFORE INSERT que valida salida contra la autorización.
- Dos constraint triggers DEFERRABLE INITIALLY DEFERRED para coherencia final de circulación.
- Actualización de clasificación de auditoría y del índice parcial de movimientos abiertos.

El SQL verifica la base, adquiere bloqueos con timeout y aborta ante estados o
relaciones incompatibles. No convierte, elimina ni reasigna registros existentes.
Los CHECK se validan contra todas las filas y se comprueba también la coherencia de
custodia para movimientos abiertos y el último cerrado. Todo DDL está dentro de una
transacción; cualquier error revierte el conjunto.

La inspección de solo lectura de esta revisión encontró cero documentos, cero
movimientos y ninguna de las tres columnas nuevas. La instantánea de las definiciones
actuales está en ESQUEMA_ANTES_OPCION_A.json; no contiene credenciales ni datos personales
y no se presenta como una copia de seguridad de datos o una prueba de restauración.

El SQL se validó con ROLLBACK en sistema_web_final y se probó en una base QA
eliminada al terminar. No se aplicó permanentemente. Ver el informe de
[validación y resultados](VALIDACION_MIGRACION_DOCUMENTAL.md). La aplicación definitiva
y la implementación completa siguen pendientes de autorización.
