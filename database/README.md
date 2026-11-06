# Base documental local instalada

Destino autorizado: `sistema_web_documental_final`, PostgreSQL local `localhost:5432`
(conexión observada `::1/128`), OID `98367`, esquema `public`.
La base anterior `sistema_web_final`, OID `62150`, se conserva sin escritura.

## Archivos y ejecución

- `sistema_documental_instalacion.sql`: definición completa exportada **del catálogo
  instalado**, incluidos los ajustes incrementales y los catálogos iniciales.
  Es un instalador para otra base nueva vacía, **no se ejecutó ni debe ejecutarse
  de nuevo en la base actual**. Se generó con pg_dump 18, sin propietarios ni secretos.
- `changes/001-ajustes-integracion-local.sql`: primer incremental aplicado en esta
  adaptación. Transacción sobre la base nueva; agrega `pdf_cargas.revision_esperada`,
  permite anulación de guardados aún no delegados, acelera limpieza de PDF reemplazados
  y cierra el caso de actor inexistente al renombrar campos. No crea cuentas.
- `changes/002-corregir-ambiguedad-delegacion-local.sql`: corrección local aplicada
  a `validar_delegacion()`: califica las columnas de usuarios y renombra la variable
  que colisionaba con `nombre`. No cambia permisos, autoría, ámbito ni registros.
- `changes/003-oficinas-y-rutas-local.sql`: reserva Dirección y Mesa de Partes a
  sus roles correspondientes también en PostgreSQL y genera rutas legibles para
  nuevas ubicaciones documentales. No añade columnas ni modifica datos anteriores.
- `changes/004-oficinas-inactivas-local.sql`: aplicado localmente durante la revisión
  integral. Rechaza nuevas asignaciones a oficinas inactivas, conservando las
  asignaciones anteriores. Modifica únicamente `validar_usuario_oficina()`; las
  huellas de las 21 tablas coincidieron antes y después de la transacción.
- `schema/*.schema.sql`: documentación agrupada del esquema instalado. **No son
  migraciones**, ni instrucciones para crear objetos sobre la base instalada.
- `schema/INVENTARIO.md`: lista real de todas las tablas, funciones, claves y triggers.

Para volver a exportar documentación, desde `backend`: `npm run schema:documentar`.
La herramienta es de lectura PostgreSQL y también compara la huella de la base anterior.
No usar los scripts antiguos de migración, Neon, QA ni circulación con este esquema.

## Tablas y relaciones

| Tabla | Responsabilidad |
|---|---|
| roles | Cinco códigos fijos; el índice parcial de usuarios limita el Superadministrador a una cuenta |
| oficinas | Oficinas administradas; Dirección y Mesa de Partes son iniciales |
| usuarios | Hash scrypt, rol, oficina opcional, actividad y versión de autenticación |
| ambitos_registro | Ámbito compartido único y un ámbito personal por Usuario |
| miembros_ambito | Una pertenencia por cuenta; FK compuesta usada por documentos |
| tipos_documentales | Nombre y prefijo únicos dentro de cada ámbito |
| campos_opcionales | Configuración administrativa por Usuario; no se borra |
| cambios_nombre_campo | Historia inmutable de nombres, actor, motivo y fecha |
| unidades_ubicacion | Árbol opcional propio de cada cuenta con oficina; clase y nombre libres |
| correlativos_documentales | Contador bloqueado transaccionalmente por ámbito, tipo y año |
| documentos | Identidad global; código visible dentro del ámbito; clasificación, situación y revisión |
| valores_documento | Nombre histórico y valor del campo; FK al documento y campo |
| delegaciones_documento | Una constancia de destino; no transfiere ámbito ni acceso |
| ubicaciones_documento | Unidad seleccionada y ruta histórica; una ubicación vigente |
| documentos_relaciones | Documento nuevo con origen en el mismo ámbito; sin autorreferencia/ciclos |
| documentos_pdf | Una revisión PDF vigente; referencia privada a R2, nunca contenido binario |
| pdf_cargas | Preparación, actor, vencimiento y revisión PDF esperada |
| pdf_objetos_pendientes | Limpieza durable de temporales y objetos desvinculados; sin versiones descargables |
| pdf_eventos | Auditoría técnica inmutable de carga, sustitución, borrado y limpieza |
| auditoria_documental | Registro, corrección, anulación, delegación, ubicación, campos y PDF |
| auditoria_configuracion | Cambios administrativos auditados; sin hashes ni contraseñas en las respuestas |

## Triggers e integridad

Los 36 triggers y las 21 funciones se enumeran con su definición en INVENTARIO.
Los de cuenta/oficina y miembro/ámbito validan sus relaciones. Los de tipo y código
asignan código y correlativo sin consumirlos si la transacción revierte. Los de
documento protegen autoría, ámbito, código y clasificación, exigen motivo para
corregir/anular y registran antes/después. Los de delegación y ubicación insertan
sus hechos y actualizan situación en la misma transacción. La comprobación
diferida impide situaciones sin el hecho correspondiente. Los de unidades evitan
padres ajenos/cíclicos. Los de campos conservan el nombre histórico al renombrar.
Los de PDF verifican actor, permiso, tamaño y metadatos, agregan auditoría y
programan limpieza. Los históricos prohíben actualización/borrado, y los triggers
de truncado protegen registros y auditorías.

El backend revalida JWT/cuenta y abre transacción con `app.actor_id` y `app.motivo`.
Usa un bloqueo transaccional compartido entre configuración y operaciones para
evitar cambios concurrentes de pertenencia, jerarquía o documento. Las escrituras
documentales bloquean la fila y comparan `revision`. Una delegación nunca altera
`registrado_por` ni `ambito_id`. No existen recepción, entrega ni transferencia.

## Acceso

- Superadministrador: administración y lectura global; es el único que consulta
  detalles anulados o filtra `situacion=ANULADO`. Su lectura no concede escritura documental.
- Administrador: configuración; sin detalle, PDF ni conteos documentales.
- Dirección/Secretaría: lectura de ordinarios institucionales y personales;
  mutación solo conforme a su ámbito compartido. PDF compartido incluso delegado.
- Usuario: lectura de su ámbito, nunca por compartir oficina o aparecer como
  destinatario. Tras delegar pierde corrección, anulación y gestión PDF.
- La consulta se aplica antes del detalle, historial, relacionados y URL PDF.
  Listados y dashboard calculan totales SQL con el mismo alcance.

No se crearon cuentas iniciales mediante la adaptación. El propietario ya registró
las cuentas y se ejecutaron pruebas autenticadas; sus resultados y los datos de
prueba conservados figuran en [la revisión integral local](../docs/REVISION_INTEGRAL_SISTEMA_NUEVO_LOCAL.md).
La configuración privada local reutiliza actualmente la conexión de mantenimiento
existente (`postgres`); no es una recomendación para producción. El esquema
entregado no incluye un rol de conexión limitado. Este backend no se publica
ni conecta a Neon en esta etapa.

## Incremental posterior a la instantánea

Aplicar también changes/007-retencion-pdf-anulados.sql en instalaciones nuevas. Programa la retención de PDF anulados desde su auditoría, sin eliminar documentos. Véase [RETENCION_PDF_ANULADOS](../docs/RETENCION_PDF_ANULADOS.md).
