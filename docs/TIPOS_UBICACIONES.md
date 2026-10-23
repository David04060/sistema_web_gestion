> Actualización posterior: SíseVe ya cuenta con módulo específico y prefijo SISEVE elegido por el usuario. Véase [SISEVE.md](SISEVE.md). Los endpoints ordinarios conservan sus exclusiones. Las menciones siguientes a prefijo nulo o módulo pendiente corresponden a la etapa anterior.

# Tipos documentales y ubicaciones físicas

Implementación del 21 de octubre de 2026. React → Fetch → Express → pg → PostgreSQL.
No se añadieron dependencias, ORM, SDD ni módulos de Documentos, Movimientos o SíseVe.

## Decisiones confirmadas y cambio aplicado

El usuario autorizó expresamente agregar oficina_id a estantes, los permisos de esta
sección y los prefijos nuevos elegidos explícitamente por el Administrador.

Se aplicó `backend/scripts/sql/20261021-estantes-oficina.sql` dentro de una transacción,
verificando `current_database() = sistema_web_final` y bloqueando estantes durante
la comprobación. La tabla estaba vacía. Se agregó únicamente:

- `estantes.oficina_id bigint NOT NULL`.
- FK a oficinas(id), ON DELETE RESTRICT.
- Índice `ix_estantes_oficina`.

No se asignaron oficinas automáticamente ni se modificaron filas institucionales.
El SQL se conserva para revisión y reproducción controlada: si hay estantes y falta
la columna, aborta y exige una asignación revisada. Ejecutarlo dentro de BEGIN/COMMIT
contra la base aprobada; no utilizarlo como un mecanismo general de migraciones.
El cambio de estructura es permanente y autorizado; los datos de QA son transaccionales.

## Catálogo institucional

Campos reales: id, nombre (120), prefijo_codigo nullable (8), requiere_clave y fechas.
No existe estado de desactivación. No se agregó una columna de estado ni endpoints DELETE.

El catálogo es consultable por cualquier cuenta autenticada. Solo Administrador crea
o edita. Consultar el catálogo no permite consultar documentos ni administrar claves.

Se mantienen las parejas Informe/INF, Oficio/OFI, Memorando/MEM, Acta/ACT,
Comunicado/COM y FUT/FUT. Sus nombres y prefijos se protegen. SíseVe conserva su
nombre, prefijo nulo y requiere_clave=true. Los tipos restringidos no se desprotegen
mediante este módulo; requiere_clave no es un campo editable ni aceptado en el body.

Para tipos nuevos el Administrador escribe un prefijo único de 2 a 8 letras; puede
dejarlo nulo mientras no esté definido. No hay sugerencias ni asignaciones automáticas.
Los nombres se recortan y normalizan espacios; los duplicados se comparan sin
mayúsculas/minúsculas y con espacios normalizados. Los prefijos se normalizan a
mayúsculas y se comprueba su unicidad, además de las restricciones PostgreSQL.

El prefijo queda bloqueado si existen documentos o correlativos del tipo. El cambio
adquiere FOR UPDATE sobre el tipo; el generador SQL existente adquiere FOR SHARE,
evita comprobar historia y cambiar prefijo simultáneamente con una generación.
El servicio no genera códigos ni altera el generador existente.

## Ubicaciones y permisos

Jerarquía: oficina → estante → archivador. oficina_id es la oficina institucional;
usuario_id representa al responsable actual. Se conserva el ID del estante durante
una reasignación y los archivadores continúan apuntando a él.

| Actor | Consulta | Escritura |
|---|---|---|
| Usuario, Secretaria de Dirección y otros roles ordinarios | Sus estantes y archivadores | Los propios; creación en su oficina |
| Director(a) | Todas las ubicaciones | Solo las propias |
| Administrador | Todas las ubicaciones | Todas; puede reasignar responsabilidad |

Las restricciones se aplican en SQL antes de devolver listas y detalles. Una ubicación
fuera del alcance devuelve 404; un Director que intenta modificar una ajena recibe 403.
Los filtros de oficina, responsable o estante siempre se intersectan con el acceso.
No se enumeran cuentas de terceros en las opciones para usuarios ordinarios.

Estantes utiliza codigo de 1 a 10 letras mayúsculas, porque así lo exige el CHECK
existente de PostgreSQL; no se inventó esta nomenclatura ni se generan etiquetas.
La unicidad existente es (usuario_id,codigo), incluso si ese usuario conserva estantes
históricos en otra oficina. Archivadores utiliza numero integer positivo y único por
estante. No se añaden nombres, descripciones o estados inexistentes.

La oficina de un estante existente no se cambia por edición. El estante padre de un
archivador tampoco se cambia por edición. Esto conserva referencias documentales y
reserva traslados físicos para reglas futuras explícitas. Código y número sí se editan,
conservando IDs y auditoría. No existe eliminación física desde estos módulos.

La reasignación se realiza en Editar estante, solo para Administrador, seleccionando
una cuenta activa de la misma oficina. Se conserva un responsable histórico aunque
se inactive o cambie de oficina; no se le vuelve a asignar si no cumple las condiciones.
Reasignar un estante no cambia responsables documentales ni concede acceso a documentos.
No se cambia la oficina del estante automáticamente al trasladar la cuenta. Las
ubicaciones de una cuenta inactiva permanecen disponibles para Administración y
consulta de Dirección; no se eliminan ni se pierde el historial.

## Arquitectura

Cada módulo tiene routes, controller, service, repository y schema. Los controladores
validan con Zod y adaptan HTTP; no contienen SQL. Los repositorios contienen parámetros
para valores. Los servicios aplican permisos, reservas, duplicados y estabilidad de
referencias. Los bigint viajan como texto para no perder precisión.

Las escrituras revalidan al actor, abren transacción, adquieren el mismo advisory lock
que la administración de cuentas y establecen app.usuario_actor_id de forma local.
Se reutilizan los triggers de auditoría y fechas; no se crea un historial paralelo.
Los errores previstos usan 400/401/403/404/409 y el middleware común conserva errores
internos genéricos. Las respuestas privadas tienen Cache-Control: no-store.

En React se separan schemas, api, components, hooks y pages. RHF mantiene el formulario;
Zod valida antes de enviar. apiRequest valida también respuestas. Se reutilizan
useConsulta, EstadoCarga y los CSS Modules compartidos. No se trasladaron reglas de
autenticación a App.tsx ni se cambió el gestor de sesión. Ambos módulos aparecen en
el menú autenticado; las acciones de catálogo solo aparecen para Administrador.

## Endpoints y contratos

Todos requieren Bearer. POST devuelve 201 y GET/PUT 200.

| Método | Ruta | Respuesta |
|---|---|---|
| GET | /api/tipos-documentales | {tipos: [...]} |
| GET | /api/tipos-documentales/:id | {tipo} |
| POST / PUT | /api/tipos-documentales[/:id] | {tipo} |
| GET | /api/ubicaciones/opciones | {actor_id, administrador, oficina_id, oficinas, responsables} |
| GET | /api/ubicaciones/estantes | {estantes: [...]} |
| GET | /api/ubicaciones/estantes/:id | {estante, archivadores: [...]} |
| POST / PUT | /api/ubicaciones/estantes[/:id] | {estante} |
| GET | /api/ubicaciones/archivadores | {archivadores: [...]} |
| GET | /api/ubicaciones/archivadores/:id | {archivador} |
| POST / PUT | /api/ubicaciones/archivadores[/:id] | {archivador} |

Body de tipo: {nombre, prefijo_codigo:string|null}. Body de estante:
{codigo, usuario_id:string, oficina_id:string}. Body de archivador:
{estante_id:string, numero:number}. PUT conserva los campos padre; enviarlos distintos
es un conflicto, no una orden de traslado. Los cuerpos son estrictos, sin campos extra.
Listados de ubicaciones aceptan oficina_id, usuario_id y estante_id como filtros;
estante_id se utiliza para archivadores. El buscador visual filtra las filas autorizadas
por código, número, oficina, responsable o nombre/prefijo del catálogo, según pantalla.

## Pruebas y límites

Se ejecutan en cada proyecto: npm run typecheck, npm run lint, npm run build y npm test.
El frontend incluye cuatro regresiones nuevas de formularios, transporte y respuestas;
el backend agrega dos validaciones sin DB. Las pruebas de autenticación anteriores se
conservan. Las respuestas simuladas en pruebas unitarias no sustituyen la integración.

Las pruebas SQL usan exclusivamente la base existente con autorización de ROLLBACK:

```powershell
# Desde backend, con su configuración privada existente.
$env:ADMIN_WRITE_TESTS='ROLLBACK_AUTHORIZED'
npm run test:catalogos
npm run test:admin
Remove-Item Env:ADMIN_WRITE_TESTS
```

El sandbox usa SQL, restricciones, JWT, scrypt, endpoints y triggers reales. Reemplaza
solo BEGIN/COMMIT interiores por savepoints dentro de una transacción exterior.
Compara huellas completas antes/después de roles, oficinas, usuarios, tipos, estantes,
archivadores, correlativos, documentos y auditoría. nextval puede avanzar y se excluye.
La cuenta institucional no se modifica; todas las cuentas creadas son QA transaccional.

La prueba con referencia documental inserta una fixture SQL dentro del ROLLBACK y
verifica el trigger existente de código, bloqueo de prefijo y conservación de la FK
al editar el archivador. No se implementa ninguna API ni interfaz de Documentos.

En navegador se verificaron crear/editar tipo y prefijo, crear/editar estante,
crear/editar archivador, consulta de tablas, formularios inválidos, acceso de un
responsable ordinario, registro propio con oficina fija, recarga de sesión y rechazo
del formulario administrativo para usuario ordinario. Se revisaron catálogo,
ubicaciones y formulario de estante a 375×812, sin desbordamiento de página.
Las evidencias contienen únicamente datos temporales de QA y el catálogo institucional.

No se declara comprobada la persistencia de escrituras mediante COMMIT en la base
institucional: QA termina en ROLLBACK. La aplicación normal utiliza COMMIT real.
No se implementa un flujo de traslado físico entre oficinas ni de archivadores entre
estantes; la edición conserva sus padres. No quedan decisiones pendientes dentro
del alcance aprobado.

## Resultados finales del 21 de octubre de 2026

| Comprobación | Resultado |
|---|---|
| Frontend typecheck / lint / build | Correctos, sin advertencias de ESLint |
| Frontend npm test | 34 aprobadas, cero fallidas u omitidas |
| Backend typecheck / lint / build | Correctos, sin advertencias de ESLint |
| Backend npm test | 22 aprobadas, cero fallidas u omitidas |
| Backend test:catalogos | 14 resultados aprobados, incluido el grupo principal |
| Backend test:admin | 14 resultados aprobados, incluido el grupo principal |
| ROLLBACK de ambas suites SQL | Huellas completas coincidentes |
| Navegador | Registro y edición real de tipos, estantes y archivadores correctos |
| Móvil 375×812 | Catálogo, ubicaciones y formulario sin desbordamiento de página |

La primera ejecución de Node --test fue bloqueada por spawn EPERM del entorno;
se repitió con ejecución permitida y pasó. Las verificaciones finales corresponden
al código posterior a los ajustes de legibilidad y validación visual.

La comprobación final independiente de solo lectura encontró sistema_web_final,
siete tipos, un usuario, cero estantes, archivadores, documentos, correlativos y
cuentas de QA. Se verificó oficina_id bigint NOT NULL, su FK ON DELETE RESTRICT y
su índice. El cierre de las conexiones temporales de navegador revirtió su transacción;
la comprobación posterior confirmó ausencia de registros QA y transacciones pendientes.
Los cambios administrativos reales permanecen a disposición del usuario, sin poblar
catálogos ni ubicaciones con ejemplos persistentes.

Evidencias: docs/evidencias/ubicaciones-escritorio.png, ubicaciones-movil.png,
tipos-documentales-movil.png y estante-formulario-movil.png.
