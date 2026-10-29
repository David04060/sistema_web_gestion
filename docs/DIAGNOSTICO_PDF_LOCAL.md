# Diagnóstico del GET PDF local

## Causa confirmada

Se reprodujo `GET /api/documentos/5/pdf` contra el proxy Vite de localhost:5173
y directamente contra Express en 127.0.0.1:3000. Ambos devolvieron HTTP 500:

```json
{"error":"Error interno del servidor"}
```

La reproducción directa del servicio, con conexiones PostgreSQL de solo lectura,
identificó el error original `42P01: no existe la relación «documentos_pdf»`.
El middleware público oculta correctamente el detalle SQL y devuelve el error
genérico; no lo convierte en un documento sin PDF.

Ruta revisada: app.ts monta pdfRouter antes del router documental; requiereAuth
valida JWT/cuenta; pdf.controller.consultar valida id y llama pdf.consultar;
este autoriza el documento y luego consulta repo.vigente y repo.pendientes.
La primera consulta accede a documentos_pdf; la segunda requiere pdf_objetos,
pdf_cargas y documentos_pdf. ArchivoPdf.tsx lanza el GET al montar el detalle
ordinario. La respuesta falla en PostgreSQL antes de poder determinar si hay PDF.

## Identidad y objetos locales comprobados

- Base sistema_web_final, servidor ::1/128, puerto 5432, esquema public.
- Rol configurado localmente: postgres. Sin rama Neon.
- Diagnóstico con transaction_read_only=on; sin DDL ni DML.
- 83 documentos existentes al realizar el diagnóstico.
- Ausentes: pdf_cargas, pdf_objetos, documentos_pdf y pdf_eventos.
- Ausentes: pdf_eventos_id_seq y los tres índices explícitos de 005.
- Sin colisiones con los ocho índices implícitos de PK/UNIQUE de 005.
- Sin tipos compuestos homónimos ni event triggers DDL.
- documentos.id y usuarios.id son bigint NOT NULL y PK, compatibles con las FK.
- El rol sistema_web_app existe; tiene USAGE de public. El rol local postgres
  tiene permisos CREATE y es superusuario; no requiere nuevos privilegios para
  instalar el esquema. No se modificó ningún rol ni permiso durante el diagnóstico.
- El trigger de clasificación tiene la definición final esperada de 004:
  BEFORE INSERT OR UPDATE OF clasificacion_registro. No se reaplicó 004.
- clock_timestamp() existe. 005 no crea ni exige funciones propias/extensiones.

La migración 005 es compatible con las dependencias locales observadas y es
aditiva: crea cuatro tablas, una secuencia identity y sus índices/restricciones.
No contiene INSERT/UPDATE/DELETE sobre documentos o usuarios, ALTER de sus
columnas, cambios a sus triggers ni reinicios de secuencias existentes. Las FK
no usan ON DELETE CASCADE. Los GRANT afectan únicamente a los objetos nuevos.
Los datos existentes quedan sin vínculo PDF, sin necesitar rellenado o conversión.

## R2 es una condición independiente

Las cuatro variables R2_PDF_* no están configuradas. crearAlmacenR2 produce
HttpError 503 «Almacenamiento PDF no configurado» al inicializarse.
El GET de metadatos NO inicializa ese adaptador; por tanto esta ausencia no causa
el 500 reproducido. Con el esquema instalado y sin adjunto, la respuesta esperada
es HTTP 200, archivo:null y limpieza_pendiente:0; modificar depende de los permisos.
La UI muestra «Sin PDF adjunto» en ese caso.

| Condición | Resultado |
| --- | --- |
| Esquema instalado, documento autorizado sin adjunto | 200 con archivo:null; no requiere R2 |
| Tabla/columna inexistente o permisos SQL insuficientes | Error de base de datos; no se sustituye por archivo:null |
| Operación que necesita R2, esquema instalado, R2 sin configurar | 503 al inicializar almacenamiento; no confirma una carga |
| Documento no autorizado o inexistente | 404, sin conceder acceso por oficina o rol administrativo |

## Cambios y pruebas de este diagnóstico

No se cambiaron rutas, controladores, servicios, repositorios, permisos ni UI:
el fallo requiere instalar el esquema pendiente, no simular que está vacío.
Se añadió scripts/diagnosticar-pdf-local.mjs, exclusivamente local y de lectura,
y dos regresiones en tests/pdf.test.mjs:

- Consulta sin adjunto sin inicializar R2; la carga con R2 ausente da 503 y revierte
  la intención de carga.
- Los errores SQL 42P01, 42703 y 42501 se propagan y nunca se transforman en null.

Las 16 comprobaciones PDF pasaron con PostgreSQL/R2 simulados. Esto no acredita
la respuesta 200 contra sistema_web_final: 005 sigue ausente y, por instrucción
expresa, no se ha aplicado. La verificación real posterior queda pendiente.

Para repetir el diagnóstico desde backend, después de compilar:

```powershell
node scripts/diagnosticar-pdf-local.mjs 5
```

El script lee la configuración privada sin imprimir secretos, valida destino local,
consulta metadatos y reproduce GET usando un token efímero solo en memoria para
el registrador activo del documento. No hace login ni escribe auditoría. No lo
ejecutar contra otros destinos ni ampliar su alcance para escrituras.

## Aplicación local propuesta, pendiente de autorización

No ejecutar hasta obtener autorización explícita. No usar npm run migrate:local
para resolver este error: su lista de migraciones no incluye 005.

1. Repetir el diagnóstico y verificar que los objetos siguen totalmente ausentes.
   Si alguno existe, detenerse y comparar su definición; no forzar IF NOT EXISTS
   ni eliminar tablas. Confirmar nuevamente identidad, permisos y datos previos.
2. Preparar respaldo local fuera de Git. Usar un nombre de archivo que no exista
   y verificar la integridad del archivo con pg_restore --list.
3. Ejecutar exclusivamente 005, con public como search_path y timeouts de bloqueo.
   El archivo ya contiene BEGIN/COMMIT. ON_ERROR_STOP evita continuar ante fallo;
   al cerrar la conexión sin COMMIT PostgreSQL revierte la transacción.
4. Revisar tablas, columnas, índices, FK, privilegios y sus definiciones instaladas.
   Comparar conteos/huellas de tablas y secuencias anteriores con la evidencia
   tomada antes de aplicar, para confirmar conservación de datos.
5. Repetir el GET autenticado del documento 5. Debe devolver 200/archivo:null
   aunque R2 siga sin configurar. Verificar el texto en el navegador.
6. Probar la carga real solo después de configurar un bucket privado seguro y
   sus credenciales auténticas; no inventar credenciales ni modificar Render/Neon.

Ejemplo del paso de aplicación, desde backend, **solo después de autorización y
respaldo** (la contraseña, si se solicita, se ingresa interactivamente):

```powershell
$env:PGOPTIONS = '-c search_path=public -c lock_timeout=5s -c statement_timeout=60s'
psql -X -h localhost -p 5432 -U postgres -d sistema_web_final -v ON_ERROR_STOP=1 -f .\scripts\sql\produccion-vigente\005-documentos-pdf.sql
Remove-Item Env:PGOPTIONS
```

Se prefiere ejecutar este procedimiento de manera controlada con verificación de
identidad previa a DDL y comparación de huellas en la misma transacción. No se
aplicó el comando de ejemplo, no se ejecutaron migraciones 001–004 ni se contactó
Render o Neon durante este diagnóstico. El error local seguirá presente hasta
autorizar e instalar el esquema necesario.
