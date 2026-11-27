# Backend documental

API Express y TypeScript con PostgreSQL como fuente de identidad, permisos e integridad. [Volver al proyecto](../README.md).

## Instalación y configuración

Requiere Node.js 24.x, npm y PostgreSQL 18 preparado con la [guía SQL](../database/README.md). Desde `backend/`, ejecutar `npm ci` y copiar `.env.example` a `.env` (`Copy-Item .env.example .env` en PowerShell). Sustituir los marcadores; los archivos privados están excluidos de Git.

| Variable | Uso |
|---|---|
| `DATABASE_URL` | Conexión local a `sistema_web_documental_final`; contraseña codificada para URL |
| `JWT_SECRET` | Secreto aleatorio de al menos 32 caracteres |
| `NODE_ENV` | `development`, `test` o `production` |
| `PORT` | 3000 por defecto; Render lo proporciona |
| `DB_PROFILE` | `local` por defecto; `neon` y `neon-qa` requieren configuración explícita |
| `CORS_ORIGINS` | Orígenes exactos separados por comas, sin rutas ni comodines; vacío con proxy Vite local |
| `TRUST_PROXY_HOPS` | 0 local, 1 detrás de Render |
| `NEON_DATABASE`, `NEON_HOST`, `NEON_BRANCH_ID` | Identidad remota esperada; obligatorias en Render |
| `R2_PDF_ACCOUNT_ID`, `R2_PDF_BUCKET` | Cuenta y bucket privado para PDF |
| `R2_PDF_ACCESS_KEY_ID`, `R2_PDF_SECRET_ACCESS_KEY` | Credenciales S3 del bucket de PDF |
| `R2_PDF_PREFIX` | Prefijo persistido por objeto, por ejemplo `produccion/` |

`src/config/env.ts` carga `.env` en local, `.env.neon` con perfil `neon` y `.env.neon.qa` con `neon-qa`. Render usa sus variables de entorno. Localmente puede complementar R2 con `.env.r2-pdf`. QA exige rama y host distintos del principal. Los perfiles no se mezclan automáticamente.

Para generar un secreto: `node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"`. Guardar el resultado únicamente en el entorno privado. El arranque verifica destino y esquema; no instala ni migra la base.

## Ejecución, compilación y pruebas

| Comando desde `backend/` | Resultado |
|---|---|
| `npm run dev` | Recarga con tsx en el puerto configurado |
| `npm run build` | Compila `src/` en `dist/` |
| `npm start` | Ejecuta `dist/server.js`; requiere compilación previa |
| `npm run lint` | ESLint sin advertencias permitidas |
| `npm run typecheck` | TypeScript sin emitir archivos |
| `npm test` | Compila y ejecuta la suite completa en un clúster temporal |
| `npm run test:revision:local` | Operaciones, administración y concurrencia aislada |
| `npm run test:guard` | Barreras que impiden escribir fuera del entorno sintético |
| `npm run hash:local` | Pide contraseña oculta y genera hash scrypt; no crea cuentas |

`initdb`, `postgres`, `pg_ctl` y `psql` deben estar en `PATH` o en `POSTGRES_TEST_BIN`. Ejemplo PowerShell:

```powershell
$env:POSTGRES_TEST_BIN = 'C:/Program Files/PostgreSQL/18/bin'
npm test
npm run test:revision:local
```

En Linux/macOS: `POSTGRES_TEST_BIN=/ruta/a/postgresql18/bin npm test`. `initdb` requiere un usuario sin privilegios de root. El ejecutor crea puerto, rol, contraseña y directorio temporales, verifica su identidad, instala SQL y datos sintéticos y retira el clúster. No lee el `.env` de trabajo ni utiliza R2 real. `POSTGRES_TEST_ID_BASE` permite variar IDs sintéticos.

`node scripts/probar-backend-aislado.mjs --listar` muestra los archivos y grupos disponibles.
Las suites completa y revision utilizan el instalador público y datos sintéticos.

## Estructura y solicitud HTTP

1. `src/server.ts` verifica PostgreSQL, abre HTTP e inicia mantenimiento PDF; libera recursos al cerrar.
2. `src/app.ts` compone Helmet, CORS, JSON, salud y routers; importarlo no abre un puerto.
3. `middlewares/auth.middleware.ts` exige Bearer; `modules/auth` verifica firma, actividad y versión de autenticación.
4. Las rutas validan entradas con Zod, una biblioteca que comprueba campos y tipos. `modules/documentos/documentos.operaciones.ts` reúne las operaciones públicas; `documentos.consultas.ts` y `documentos.escrituras.ts` contienen sus implementaciones. `modules/usuarios/administracion.operaciones.ts`, `configuracion.operaciones.ts` y `relevo.operaciones.ts` administran cuentas y catálogos.
5. `shared/documental/nucleo.ts` abre transacción, revalida actor, fija contexto de triggers y comprueba lectura/escritura. Las revisiones evitan sobrescribir cambios concurrentes.
6. `modules/documentos-pdf/pdf.documental.ts` coordina SQL y R2; `pdf.storage.ts` valida y firma operaciones. `exportacion.*` prepara Excel y limpia temporales.

`tests/fixtures` contiene datos sintéticos y `tests/helpers` exige aislamiento.
`scripts/` contiene el ejecutor aislado, la generación local de contraseñas y la limpieza manual de PDF.
`documentos.consultas.ts` reúne lecturas; `documentos.escrituras.ts` conserva los cambios transaccionales.
El detalle de carpetas y archivos importantes está en [backend y sus subcarpetas](../documentacion-publica/ESTRUCTURA.md#backend), dentro de la explicación pública existente. El [mapa principal](../ESTRUCTURA.md) sirve de entrada resumida.

Véanse la [estructura completa](../documentacion-publica/ESTRUCTURA.md) y el
[despliegue manual](../documentacion-publica/DESPLIEGUE_MANUAL.md).

## Lectura y acciones tras registrar o delegar

`documentos.escrituras.ts` registra el documento y su destino inicial dentro de la misma transacción; `insertarDelegacion` también sirve para la delegación posterior. Los triggers `validar_delegacion` y `aplicar_delegacion` validan el destino y conservan autoría, ámbito e historia.

La consulta se decide en PostgreSQL: `documento_consultable_con_delegacion` combina la lectura ordinaria con `documento_delegado_por`, que reconoce a la cuenta destinataria activa y elegible. `lecturaSQL` y `documento()` en `shared/documental/nucleo.ts` aplican esa decisión al listado y al detalle. Un destino manual no concede acceso.

`permisos()` calcula las acciones por separado y las escrituras las vuelven a exigir con revisión vigente. El destinatario puede consultar datos y PDF; ese acceso deshabilita corregir, anular, ubicar, gestionar PDF, relacionar y volver a delegar. `documentos.consultas.ts` restringe también historial y auditoría. Véase el [flujo completo](../documentacion-publica/FUNCIONAMIENTO.md#registrar-delegar-y-consultar-como-destinatario).

## Atención y seguimiento documental (26/11/2026)

`modules/documentos/atencion.documental.ts` contiene acciones propias, PDF opcional y recorrido. Reutiliza `operacion`, el adaptador R2 y la cola `pdf_objetos_pendientes`; `permisos()` separa atención de edición del documento original. Aplicar la migración 016 antes de iniciar esta API.

Pruebas focalizadas después de compilar: `node scripts/probar-backend-aislado.mjs atencion`. La variante `atencion-monolitica` comprueba el instalador SQL alternativo. Ambas usan exclusivamente PostgreSQL temporal. Informe: `docs/ATENCION_SEGUIMIENTO_DOCUMENTAL_20261126.md`.
