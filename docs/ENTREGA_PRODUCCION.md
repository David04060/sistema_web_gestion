# Verificación de producción — 24 de octubre de 2026

Frontend: https://sistema-documental-p.pages.dev
API: https://sistema-documental-hw7t.onrender.com/api/health
Render: sistema-documental, despliegue dep-dbefqbvb9u1s739j1omg, estado Live.
Commit de aplicación desplegado: ecf16e2fe47ff545a30ff66c37c1e0f1eb20d5e6.

## Base de datos y respaldo

Se contrastó en Neon Console la rama production br-shiny-mud-b6qqkm4n y su
identidad SQL. Aplicación: sistema_web_app, neondb, PostgreSQL 18.6, endpoint
directo, TLS verify-full y certificado validado. No se usó neondb_owner en Express.

Auditoría de lectura del esquema documental public: 12 tablas, 15 funciones,
32 triggers, 156 restricciones, 41 índices y 10 secuencias. Sin restricciones
pendientes de validación ni índices inválidos. Las comprobaciones de estados,
roles huérfanos, códigos y traslados abiertos duplicados no encontraron anomalías.
Un administrador activo no sintético; búsqueda heurística sin candidatos
sintéticos en usuarios/documentos. No se eliminaron datos.

El hash de estructura permaneció igual después de verificar la aplicación:
2aa97dddfcf3a9e26e2e16d39d3aa1e6429f47112334fe06fd5ee0122776a85d.

Antes del acceso institucional se completó pg_dump de toda neondb, incluido
neon_auth, con credencial separada de propietario y conexión de solo lectura.
Archivo privado AES-256-GCM de 125982 bytes:
.private/production/backups/production-2026-10-24T18-32-10.776Z-eb6aea59.dump.enc.
SHA-256: bbd130a3ec78fc378bd72f02f4a8d0a8f3538c1433ef3ff7db51cfc6ee5df156.
Se verificó autenticidad, integridad, descifrado y decodificación completa mediante
pg_restore hacia un sumidero; no se restauró en otra base. Una copia alterada fue
rechazada. La clave permanece separada y privada; no se incluye en Git ni R2.

## Cambios y comprobaciones

Render exige DB_PROFILE=neon, host y Branch ID explícitos, usuario autorizado,
neondb y TLS estricto. Rechaza perfiles locales/QA y no carga archivos .env en
Render. Se conservan los perfiles de desarrollo y la infraestructura pg existente.
No se modificaron servicios, repositorios, SQL, contratos ni parámetros scrypt.

Variables actualizadas manualmente por el titular, sin registrar valores:
NODE_VERSION, NODE_ENV, DB_PROFILE, DATABASE_URL, JWT_SECRET, CORS_ORIGINS,
TRUST_PROXY_HOPS, NEON_BRANCH_ID y NEON_HOST. Se retiró NEON_QA_HOST de Render.

TypeScript, ESLint y build del backend correctos; 36 pruebas unitarias correctas.
Frontend: TypeScript, ESLint y 43 pruebas correctas. No se ejecutaron suites con
escrituras en producción. Arranque local temporal con configuración production:
identidad y salud correctas, seguido de cierre controlado.

Verificación remota: salud HTTP 200, rutas API protegidas sin token HTTP 401,
preflight CORS desde Pages HTTP 204 con origen correcto, frontend HTTP 200.
El titular inició sesión con el administrador institucional. Se comprobó
recuperación de sesión tras recarga, Dashboard y consultas cargadas de Roles,
Oficinas, Usuarios, Tipos documentales, Ubicaciones, Documentos y Movimientos,
sin alertas de error. SíseVe denegó el acceso sin autorización individual.
Se cerró sesión y la navegación anónima a documentos redirigió al login.
No se crearon registros ni se probaron operaciones de escritura institucionales.
Estas comprobaciones no equivalen a una prueba productiva de cada flujo de escritura.

El frontend publicado se conservó porque ya utiliza la API HTTPS correcta.
Se preservó sin incluir en el commit una modificación previa del usuario en
frontend/src/features/usuarios/api/usuarios.api.ts.

## Operación pendiente de respaldos automáticos

El workflow diario y el cliente R2 están preparados, pero la automatización sigue
deshabilitada. Cloudflare respondió 403/10042: R2 requiere activación del titular.
No se creó bucket ni se activaron cargos. Después de dicha activación deben
configurarse bucket privado, secretos acotados y BACKUPS_ENABLED, según
RESPALDOS_PRODUCCION.md. La subida R2 y el workflow completo no están verificados
contra un bucket real todavía. Esto no impide el funcionamiento de la aplicación.

Render Free puede suspenderse; sus limitadores en memoria se reinician con el
proceso y no coordinan varias instancias. Se preservan sus controles actuales.
No se ejecutaron rollbacks, migraciones ni cambios de esquema.
