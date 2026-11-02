# Backend documental nuevo — implementación local

Estado actualizado al 1 de noviembre de 2026: consultar [la revisión integral local](REVISION_INTEGRAL_SISTEMA_NUEVO_LOCAL.md) para las cuentas ya existentes, pruebas reales, filtro `fecha` de registro y el incremental 004 de oficinas inactivas. Las secciones siguientes conservan el informe de la adaptación inicial; sus pendientes iniciales no sustituyen ese estado actualizado.

## Identidad y conservación

Base efectiva: sistema_web_documental_final; localhost:5432, observada ::1/128;
OID 98367; public. Se reutiliza la configuración privada local sin imprimirla.
No se creó una base adicional ni se volvió a ejecutar la instalación.
Antes de modificar se registraron las filas y secuencias de sistema_web_final
(OID 62150). La comparación posterior de sus 22 tablas y secuencias coincidió.
No se crearon usuarios de aplicación, cuentas ficticias ni contraseñas iniciales.

Se conservó el trabajo local anterior. No se hizo fetch/reset, commit, push ni
despliegue. Los archivos privados y los informes detallados permanecen en
backend/.private/esquema-nuevo, excluidos de Git.

## Esquema observado y ajustes

Se inspeccionaron tablas, columnas, claves, índices, funciones y triggers reales.
El catálogo contiene 21 tablas, 21 funciones y 36 triggers; los nombres de tablas
y funciones coinciden con el SQL recibido. El inventario de definiciones está en
database/schema/INVENTARIO.md. El instalador publicado en database se exportó del
esquema instalado; no depende de asumir que el archivo recibido se ejecutó bien.

Incremental aplicado: database/changes/001-ajustes-integracion-local.sql.

- Falta de revisión PDF esperada: se agregó pdf_cargas.revision_esperada para
  comprobar la revisión vigente al confirmar y rechazar cargas obsoletas.
- La transición desde GUARDADO_DIRECCION impedía anular antes de delegar:
  se añadió solo GUARDADO_DIRECCION → ANULADO, conservando actor/motivo/autoría.
- auditar_pdf usaba ON CONFLICT DO NOTHING; podía dejar el objeto reemplazado
  esperando el vencimiento inicial. Ahora adelanta su limpieza a la fecha actual.
- El control de renombrado de campos podía evaluar NULL para un actor inexistente;
  ahora ese caso también se rechaza.

El primer envío SQL falló por un separador entre funciones y se revirtió. El
incremental corregido se confirmó íntegramente. No se ejecutará otra vez sin
revisar su estado; no es una migración de producción.

## Runtime y arquitectura

Se conserva el mismo Express app/server, autenticación JWT/scrypt, middleware de
errores/CORS, pool PostgreSQL, adaptador privado S3/R2 y validación real PDF.
app.ts monta los módulos adaptados; no hay segundo servidor ni backend paralelo.
Los módulos operativos nuevos están dentro de las carpetas existentes documentos,
usuarios, dashboard y documentos-pdf; comparten nucleo.ts para actor, transacción,
alcance y permisos. Las fuentes heredadas se conservan fuera del grafo HTTP activo
para no borrar trabajo anterior; sus servicios y consultas no están montados.

No se montan SíseVe ni movimientos. No hay endpoints de aceptación, recepción,
confirmación de entrega, salida, recuperación ni transferencia. El mantenimiento
PDF usa pdf_objetos_pendientes del nuevo esquema. Los scripts de npm activos
ya no exponen migraciones/QA/circulación del esquema antiguo.

La conexión .env apunta a la base nueva. Se renovó exclusivamente JWT_SECRET
local para invalidar tokens anteriores, y el prefijo R2 local se aisló en
qa/pdf-documental-nuevo/. No se modificaron secretos remotos. La conexión local
reutilizada es de mantenimiento (postgres), según el entorno existente; antes de
un eventual despliegue debe configurarse un rol de conexión limitado.

## Contratos HTTP

IDs bigint y revisiones documentales viajan como cadenas.
El listado y el detalle incluyen `registrado_por_nombre`; `tipo_id` se serializa
explícitamente como texto. El detalle expone `permisos.relacionar` para que el
frontend consulte la capacidad del ámbito vigente sin deducirla por rol.
Cuerpos estrictos Zod: los campos inesperados (por ejemplo propietario/responsable en delegación) se
rechazan. Los errores públicos no contienen SQL, hashes ni referencias privadas.

| Método /api/... | Cuerpo o consulta |
|---|---|
| POST auth/login | identificador, contrasena; mismo contrato de token |
| GET auth/me | Perfil público con rol; incluye rol_id/oficina_id/ambito_id si existen |
| GET usuarios; GET usuarios/:id | Solo administración; nunca devuelve hashes |
| POST usuarios | nombre, apellido, nombre_usuario, rol_id numérico, contrasena; email/telefono/oficina_id opcionales |
| PUT usuarios/:id | Datos anteriores sin contrasena, más activo y motivo; revoca sesiones |
| POST usuarios/:id/clave | contrasena; revoca sesiones y audita sin guardar su contenido en auditoría |
| GET roles; GET oficinas | Administración |
| POST oficinas | nombre; administración |
| PUT oficinas/:id | nombre, activa, motivo; administración; conserva Dirección y Mesa de Partes |
| GET tipos-documentales | Catálogo del ámbito autenticado |
| POST tipos-documentales | nombre, prefijo; del ámbito propio/compartido |
| GET ubicaciones | Unidades propias; administración puede indicar usuario_id |
| POST ubicaciones | clase, nombre, padre_id opcional; administración puede indicar propietario_id |
| PUT ubicaciones/:id | clase, nombre, padre_id; no transfiere propietario ni oficina |
| GET campos-opcionales | Propios; administración puede indicar usuario_id |
| POST campos-opcionales | usuario_id, nombre; administración |
| PUT campos-opcionales/:id | nombre, motivo; administración; guarda historia del renombrado |
| GET documentos/opciones | Tipos y unidades propios, campos y destinos elegibles; exige ámbito |
| GET documentos | q, situacion, tipo_id, clasificacion, pagina, limite; todos opcionales |
| POST documentos | tipo_id, clasificacion RECIBIDO/EMITIDO, asunto; remitente/observaciones opcionales; conservar_en_mesa solo Secretaría; unidad_id/origen_id/valores opcionales |
| GET documentos/:id | Documento, permisos, valores históricos, destino, ubicación y relacionados visibles |
| GET documentos/:id/historial | Actor legible, fecha, motivo y antes/después |
| PUT documentos/:id | revision, motivo, asunto; remitente/observaciones/valores opcionales |
| POST documentos/:id/delegar | revision; usuario_id o nombre; oficina_id opcional con usuario compatible; observaciones opcionales |
| POST documentos/:id/ubicacion | revision, unidad_id propia; trigger guarda ruta histórica |
| POST documentos/:id/anular | revision, motivo; no borra documento ni vínculo PDF |
| GET documentos/:id/pdf | archivo o null, modificar, limpieza_pendiente |
| POST documentos/:id/pdf/cargas | nombre, tamano, mime application/pdf, revision UUID o null |
| POST documentos/:id/pdf/confirmar | carga UUID; valida objeto y revalida permiso/revisión |
| POST documentos/:id/pdf/abrir | descargar boolean; URL privada temporal de 60 s |
| POST documentos/:id/pdf/eliminar | revision UUID, confirmar true |
| GET dashboard | Totales SQL por alcance; Administrador sin contenido documental |

Los valores del alta son [{campo_id,valor}]; el nombre histórico se obtiene del
catálogo, nunca del cliente. origen_id registra el enlace al origen dentro del
mismo ámbito. Cada detalle relacionado vuelve a pasar por el alcance de lectura.
Los listados ordinarios no muestran anulados; solo Superadministrador puede pedir
situacion=ANULADO y abrirlos. No hay permisos por oficina o por ser destinatario.

## Pruebas y límites

La suite activa npm test conserva pruebas JWT/scrypt/HTTP/CORS y añade contratos,
política de cinco roles, PDF real y adaptador R2 simulado. Las pruebas PostgreSQL
usan solo la base nueva, sin INSERT de cuentas ni documentos: identidad, catálogo,
predicado de acceso ejecutado para cinco roles y dos conexiones concurrentes que
comprueban el bloqueo transaccional. La comprobación HTTP verifica salud, entrada
inválida, rutas retiradas y exigencia de autenticación.

La suite antigua completa se ejecutó inicialmente: detectó expectativas del
circuito retirado y una simulación de limpieza antigua. Esas suites no se usan
para acreditar el flujo nuevo y se conservan como fuentes históricas. La suite
vigente se ejecuta explícitamente con los archivos indicados en package.json.

Pendiente por instrucción del propietario: no se ejecutaron altas/delegaciones/
anulaciones/correcciones/PDF autenticados sobre PostgreSQL hasta disponer de las
cuentas manuales. Tampoco una carrera de dos escrituras documentales reales ni
una subida nueva a R2. Los resultados unitarios y los bloqueos SQL no sustituyen
esas pruebas. No se crearon usuarios ni contraseñas persistentes para lograrlas.

## Frontend pendiente

Debe adaptarse al perfil Superadministrador y a los nuevos contratos. Sustituir
estantes/archivadores por unidades jerárquicas libres; usar tipos del ámbito y
campos configurados; enviar revision y motivo; retirar pantallas de SíseVe,
movimientos/entrega/recepción y transferencias; implementar filtros de anulados
solo para Superadministrador. El visor PDF se reutiliza, ajustando tamano_bytes y
actualizado_en. Las pantallas antiguas no se declaran compatibles con este backend.

Creación manual de cuentas: database/CUENTAS_MANUALES.md. No hay bootstrap.
