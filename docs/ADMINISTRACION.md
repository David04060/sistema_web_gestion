# Roles, Oficinas y Usuarios

Implementación del 21 de octubre de 2026 para el Sistema Web Documental de la
I.E. Enrique Paillardelle. Los tres módulos utilizan React → Fetch → Express → pg
→ PostgreSQL. No hay listas de catálogo estáticas en React ni respuestas simuladas
en la aplicación. No se implementaron Documentos, Movimientos, Ubicaciones o SíseVe.

## Decisiones confirmadas

- Roles reservados: Administrador, Director(a), Secretaria de Dirección y Usuario.
- Oficinas con denominación protegida: Dirección y Mesa de Partes.
- Director(a) corresponde a Dirección; Secretaria de Dirección a Mesa de Partes.
- Toda cuenta no administradora requiere oficina. Administrador puede tenerla nula.
- No se puede desactivar ni cambiar el rol del último Administrador activo.
- Si existe otro administrador activo, se permiten cambios en la cuenta propia con
  confirmación del cambio de rol y cierre local cuando cambia contraseña/estado.
- No hay eliminación física de roles, oficinas o cuentas; no existen endpoints DELETE.
- Las cuentas se crean únicamente desde endpoints administrativos, sin registro público.

Estas protecciones se aplican en el backend. El frontend refleja las mismas reglas,
pero ocultar un menú o un botón no constituye autorización.

## Esquema existente revisado, sin modificaciones

Base de aplicación: `sistema_web_final`. No se crearon bases, tablas, columnas,
índices ni migraciones en esta tarea. Se revisaron columnas, nulabilidad, identidad,
claves foráneas, índices, restricciones y funciones de los disparadores existentes.

| Tabla | Campos existentes utilizados |
| --- | --- |
| roles | id bigint identity ALWAYS, nombre varchar(100), fecha_creacion, fecha_modificacion |
| oficinas | id bigint identity ALWAYS, nombre varchar(150), fecha_creacion, fecha_modificacion |
| usuarios | id bigint identity ALWAYS, nombre varchar(100), apellido varchar(120), nombre_usuario varchar(64), email varchar(254) nullable, telefono varchar(30) nullable, contrasena_hash, activo, rol_id, oficina_id nullable, version_autenticacion, fecha_creacion, fecha_modificacion |

Roles/oficinas tienen unicidad por lower(btrim(nombre)). Los servicios también
normalizan espacios internos y comprueban duplicados dentro de una escritura
serializada para que «Rol QA» y « rol  qa » no creen dos registros desde la aplicación.

La base exige nombre_usuario en minúsculas, recortado y con patrón de 3–64 caracteres
alfanuméricos/punto/guion/guion bajo. El correo admite null y tiene unicidad sin
distinción de mayúsculas. Los IDs se transportan como texto para no perder precisión.

usuarios.rol_id y oficina_id conservan las claves foráneas. Existen referencias a
usuarios/oficinas desde registros institucionales; se preservan siempre los IDs y
ningún endpoint borra filas. El trigger de usuarios ya exige oficina para no administradores.

## Arquitectura y transacciones

Cada módulo conserva routes → controllers → services → repositories → PostgreSQL:

- Routes monta JWT y requiereRol('Administrador') antes de las operaciones.
- Controllers valida body, params y filtros con Zod y adapta HTTP, sin SQL.
- Services aplica reservas, asignaciones, duplicados y protección del último admin.
- Repositories encapsula SQL parametrizado y proyecciones sin hashes.

Roles y oficinas reutilizan repositorio/servicio de catálogo común, con configuración
cerrada de nombres SQL. Cada uno mantiene su carpeta y adaptadores propios. Ningún
nombre de tabla o columna se toma de la petición.

`escrituraAdministrativa` abre una transacción y adquiere un advisory lock
transaccional común. Esto serializa cambios administrativos para comprobar de forma
atómica duplicados normalizados, asignaciones y el último administrador. Después
del bloqueo vuelve a comprobar que el actor está activo y sigue siendo Administrador.

Antes de escribir ejecuta set_config('app.usuario_actor_id', actor, true). Los triggers
existentes mantienen fechas y registran cambios en historial_modificaciones con ese
actor. El contexto es local a la transacción y no se reutiliza en escrituras futuras.
El hash se deriva fuera de la transacción para no mantener bloqueos durante scrypt.

Los triggers de auditoría existentes excluyen contrasena_hash y registran solo la
indicación de contraseña modificada. No se implementó un segundo historial paralelo.

## Endpoints

Todos requieren Authorization: Bearer y rol Administrador. No cambian /api/auth/login,
/api/auth/me, el algoritmo JWT ni su duración de 900 segundos.

| Método | Ruta | Resultado |
| --- | --- | --- |
| GET | /api/roles | {roles: [...]} |
| GET | /api/roles/:id | {registro, usuarios: [...]} |
| POST | /api/roles | {registro}, 201 |
| PUT | /api/roles/:id | {registro} |
| GET | /api/oficinas | {oficinas: [...]} |
| GET | /api/oficinas/:id | {registro, usuarios: [...]} |
| POST | /api/oficinas | {registro}, 201 |
| PUT | /api/oficinas/:id | {registro} |
| GET | /api/usuarios | {usuarios, total, pagina, limite} |
| GET | /api/usuarios/:id | {usuario} |
| POST | /api/usuarios | {usuario}, 201 |
| PUT | /api/usuarios/:id | {usuario} |
| PATCH | /api/usuarios/:id/estado | {usuario} |
| PUT | /api/usuarios/:id/contrasena | {mensaje} |

Catálogos reciben únicamente `{nombre}`. Las asociaciones de sus detalles incluyen
cuentas activas e inactivas. `reservado` y `usuarios_asociados` son datos derivados,
no columnas nuevas.

Crear cuenta recibe nombre, apellido, nombre_usuario, email, telefono, rol_id,
oficina_id, contrasena y activo (true por defecto). Editar datos recibe los mismos
campos personales/asignaciones, sin contraseña ni activo. Cambiar estado recibe
`{activo: boolean}` y restablecer recibe `{contrasena: string}`.

Filtros de usuarios: q, rol_id, oficina_id, activo=true/false, pagina (desde 1) y
limite (1–100, por defecto 10). La búsqueda trata % y _ como caracteres literales.
Página y total provienen de una única sentencia SQL con la misma instantánea.

Estados: 400 entrada/asignación inválida, 401 sesión ausente/inválida/inactiva,
403 sin autorización administrativa, 404 registro inexistente, 409 duplicado,
reserva institucional o protección del último administrador. Errores internos no
exponen SQL ni secretos. El cliente solo muestra mensajes públicos de errores
previstos y conserva el tratamiento existente de 401/403/429/5xx.

## Usuarios y seguridad de acceso

La contraseña mantiene el mínimo vigente de ocho caracteres. El máximo de 1024
coincide con el login. No se recorta ni transforma; se almacena únicamente su hash
scrypt con sal aleatoria. Los endpoints de usuarios no consultan ni devuelven hashes.

Desactivar conserva la fila, los IDs y toda la autoría institucional. Cambiar el estado
efectivo incrementa version_autenticacion; reactivar no vuelve válidos los JWT previos.
Restablecer contraseña incrementa la versión en la misma escritura que sustituye el
hash. El middleware de autenticación existente vuelve a consultar esa versión y
rechaza los tokens anteriores. No se introdujo una nueva clase de token o sesión.

Cambiar datos propios refresca /me para actualizar perfil y menú. Si el administrador
cambia su propio rol y deja de serlo, la interfaz lo lleva al dashboard y deja de
mostrar administración. El servidor ya comprueba el rol actual en cada petición.
Cambiar estado/contraseña propios cierra la sesión local después de la respuesta.

## Interfaz

- Shell compartido en components/layout con Dashboard, Roles, Oficinas y Usuarios.
- Menú administrativo visible solo para Administrador y guard de rutas independiente.
- Catálogos: listado, detalles, usuarios asociados, registro y edición permitida.
- Usuarios: búsqueda/filtros en la URL, tabla paginada, creación, edición, detalles,
  estado y restablecimiento con confirmaciones nativas que mantienen el foco.
- Roles/oficinas de los selectores proceden de PostgreSQL. El formulario restringe
  las oficinas de Director(a) y Secretaria de Dirección; Express vuelve a validarlas.
- React Hook Form y Zod validan formularios. Fetch valida respuestas con Zod.
- useConsulta descarta respuestas obsoletas y expone carga, errores y reintento.
- Estados vacíos y mensajes de confirmación reales, sin botones de funciones futuras.
- CSS Modules y utilidades Tailwind reutilizan el tema existente. Las tablas tienen
  desplazamiento horizontal dentro de su contenedor cuando el ancho lo requiere.

Rutas: /roles, /roles/nuevo, /roles/:id, /roles/:id/editar; equivalentes para oficinas;
/usuarios, /usuarios/nuevo, /usuarios/:id y /usuarios/:id/editar. Los cambios de estado
y contraseña se realizan desde el detalle de la cuenta.

## Verificaciones

### Datos de prueba y autorización

El usuario indicó utilizar la base existente y autorizó explícitamente pruebas en
una transacción con ROLLBACK, aceptando posibles huecos en las secuencias. No se
creó otra base ni un esquema auxiliar. La conexión privada existente ya funcionaba;
no se guardó la contraseña comunicada por el usuario en código o documentación.

Las pruebas ejecutan los servicios, repositorios, scrypt, JWT, restricciones y triggers
reales. El adaptador de pruebas utiliza una transacción exterior y traduce transacciones
interiores a savepoints para impedir commits permanentes de los datos de QA. No
devuelve resultados SQL simulados ni cambia el comportamiento de la aplicación real.

El servidor de navegador crea una cuenta efímera dentro de esa transacción y utiliza
una clave JWT aleatoria solo en ese proceso de pruebas. Las cuentas institucionales
no se editaron; las solicitudes al último administrador se rechazaron antes de escribir.

nextval de PostgreSQL no se revierte: las secuencias pueden avanzar aunque los
registros de prueba y su auditoría se reviertan. Esto se advirtió y fue autorizado.
No se restablecen secuencias, porque hacerlo podría reutilizar IDs bajo concurrencia.

### Automatizadas

Resultados finales de la ejecución del 21 de octubre de 2026:

| Comprobación | Frontend | Backend |
|---|---|---|
| `npm run typecheck` | Correcto | Correcto |
| `npm run lint` | Correcto, sin advertencias | Correcto, sin advertencias |
| `npm run build` | Correcto, Vite | Correcto, TypeScript |
| `npm test` | 30 pruebas aprobadas | 20 pruebas aprobadas |
| `npm run test:admin` con autorización | No corresponde | 14 resultados aprobados, incluido el grupo principal |

La integración SQL terminó con confirmación explícita de ROLLBACK y coincidencia de
las huellas de roles, oficinas, usuarios y auditoría. No hubo pruebas fallidas ni omitidas.

- Frontend: TypeScript, ESLint, build y npm test, incluidas ocho regresiones nuevas
  de contratos administrativos y las existentes de autenticación/sesión.
- Backend: TypeScript, ESLint, build y npm test, incluidas validaciones nuevas sin DB.
- Integración SQL: npm run test:admin con ADMIN_WRITE_TESTS=ROLLBACK_AUTHORIZED.
  Comprueba los tres módulos, permisos, asignaciones, duplicados, auditoría, último
  administrador, invalidación de tokens, activación y restablecimiento.
- El sandbox compara huellas antes/después de roles, oficinas, usuarios e historial:
  tras ROLLBACK las filas deben coincidir exactamente; las secuencias se excluyen.

Para repetir las pruebas SQL se debe compilar primero y ejecutar desde backend:

```powershell
$env:ADMIN_WRITE_TESTS='ROLLBACK_AUTHORIZED'
npm run test:admin
Remove-Item Env:ADMIN_WRITE_TESTS
```

`npm test` habitual no escribe en PostgreSQL. La prueba de integración exige la bandera
explícita y rechaza cualquier base distinta de sistema_web_final para evitar utilizar
por error otra conexión. La bandera autoriza solo el verificador, no modifica el servidor normal.

### Navegador con PostgreSQL real y ROLLBACK

Se probaron login, navegación, crear/editar rol, crear/editar oficina, crear cuenta,
editar datos y asignar Director(a) con Dirección, búsqueda por nombre de usuario y
filtros por rol/oficina/estado, desactivar, activar y restablecer contraseña.

Se inició sesión con la contraseña restablecida; el rol ordinario no vio enlaces
administrativos y el acceso directo fue rechazado. La recarga conservó la sesión
validada por /me. Se revisaron los módulos y el formulario en 375×812 y escritorio,
sin desbordamiento horizontal de la página. La tabla puede desplazarse internamente.

Las capturas muestran únicamente datos de QA, no perfiles institucionales:
usuarios-admin-escritorio.png, usuarios-admin-movil.png y usuario-formulario-movil.png.

La interrupción de la conversación cerró los procesos temporales. La comprobación
posterior de solo lectura encontró cuatro roles, seis oficinas y una cuenta, sin
registros de QA ni transacciones pendientes. La prueba automatizada había confirmado
además las huellas completas después de su propio ROLLBACK.

Las escrituras de producción no fueron confirmadas de forma permanente durante QA,
por la autorización de usar ROLLBACK. La aplicación normal conserva BEGIN/COMMIT
reales en sus servicios. No se creó contenido de demostración permanente.

## Cambios y límites

El manifiesto de archivos está en [CAMBIOS_ADMINISTRACION.md](CAMBIOS_ADMINISTRACION.md).
No hay decisiones funcionales pendientes para estos tres módulos. No se desarrollaron
otros módulos ni se publicaron cambios. El uso real se realiza con npm run dev en
backend y frontend y con una cuenta Administrador existente.
