# Publicación del modelo documental vigente — 3 de noviembre de 2026

## Destino aprobado y preparado

Se conserva la base antigua neondb en Neon. La base nueva es sistema_web_documental_final dentro del mismo proyecto y rama production. Se transfirió una copia consistente de la base local: cinco cuentas existentes, 21 tablas, 16 documentos y dos referencias PDF. Las huellas de todas las tablas coinciden; neondb conserva sus huellas anteriores. No se crearon cuentas ficticias.

El backend valida NEON_DATABASE, NEON_HOST, NEON_BRANCH_ID, sistema_web_app y TLS con certificado verificado. Antes de abrir HTTP y en cada conexión del pool comprueba además las columnas del esquema documental nuevo. El frontend se conecta al API Render, nunca directamente a Neon.

## Configuración productiva

- Render: servicio existente sistema-documental; rootDir backend; npm ci --include=dev && npm run build; npm start; Node 24; auto-deploy deshabilitado.
- DB_PROFILE=neon y NEON_DATABASE=sistema_web_documental_final; DATABASE_URL privada apunta a esa base en el endpoint directo ya autorizado.
- Conservar JWT_SECRET, NEON_HOST, NEON_BRANCH_ID, CORS_ORIGINS y las credenciales R2 existentes.
- R2_PDF_PREFIX=produccion/: archivos nuevos definitivos en produccion/pdf/ y temporales en tmp/produccion/.
- Bucket documentos-pdf privado. QA se conserva. No se aplica expiración a produccion/pdf/. La regla tmp/ de un día cubre los temporales; los PDF vigentes quedan excluidos también del recolector del backend.
- El recolector remoto solo procesa claves del prefijo productivo y sus temporales. No procesa claves QA heredadas.
- Las referencias PDF existentes conservan sus claves; cambiar el prefijo no las mueve ni las elimina.
- Pages: proyecto existente sistema-documental-p; build con VITE_API_URL=https://sistema-documental-hw7t.onrender.com y publicación del contenido de frontend/dist.

## Evidencias y límites

La transferencia y las verificaciones de datos se documentan en el área privada local .private/despliegue-20261103. Las cadenas de conexión, respaldos y credenciales no se versionan. Las capturas QA se conservan localmente y se excluyen del commit.

La comprobación final del estado Live de Render/Pages y las solicitudes remotas debe corresponder al commit que efectivamente se publique; las pruebas locales no demuestran por sí solas ese estado. Los informes de fases anteriores se conservan como antecedentes y no sustituyen esta configuración.
