# Despliegue manual: Neon, Render y Cloudflare Pages

[Inicio](../README.md) · [Base de datos](../database/README.md)

El procedimiento publica PostgreSQL en Neon, la API en Render y los archivos estáticos en Pages. R2 privado habilita los PDF. Los valores entre `REEMPLAZAR` son marcadores; las credenciales se introducen en los paneles o sesiones privadas, nunca en el repositorio. Se utiliza el mismo código revisado para backend y frontend.

## Distribución de los servicios

El navegador descarga la interfaz de Pages y envía sus solicitudes a la API en Render.
La API comprueba la cuenta y consulta PostgreSQL en Neon. Para los PDF, autoriza cargas
y lecturas en R2 privado. Las credenciales de PostgreSQL y R2 pertenecen al backend;
el frontend solo necesita la dirección pública de la API.

Los pasos de creación de base y primera cuenta corresponden a una instalación nueva.
Una instalación existente conserva su base, cuentas y archivos. La modalidad de Pages
se elige según el proyecto: carga de archivos compilados o integración con Git, descritas abajo.

## 1. Preparar el código

Instalar Node.js 24.x y cliente PostgreSQL 18. Desde `backend/` y después desde `frontend/`:

```sh
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

Las pruebas backend necesitan también los binarios de servidor PostgreSQL para crear su instancia temporal. Revisar `git status` y seleccionar exclusivamente los archivos de la entrega. La publicación manual se realiza después de revisar el commit que se utilizará en ambos servicios.

## 2. Crear PostgreSQL en Neon

1. En Neon Console crear un proyecto PostgreSQL 18, seleccionar región y rama de producción.
2. Crear una base **vacía** llamada `sistema_documental_produccion`, con su propietario de mantenimiento. Registrar el ID de rama `br-…` y el hostname de conexión **directa**; desactivar la opción de conexión agrupada al copiar los datos. El backend rechaza hosts con `-pooler`.
3. Desde una terminal con psql, configurar el host, usuario propietario, base y TLS. Ejemplo PowerShell, desde la raíz:

   ```powershell
   $env:PGHOST = 'REEMPLAZAR_HOST_DIRECTO.neon.tech'
   $env:PGPORT = '5432'
   $env:PGUSER = 'REEMPLAZAR_PROPIETARIO'
   $env:PGDATABASE = 'sistema_documental_produccion'
   $env:PGSSLMODE = 'verify-full'
   psql -X -W -v ON_ERROR_STOP=1 -f database/instalar.sql
   ```

   Usar el hostname completo entregado por Neon. psql pide la contraseña. No pegar el instalador en SQL Editor: contiene directivas de psql. El instalador ya contiene la estructura vigente; no necesita migraciones adicionales.

4. Abrir `psql -X -W -v ON_ERROR_STOP=1` con ese mismo propietario. Crear el rol de aplicación por SQL y asignar contraseña con el comando interactivo `\password`:

   ```sql
   CREATE ROLE sistema_web_app LOGIN;
   \password sistema_web_app
   GRANT CONNECT ON DATABASE sistema_documental_produccion TO sistema_web_app;
   GRANT USAGE ON SCHEMA public TO sistema_web_app;
   GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO sistema_web_app;
   GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO sistema_web_app;
   GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO sistema_web_app;
   ```

   Estos permisos permiten las operaciones de la API; los triggers mantienen la integridad y la historia. La cuenta de conexión es exclusiva del backend, que aplica autorización por usuario. No otorgar propiedad del esquema ni usar el propietario de mantenimiento como `DATABASE_URL` de Render. Si una migración crea objetos nuevos, revisar y conceder sus permisos explícitamente.

5. Comprobar tablas y catálogos con [la guía SQL](../database/README.md) y crear el primer Superadministrador con [Cuentas iniciales](../database/CUENTAS_MANUALES.md).
6. Preparar la URL de aplicación, codificando caracteres reservados de la contraseña:

   ```text
   postgresql://sistema_web_app:CONTRASENA_CODIFICADA@HOST_DIRECTO/sistema_documental_produccion?sslmode=verify-full
   ```

El validador exige `sistema_web_app`, host Neon directo, base coincidente, `sslmode=verify-full` e identidad de rama. La [documentación de roles de Neon](https://neon.com/docs/manage/roles) distingue roles creados por SQL de roles administrados desde su consola.

## 3. Configurar R2 para PDF

Crear un bucket exclusivo y privado para PDF, distinto del bucket de respaldos. Mantener deshabilitado el acceso público. Crear credenciales S3 con lectura y escritura de objetos limitadas a ese bucket. Guardar Account ID, nombre del bucket, Access Key ID y Secret Access Key para Render.

En la configuración CORS del bucket autorizar el origen definitivo de Pages. Sustituir el dominio del ejemplo:

```json
[
  {
    "AllowedOrigins": ["https://REEMPLAZAR.pages.dev"],
    "AllowedMethods": ["GET", "HEAD", "PUT"],
    "AllowedHeaders": ["Content-Type", "If-None-Match", "Range"],
    "ExposeHeaders": ["ETag", "Content-Length", "Content-Range", "Accept-Ranges"],
    "MaxAgeSeconds": 3600
  }
]
```

Añadir solo los orígenes de desarrollo o dominios personalizados que deban acceder. Las URLs firmadas autentican el acceso temporal, pero el navegador también necesita [CORS de R2](https://developers.cloudflare.com/r2/buckets/cors/). El prefijo `produccion/` separa claves; no convierte el bucket en público. Cambiar el prefijo no mueve los archivos ya registrados.

## 4. Crear el backend en Render

En Render crear **Web Service**, conectar el repositorio y elegir la rama/commit revisado. Configurar:

| Ajuste | Valor |
|---|---|
| Runtime | Node |
| Root Directory | `backend` |
| Build Command | `npm ci --include=dev && npm run build` |
| Start Command | `npm start` |
| Health Check Path | `/api/health` |
| Auto Deploy | Desactivado para publicación manual |

En **Environment** introducir:

| Variable | Valor requerido |
|---|---|
| `NODE_VERSION` | `24.21.0`, versión fijada en el repositorio |
| `NODE_ENV` | `production` |
| `DB_PROFILE` | `neon` |
| `DATABASE_URL` | URL privada de `sistema_web_app` preparada en Neon |
| `NEON_DATABASE` | `sistema_documental_produccion` |
| `NEON_HOST` | Host directo exacto, sin protocolo ni ruta |
| `NEON_BRANCH_ID` | ID `br-…` de esa rama |
| `JWT_SECRET` | Secreto aleatorio de al menos 32 caracteres, sin marcador `REEMPLAZAR_` |
| `CORS_ORIGINS` | Origen HTTPS exacto de Pages; varios separados por comas |
| `TRUST_PROXY_HOPS` | `1` |
| `R2_PDF_ACCOUNT_ID` | ID de cuenta Cloudflare, 32 caracteres hexadecimales |
| `R2_PDF_BUCKET` | Bucket privado de PDF |
| `R2_PDF_ACCESS_KEY_ID` | Access Key ID S3 |
| `R2_PDF_SECRET_ACCESS_KEY` | Secret Access Key S3 |
| `R2_PDF_PREFIX` | `produccion/` |

Render proporciona `RENDER=true` y `PORT`; no copiar el puerto local. Reservar primero el nombre del proyecto Pages para conocer su origen. Guardar variables y ejecutar el despliegue manual. Comprobar que los logs muestran verificación de PostgreSQL y arranque HTTP. Consultar `https://HOST_RENDER/api/health` y confirmar el commit desplegado. El estado de salud HTTP no sustituye la prueba autenticada del sistema.

Los campos de servicio y el manejo de variables se describen en [despliegue Render](https://render.com/docs/deploy-node-express-app) y [variables de entorno](https://render.com/docs/configure-environment-variables).

## 5. Publicar el frontend en Cloudflare Pages

### Publicación manual de archivos compilados

En Cloudflare crear un proyecto **Pages / Direct Upload** con el nombre deseado. Desde `frontend/`, en PowerShell:

```powershell
$env:VITE_API_URL = 'https://REEMPLAZAR.onrender.com'
npm ci
npm run build
```

La URL es el **origen de Render**, sin `/api` ni barra final. Subir únicamente el contenido de `frontend/dist` mediante el panel Direct Upload. También se puede usar la CLI oficial:

```sh
npx wrangler login
npx wrangler pages deploy dist --project-name=NOMBRE_PROYECTO --branch=main
```

La variable debe estar presente al construir localmente; guardarla después en el panel no cambia archivos ya compilados. El proyecto Direct Upload no se convierte posteriormente en integración Git: esa modalidad requiere un proyecto distinto. Véase [Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/).

### Proyecto Pages conectado a Git

Si el proyecto usa integración Git, configurar raíz `frontend`, comando `npm ci && npm run build`, salida `dist`, `NODE_VERSION=24.21.0` y `VITE_API_URL` con el origen Render en el entorno de producción. Iniciar el build del commit revisado desde el panel, con despliegue automático desactivado si se mantiene el procedimiento manual. Los directorios y comandos siguen la [configuración de builds de Pages](https://developers.cloudflare.com/pages/configuration/build-configuration/).

La aplicación no incluye `404.html` en la raíz pública: Pages sirve `index.html` para rutas SPA no asociadas a recursos. Comprobar recarga directa de `/dashboard` y `/documentos`. Este comportamiento se explica en [Serving Pages](https://developers.cloudflare.com/pages/configuration/serving-pages/).

## 6. Comprobar y operar

- Abrir Pages, iniciar sesión y consultar dashboard/listado según perfil.
- Comprobar que las peticiones `/api` salen hacia Render y no hacia Pages. Un login que recibe HTML o 405 puede indicar un build sin `VITE_API_URL`.
- Probar con datos de ensayo en una instalación de evaluación: registro, permisos diferenciados del destinatario, delegaciones sucesivas, acciones propias, recorrido, ubicación, PDF y Excel. En producción usar comprobaciones de solo lectura y datos existentes; no crear fixtures para verificar una publicación.
- Verificar CORS tanto de la API como de R2. Si se cambia dominio, actualizar ambos y volver a publicar si cambió el origen API.
- El mantenimiento PDF corre al iniciar y cada cinco minutos mientras el servicio esté activo. Una instancia suspendida no procesa tareas hasta reanudarse.
- Conservar respaldos privados de cada instalación y comprobar su restauración antes de aplicar cambios de estructura.

Para actualizaciones, respaldar la base, revisar las migraciones necesarias, desplegar la API compatible y después compilar/publicar Pages. Revertir un commit no revierte una migración SQL. Las instalaciones nuevas usan el punto de entrada `database/instalar.sql`; las existentes conservan sus datos y reciben solo los cambios aplicables.
