# Respaldo completo cifrado y automatización R2

## Respaldo previo obligatorio

Desde backend: npm run build y node scripts/backup-production.mjs.
La configuración de aplicación se lee de .env.neon.production. Una credencial
separada BACKUP_DATABASE_URL se guarda en .private/production/backup.env.
Ambas deben dirigirse al mismo host y Branch ID production verificados.

sistema_web_app tiene los permisos de la aplicación, pero no acceso al esquema
administrado neon_auth. Para un pg_dump completo se utiliza neondb_owner solo
en esta herramienta, con default_transaction_read_only=on. No se conceden nuevos
privilegios ni se suministra ese propietario a Express o Render.

pg_dump de PostgreSQL 18 genera el formato custom directamente a un cifrador
AES-256-GCM, con IV aleatorio y cabecera autenticada. No se escribe un dump en
claro. La CA pública de Node se exporta para libpq/OpenSSL en Windows: se conserva
sslmode=verify-full, la verificación de hostname y la confianza de certificados.

Después se autentica y descifra todo el archivo en memoria/stream, se contrasta
su SHA256 y pg_restore --file=- decodifica todos los objetos y datos hacia un
sumidero de hash. Nunca se restaura en una base ni se ejecuta ese SQL. Esto verifica
legibilidad e integridad; no se presenta como un ensayo de recuperación en otra
base, que el alcance actual prohíbe crear.

Los archivos .dump.enc, sus manifiestos y ULTIMO_RESPALDO.json quedan en
.private/production/backups. La clave local de 32 bytes se conserva por separado
en .private/production/keys/backup.key. Guardar una copia privada segura de esa
clave fuera del equipo: sin ella no hay recuperación. No subirla junto al backup.
Git excluye la carpeta privada, claves y archivos cifrados.

## Automatización preparada, desactivada hasta activar R2

.github/workflows/backup-production.yml programa un respaldo diario a las 03:00
America/Lima y admite ejecución manual. El job no arranca mientras la variable
BACKUPS_ENABLED no sea true. No se activa una suscripción ni un cron de pago de
Render. Las acciones oficiales están fijadas por commit, con contents:read.

Para completar la activación de R2, el propietario debe:

1. Revisar y activar R2 en Cloudflare. Si solicita facturación o un medio de pago,
   esa aprobación es exclusivamente humana; esta preparación no la autoriza.
2. Usar un bucket privado para sistema-documental-backups, sin r2.dev ni dominio
   público. Crear una credencial de objetos limitada a ese bucket, con lectura
   y escritura, y sin permisos administrativos innecesarios.
3. Configurar los secretos del repositorio privado: PRODUCTION_DATABASE_URL,
   PRODUCTION_BACKUP_DATABASE_URL, PRODUCTION_NEON_BRANCH_ID,
   PRODUCTION_NEON_PROJECT_ID, PRODUCTION_NEON_HOST, BACKUP_KEY_BASE64,
   R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID y R2_SECRET_ACCESS_KEY.
4. BACKUP_KEY_BASE64 debe representar la misma clave persistente de 32 bytes
   guardada de forma privada. El modo automatizado rechaza su ausencia y nunca
   genera una clave efímera que se perdería al terminar el runner.
5. Confirmar bucket privado, establecer BACKUPS_ENABLED=true y ejecutar una
   primera corrida manual para revisar el resultado antes de confiar en el cron.

Esta fase pendiente de R2 no impide publicar la aplicación institucional.
La comprobación inicial de la cuenta devolvió código 10042: activar R2 desde el
Dashboard. No se creó un bucket, no se subieron datos ni se aceptaron cargos.

## Protección de la subida

node scripts/backup-production.mjs --r2 solo sube un backup cifrado, autenticado
y legible. Usa S3 SigV4 con Node nativo, sin añadir dependencias al backend.
La clave de cifrado nunca se transmite al bucket. El archivo se vuelve a descargar
para comparar SHA256 después de subirlo. No se publican cuerpos ni cabeceras de
autenticación en logs.

El mecanismo limita cada dump a 128 MiB y el contenido total del bucket a 1 GiB;
si se supera, falla sin subir ni borrar respaldos. No se configura eliminación
automática. Son límites preventivos, no un tope contractual de facturación: la
cuenta puede tener otros consumos y R2 es un servicio medido. No se promete coste
cero ni se activa sin la intervención del propietario.

## Recuperación

Conservar archivo, manifiesto SHA256 y clave privada. Verificar primero GCM y
legibilidad usando verificarArchivoCifrado del módulo encrypted-archive.mjs.
Una restauración real requiere una intervención separada, objetivo confirmado y
autorización; no es parte de la publicación. Nunca sobrescribir production para
probar un respaldo.
