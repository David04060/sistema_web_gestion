# Revisión previa: Tipos Documentales y Ubicaciones

Inspección de solo lectura del 21 de octubre de 2026 sobre `sistema_web_final`.
Este documento conserva la revisión inicial. Las tres propuestas fueron aprobadas
posteriormente por el usuario e implementadas; ver [TIPOS_UBICACIONES.md](TIPOS_UBICACIONES.md).

## Tablas y restricciones comprobadas

- `tipos_documentales`: id bigint, nombre varchar(120), prefijo_codigo varchar(8)
  nullable, requiere_clave boolean y fechas con zona. Nombre único por lower(btrim),
  prefijo único cuando no es nulo y patrón de dos a ocho letras mayúsculas.
- Existen Informe/INF, Oficio/OFI, Memorando/MEM, Acta/ACT, Comunicado/COM,
  FUT/FUT y SíseVe con prefijo nulo y requiere_clave=true.
- No existe columna de estado o desactivación en tipos documentales.
- `estantes`: id bigint, usuario_id obligatorio, codigo varchar(10) y fechas.
  Código restringido por CHECK a letras mayúsculas; unicidad (usuario_id,codigo).
  No hay oficina_id ni una entidad institucional independiente del responsable.
- `archivadores`: id bigint, estante_id obligatorio, numero integer positivo y
  fechas. Unicidad (estante_id,numero).
- Las FK de ubicaciones usan ON DELETE RESTRICT. No se propone borrado físico.
- Los tres catálogos cuentan con disparadores de auditoría y actualización de fechas.
- El trigger de tipos protege el nombre y la restricción de SíseVe y bloquea cambios
  de prefijo cuando hay documentos. El servicio también deberá considerar
  `correlativos_documentales` para proteger códigos previamente generados.
- El trigger existente de documentos genera códigos. No se modificará ni se
  expondrá desde estos módulos; Documentos permanece fuera del alcance.
- Al inspeccionar: cero estantes, archivadores, documentos y correlativos.

## Limitación institucional y propuesta posteriormente autorizada

Derivar la oficina del usuario no permite conservar la ubicación física cuando el
responsable cambia de oficina. Reasignar usuario_id sin una oficina propia tampoco
permite verificar que el estante permanece en la oficina institucional original.

Se propone agregar `estantes.oficina_id` bigint obligatorio con FK ON DELETE RESTRICT
a oficinas y un índice para consultas por oficina. Conservar usuario_id como responsable
actual reasignable y los IDs existentes de estantes y archivadores. La auditoría ya
existente registra los cambios de responsable; no se propone una tabla histórica nueva.

Antes de aplicar una modificación autorizada se debe volver a comprobar el número
de filas: si aparecen estantes, no se asignará oficina automáticamente; deberá
validarse una correspondencia para los registros existentes. La FK debe verificarse
y no deben reiniciarse identidades ni modificarse otras tablas.

La oficina del estante quedaría estable al cambiar la cuenta de oficina. La
reasignación administrativa exigiría un responsable activo de la misma oficina.
Los responsables anteriores y las cuentas inactivas conservarían sus referencias.

## Decisiones solicitadas y posteriormente confirmadas

1. Autorizar oficina_id en estantes para representar la ubicación institucional.
2. Aprobar permisos: propietario administra lo propio; Director(a) consulta todo;
   Administrador administra todo y reasigna dentro de la oficina del estante.
3. Definir si el Administrador puede elegir prefijos para tipos nuevos o estos deben
   quedar sin prefijo hasta una aprobación posterior. No se asignarán prefijos
   automáticos ni se cambiará requiere_clave de SíseVe.

La inspección inicial fue de solo lectura. Tras la aprobación se aplicó oficina_id
y se implementaron los módulos. El informe técnico final distingue el cambio de
esquema autorizado de las escrituras de QA revertidas.
