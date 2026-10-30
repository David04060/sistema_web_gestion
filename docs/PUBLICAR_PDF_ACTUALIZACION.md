# Publicación de PDF y permisos

Orden: migración de funciones en Neon, backend Render y frontend Pages.
La transferencia inmediata está cancelada y no forma parte de esta publicación.
Las migraciones locales 007–010 y la compensación 009 no se ejecutan en Neon.

## 1. Neon production desde la terminal local

Los archivos privados existentes `.env.neon.production` y `.private/production/backup.env`
ya identifican el proyecto y rama autorizados. No copiar esas credenciales a GitHub.

Desde la raíz del proyecto, en PowerShell:

```powershell
Set-Location backend
npm ci
npm run build
node scripts/backup-production.mjs
node scripts/migrar-permisos-produccion.mjs
node scripts/migrar-permisos-produccion.mjs --aplicar
```

Detenerse ante cualquier error. El primer comando de migración ensaya y revierte;
el segundo confirma exclusivamente `006-permisos-contenido.sql` y registra su hash.
El script exige respaldo verificado reciente, identidad de producción, coincidencia
de las migraciones 001–005 y conservación de las tablas y secuencias anteriores.
No ejecutar nuevamente 001–005. No pegar las migraciones locales en Neon.

## 2. Render

Abrir el servicio existente `sistema-documental`, repositorio
`David04060/sistema_web_gestion`, rama `main` y directorio raíz `backend`.

- Build: `npm ci --include=dev && npm run build`.
- Start: `npm start`; entorno existente `DB_PROFILE=neon`.
- Conservar DATABASE_URL, JWT_SECRET y los demás secretos vigentes.
- Verificar las variables privadas R2_PDF_ACCOUNT_ID, R2_PDF_BUCKET,
  R2_PDF_ACCESS_KEY_ID y R2_PDF_SECRET_ACCESS_KEY ya introducidas.
- Bucket documental: `documentos-pdf`. No copiar el R2_PDF_PREFIX local de QA.
- Manual Deploy → Deploy latest commit. Comprobar el SHA de GitHub y esperar Live.
- Salud: https://sistema-documental-hw7t.onrender.com/api/health.
- Revisar logs: conexión verificada a Neon y ausencia de errores de funciones/tablas.

## 3. Cloudflare Pages

Compilar desde la raíz del proyecto:

```powershell
Set-Location frontend
npm ci
$env:VITE_API_URL='https://sistema-documental-hw7t.onrender.com'
npm run build
Remove-Item Env:\VITE_API_URL
```

En Cloudflare → Workers & Pages → proyecto existente `sistema-documental-p`, crear
un despliegue de producción de la rama main mediante la carga de `frontend/dist`.
El contenido de dist debe quedar en la raíz del sitio: index.html y assets.
No subir el repositorio ni los archivos .env. Si se usa un ZIP, debe contener esos
archivos directamente, sin una carpeta dist contenedora.

URL: https://sistema-documental-p.pages.dev.
La variable VITE_API_URL queda incorporada al compilar; configurarla después de
subir un dist ya construido no cambia el artefacto.

## 4. R2 y comprobación final

Conservar bucket privado, CORS restringido al origen de Pages y al origen local
autorizado. Permitir GET/HEAD/PUT y los headers requeridos por la carga firmada;
no habilitar DELETE desde el navegador. Conservar las reglas de temporales
tmp/ y qa/pdf-validacion-local/tmp/; no extenderlas a pdf/.

En Pages recargar con Ctrl+F5 e iniciar sesión de nuevo. Con un documento ficticio:

1. Sin PDF: seleccionar muestra previsualización; cancelar no sube; confirmar sube.
2. Con PDF: visualizar abre el visor interno; descarga devuelve el PDF vigente.
3. Directora responsable: gestión permitida. Responsable Secretaría: Directora
   consulta/descarga y recibe denegación de carga; Secretaría sí gestiona.
4. Dirección y Secretaría consultan registros ordinarios ajenos sin obtener escritura.
5. Usuario conserva registro recibido/emitido y delegación personal sin transferencia.
6. Probar SíseVe con sus controles adicionales y comprobar que Administrador no
   obtiene acceso global al contenido documental.

Si falla una comprobación esencial, no continuar publicando. Conservar el respaldo
y el despliegue anterior. No restaurar un respaldo antiguo sobre datos actuales.

## Validación previa

64 pruebas backend, 60 frontend, lint y compilación de ambos aprobados. La nueva
migración productiva se ensayó con rollback y conservó 20 tablas y sus secuencias.
La ejecución final en Neon y los despliegues deben comprobarse por separado.
