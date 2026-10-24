# Operación institucional en producción

El proyecto Neon es el mismo; su nombre actual es sistema-web-documental. La rama
autorizada es production. No se crean proyectos, ramas o bases de pruebas y no se
utilizan las configuraciones anteriores de QA en Render.

## Servicios y variables

- Frontend existente: https://sistema-documental-p.pages.dev
- API existente: https://sistema-documental-hw7t.onrender.com
- Salud: https://sistema-documental-hw7t.onrender.com/api/health
- Servicio Render: sistema-documental, Node 24.21.0, Free, rootDir backend.
- Repositorio privado: David04060/sistema_web_gestion, rama main.

Render suministra sus secretos por entorno y nunca carga archivos .env locales.
Variables requeridas: NODE_ENV=production, DB_PROFILE=neon, DATABASE_URL,
JWT_SECRET, CORS_ORIGINS, TRUST_PROXY_HOPS=1, NEON_BRANCH_ID y NEON_HOST.
NODE_VERSION fija la versión de Node. NEON_QA_HOST ya no se utiliza en Render.

DATABASE_URL debe usar el host directo exacto autorizado en NEON_HOST, base
neondb, usuario sistema_web_app y sslmode=verify-full. Se rechazan pooler,
usuario propietario, certificados no validados y ramas diferentes. Al arrancar,
SQL contrasta current_database(), current_user y neon.branch_id; el socket debe
estar cifrado y authorized=true. La identidad se valida antes de escuchar HTTP.
El nombre production se contrasta en Neon Console; PostgreSQL proporciona su ID,
no su etiqueta administrativa. No basta con comparar el nombre neondb.

CORS_ORIGINS conserva únicamente el origen canónico de Pages. El frontend actual
ya usa la URL correcta de Render y no requiere rediseño. Los perfiles locales de
desarrollo permanecen separados; la revisión operativa usa .env.neon.production,
privado y excluido de Git. Las suites históricas que crean fixtures o bases no se
ejecutan contra production. Sus comprobaciones anteriores no sustituyen validación
del estado actual.

## Publicación normal

En backend: npm run typecheck, npm run lint, npm test y npm run build. npm test usa
repositorios simulados y no escribe en producción. En frontend: typecheck, lint y
test. No ejecutar migraciones, bootstrap, limpieza ni suites de integración con
escrituras reales. No utilizar Rollback ni restablecer el perfil QA.

Build Render: npm ci --include=dev && npm run build. Start: npm start.
Se escucha en 0.0.0.0 con PORT del proveedor. Health check: /api/health.
Subir únicamente los cambios revisados, guardar variables privadas y realizar
Manual Deploy → Deploy latest commit. Verificar el commit activo y estado Live.

Antes del primer login o cualquier operación que escriba auditoría, completar el
respaldo cifrado descrito en RESPALDOS_PRODUCCION.md. Después verificar con una
cuenta administrativa autorizada: login, /me, restauración de sesión, navegación,
Dashboard y consultas. No registrar datos ficticios. El Administrador no obtiene
por su rol acceso al contenido documental o a SíseVe: se mantienen sus controles
adicionales. No cambiar los cinco estados ni los triggers existentes.

## Revisión de datos y permisos

npm run build y node scripts/auditar-production.mjs ejecutan inventario y controles
de coherencia en una sesión READ ONLY. El informe detallado queda en .private.
Los candidatos sintéticos son heurísticos y nunca se eliminan automáticamente.
No se cambian privilegios ante una denegación: usar una credencial separada de
lectura para el respaldo completo, nunca neondb_owner en la aplicación.

## Límites operativos

Render Free se suspende por inactividad. El primer acceso puede necesitar esperar
el arranque en frío y reintentar. Los limitadores conservan ventanas y cantidades,
con MemoryStore: sus contadores se pierden al reiniciar el proceso; no son un
almacén compartido para múltiples instancias. No se modifican JWT ni parámetros
scrypt para evitar este comportamiento.

La automatización de R2 queda independiente del arranque de la aplicación. Si
R2 requiere activación/facturación, se deja pendiente y no se autoriza ningún
cargo. No se habilita un cron de pago en Render.
