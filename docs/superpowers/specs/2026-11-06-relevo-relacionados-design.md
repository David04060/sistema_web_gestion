# Relevo de oficina y grupos de documentos relacionados

Fecha: 2026-11-06. Requisitos del usuario y decisiones técnicas propuestas para revisión.

## Alcance y reglas confirmadas

Una oficina admite como máximo una cuenta activa asignada. El relevo desactiva al saliente, revoca sus sesiones y asigna la oficina al reemplazo en una transacción. Solo los roles que ya administran cuentas pueden ejecutar relevos, conservando las protecciones del Superadministrador. No se amplía el acceso documental del Administrador.

El usuario confirmó expresamente que los anulados siguen siendo exclusivos del Superadministrador. El archivo anterior de la oficina comprende los demás documentos de los responsables precedentes, con PDF, detalle, historia y ubicación conservada. El acceso heredado es estrictamente de lectura, también para Dirección/Secretaría: prevalece sobre los permisos del ámbito compartido. Registrar un nuevo documento relacionado no modifica el anterior.

No se reasignan autores, actores, códigos, ubicaciones, PDF ni ámbitos personales anteriores. Los estantes y archivadores continúan perteneciendo a su creador. El reemplazo conserva o crea su ámbito personal y crea sus propias ubicaciones. Las lecturas institucionales que ya poseen Dirección y Secretaría siguen vigentes; el relevo no amplía lecturas entre oficinas de Usuarios.

## Modelo propuesto de relevo

Registrar asignaciones históricas a oficina con cuenta, inicio/fin y evento de relevo auditable, separados del ámbito personal. Guardar la oficina histórica de registro en una asociación inmutable por documento; no inferirla en cada consulta a partir de la oficina actual del autor. Los documentos nuevos obtienen esa asociación en la transacción de alta.

Para registros existentes reconstruir oficina de registro con las asignaciones y auditoría disponibles. Cuando no exista evidencia de movimientos de oficina, usar la asignación actual corroborada; si hay movimientos y no se puede reconstruir el dato, detener la migración y presentar los casos antes de conceder acceso. Nunca atribuir automáticamente documentos de otra oficina al historial del reemplazo.

Proteger exclusividad mediante índice único parcial sobre usuarios(oficina_id) WHERE activo AND oficina_id IS NOT NULL, además de validaciones de servicio. Proteger contra carreras de alta/activación/edición/relevo. La transacción de relevo bloquea oficina y ambas cuentas en orden estable, revalida actividad, rol, oficina compatible y revisiones; rechaza cuentas iguales y reemplazos asignados a otra oficina. El reemplazo se selecciona entre cuentas existentes elegibles (incluidas inactivas) o se crea primero sin oficina usando el alta habitual. La confirmación muestra saliente/reemplazo y exige motivo. No modifica documentos.

Una cuenta que ya conserva documentos de otra oficina no debe recibir escritura sobre ellos por cambiar su asignación: los permisos de mutación incorporan la procedencia de oficina/periodo además de la autoría y el ámbito. La reactivación de un antiguo responsable requiere oficina libre y no revierte relevos ni transfiere documentos nuevos. Si vuelve a asumir la misma oficina, todos sus periodos ya cerrados también permanecen de solo lectura; solo su periodo actual habilita escrituras conforme a los permisos ordinarios.

El archivo se consulta por oficina histórica, no por cadena recursiva de usuarios ni por un vínculo A→B que pueda extender accidentalmente otras oficinas. El responsable actual puede leer todos los periodos anteriores de esa misma oficina; A→B→C conserva acceso para C sin dar actividad a A o B.

## Continuidad de tipos documentales

Reutilizar ámbitos/correlativos vigentes, sin trasladar documentos ni tipos originales. En un relevo de Usuario, ofrecer en el ámbito del reemplazo copias auditadas de los todos los tipos activos del catálogo de los responsables anteriores, incluso los todavía no utilizados de esa oficina, con procedencia explícita y un mapeo único para evitar copias repetidas en relevos sucesivos. Las copias respetan nombre/prefijo; una coincidencia exacta puede reutilizar el tipo propio equivalente, pero una colisión incompatible se debe resolver explícitamente antes de confirmar el relevo. No reactivar tipos retirados ni sobrescribir tipos propios. Los correlativos nuevos siguen el ámbito del nuevo autor; no se renumeran documentos anteriores. Dirección/Secretaría ya comparten catálogo y no requieren clonarlo.

## Alta relacionada, grupo y filtro

Conservar el botón del detalle y reutilizar FormularioDocumento. En el alta añadir la elección «Registrar documento relacionado» y un combobox remoto accesible por código/asunto, con 5 sugerencias iniciales y hasta 20 resultados al escribir, estado vacío, teclado y rechazo de respuestas obsoletas. Solo devuelve documentos consultables y aptos para origen; anulados quedan fuera. El guardado revalida origen bajo transacción: visibilidad no se confía a React.

Permitir relacionar el nuevo documento con un origen consultable de un ámbito distinto cuando la lectura es legítima (incluido archivo heredado), sin transferir ámbito ni permiso de escritura. Conservar el enlace inmediato origen→nuevo para reflejar la secuencia. El endpoint y el trigger SQL validan actor del documento nuevo y autorización sobre origen; sustituyen la igualdad absoluta de ámbitos que hoy impide ese caso.

El grupo es la componente conectada de la relación existente. Una consulta recursiva acotada con deduplicación recupera ancestros y descendientes, identifica el primer registrado por creado_en e id como desempate, ordena la secuencia y filtra cada documento por autorización antes de serializar. No revela código/asunto/ID de un primer documento no visible: presenta «Documento inicial no disponible con tus permisos». No se crean relaciones entre documentos existentes desde esta interfaz; el nuevo documento solo tiene un origen, con unicidad, rechazo de autorrelación y ciclos desde SQL. Adjuntar a un miembro conserva el mismo grupo y no duplica enlaces.

El filtro «Con documentos relacionados» usa EXISTS sobre la componente completa del grupo con al menos otro documento visible para ese actor (también si el camino entre ambos contiene un documento oculto, sin revelar ese intermediario), antes de contar/paginar. Esta decisión evita revelar relaciones con documentos ocultos. Se combina con búsqueda, situación, tipo, clasificación y periodo. Se utiliza también en exportación para que corresponda al listado. Sin coincidencias reutiliza el vacío habitual.

## Verificación y despliegue

Primero crear pruebas fallidas en PostgreSQL local aislado, almacenamiento PDF simulado y frontend real renderizado. Cubrir A→B→C, oficinas diferentes, falta de oficina, oficina inactiva, cuenta ya asignada, doble relevo/activación concurrente, sesiones revocadas, todos los endpoints de escritura sobre históricos, PDF y ubicación, tipos y colisiones, código/autor nuevo, relacionados entre ámbitos autorizados, grupo de tres niveles, ciclos/duplicados, documento inicial invisible, filtro/paginación/exportación y los cinco roles.

Tras pasar pruebas, respaldo verificado y migración en la base local habitual; después preflight productivo de solo lectura, respaldo cifrado de la base efectiva verificada directamente en Render, migración, publicación de backend/Pages y comprobación de lectura. No ejecutar relevos, altas, anulaciones ni cambios de registros productivos para probar.

Preflight productivo de 2026-11-06: base verificada sistema_documental_produccion, TLS y rama contrastados, cero oficinas con más de una cuenta activa. Esta evidencia no reemplaza una nueva comprobación inmediatamente antes de migrar.

No se modificó código de producto ni se aplicó DDL en esta fase de diseño. Quedan a elección técnica del implementador los nombres de tablas/endpoints, organización de módulos y mensajes de validación, conservando estas reglas.
## Cobertura transversal de autorización

Aplicar una única política de lectura al listado, detalle, PDF, historia/auditoría, búsqueda de origen, grupos, conteos, dashboard y exportación. Las restricciones de escritura histórica se comprueban tanto en servicios como en triggers de documentos, delegaciones, ubicaciones, valores opcionales, PDF y cargas/confirmaciones. El rol de aplicación no puede alterar asociaciones históricas ni la tabla de relevos arbitrariamente: funciones transaccionales acotadas y privilegios mínimos. Las pruebas SQL directas usan un rol restringido, además de las pruebas HTTP; no basta el resultado de permisos mostrado por React.

Revisión independiente completada: se resolvieron la inclusión de tipos activos aún sin uso, el filtro por grupo completo con intermediarios invisibles y la vuelta de un responsable a la misma oficina. Son decisiones propuestas para conservar continuidad y no devolver escritura histórica.
