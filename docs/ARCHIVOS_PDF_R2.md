# PDF documentales privados en Cloudflare R2

## Alcance y reglas verificadas

Un registro puede existir sin PDF. El adjunto se registra después de confirmar el
documento: si falla la subida, se conserva el documento y la interfaz permite
reintentar desde su detalle sin volver a registrarlo. Existe como máximo un vínculo
vigente por documento, garantizado por la PK de `documentos_pdf`.

La consulta reutiliza `documentos.repository.obtener`: conserva el alcance ordinario
de autoría y consulta recíproca Dirección–Secretaría. Administración no adquiere acceso
documental. Para adjuntar, reemplazar o eliminar se reutilizan `documentoBloqueado`
y `exigirEditable`: documento activo, custodia actual y, en el contexto ordinario,
autoría propia; no puede existir traslado ni recuperación abierta. Se admiten los
estados RECIBIDO y PENDIENTE_DECISION, como los indicadores de edición actuales.
Compartir oficina no concede permisos. Dirección no modifica adjuntos ajenos.

SíseVe usa exclusivamente `/api/siseve/operaciones`: autorización individual y clave
scrypt se comprueban en cada solicitud, antes de habilitar el contexto restringido.
Las rutas ordinarias excluyen estos documentos. El contexto restringido conserva
sus reglas existentes de custodia. La UI pide la contraseña con entrada password,
la descarta tras enviarla y retira metadatos PDF al ocultar la pestaña.

Los anulados/inactivos siguen siendo consultables si el módulo actual lo permite,
pero no permiten modificar adjuntos. Ampliar modificaciones de PDF en anulados,
traslado, recuperación o fuera de custodia requiere una decisión funcional expresa.
Esta entrega no concede esas excepciones. Ninguna operación PDF actualiza la tabla
documentos, sus códigos, custodia, ubicaciones, decisiones o movimientos.

## Migración y estado previo

Preparada `backend/scripts/sql/produccion-vigente/005-documentos-pdf.sql`.
No se modifican ni reaplican 001–004. Una consulta de metadatos en sesión READ ONLY,
con identidad Neon/TLS validada mediante `abrirProduccionLectura`, encontró el trigger
`aa_documentos_clasificacion_registro` con `BEFORE INSERT OR UPDATE OF clasificacion_registro`.
Es la definición esperada por 004; esto verifica el efecto en el esquema, no acredita
un registro de ejecución/checksum de esa migración.

005 crea cuatro tablas aditivas: vínculo vigente, intenciones de carga, objetos
pendientes de limpieza y auditoría. Guarda referencias y metadatos; no contiene
bytes PDF ni modifica registros previos. Concede al rol runtime existente solo los
privilegios de estas tablas y su secuencia de auditoría. El comando de migración
local existente NO incorpora 005 ni se modificó para aplicarla automáticamente.
La migración solo se ejecutó en un cluster PostgreSQL 18 efímero con tablas mínimas y datos ficticios. No se aplicó a las bases local institucional ni Neon.

## Protocolo y fallos parciales

1. Preparar carga bajo autorización y bloqueo documental. Se compara la revisión
   UUID vigente, se limita a tres cargas no vencidas por actor y se guardan las
   intenciones de ambas claves ANTES de devolver cualquier URL.
2. PUT prefirmado de 300 segundos, MIME y longitud firmados, `If-None-Match: *`.
   El navegador nunca recibe permiso DELETE ni PUT sobre una clave definitiva.
   Las claves usan UUID aleatorios sin datos personales.
3. Confirmar dentro de los diez minutos. Se revalidan cuenta, acceso, custodia,
   estado, circulación y revisión; se bloquean documento, carga y objetos. Se
   comprueban HEAD, tamaño exacto (máximo 15 MiB = 15 728 640 bytes), MIME,
   cabecera `%PDF-`, EOF y parseo de la estructura con pdf-lib. Se rechazan PDF
   cifrados o sin páginas. El contenido se lee de R2 en memoria acotada, sin disco
   persistente. No se analiza malware ni se promete sanear contenido activo PDF.
4. Copiar desde el objeto temporal validado, condicionado por ETag, a una clave
   definitiva distinta. El PUT temporal es condicional y nunca permite modificar
   la copia definitiva. Confirmar vínculo y auditoría en la misma transacción.
   Un fallo de copia o SQL conserva el vínculo anterior; la intención durable
   permite recoger cualquier copia huérfana.
5. Tras el commit se intenta borrar el anterior. Si R2 falla, el vínculo nuevo
   permanece confirmado y se conserva una tarea de limpieza con reintento y
   auditoría. El indicador visible sigue pendiente durante el backoff.

Eliminar exige confirmación, autorización y revisión vigente; desvincula y programa
el borrado en la misma transacción. Nunca borra documentos. La interfaz distingue
desvinculación confirmada y eliminación física pendiente. El recolector usa
`FOR UPDATE SKIP LOCKED`, excluye objetos vigentes y comparte bloqueos con la
confirmación; dos procesos no limpian el mismo objeto simultáneamente. DELETE es
idempotente: una caída después de borrar y antes de confirmar SQL es recuperable.
No hay historial de contenidos ni API para recuperar adjuntos anteriores.

Los temporales se limpian después del vencimiento de confirmación más un minuto.
Una carga abandonada no se elimina mientras su firma pueda seguir utilizándose.
La regla lifecycle adicional del prefijo `tmp/` es obligatoria como defensa frente
a solicitudes PUT iniciadas antes de vencer y terminadas mucho más tarde. No se
debe aplicar lifecycle al prefijo `pdf/`, que contiene adjuntos vigentes.

Las URLs GET duran 60 segundos. Son credenciales portadoras: cualquiera que reciba
una podrá usarla durante ese plazo; la revocación de acceso no invalida una URL ya
emitida. No se almacenan en UI, auditoría ni logs. La emisión exige autorización
vigente. Las respuestas HTTP privadas usan no-store y los enlaces no envían referrer.

## API

| Ruta ordinaria | Contrato |
| --- | --- |
| GET `/api/documentos/:id/pdf` | Metadatos, permiso modificar, número de limpiezas pendientes |
| POST `…/pdf/cargas` | nombre, tamano, mime application/pdf, revision UUID o null |
| POST `…/pdf/confirmar` | carga UUID |
| POST `…/pdf/abrir` | descargar boolean; devuelve URL de 60 segundos |
| POST `…/pdf/eliminar` | revision UUID, confirmar true |

SíseVe expone `pdf-consultar`, `pdf-iniciar`, `pdf-confirmar`, `pdf-abrir` y
`pdf-eliminar` en su puerta existente, con los mismos contratos en datos, id y clave.
Consultar y abrir son operaciones independientes; no se concede un desbloqueo.

## Configuración privada y publicación pendiente

1. Crear manualmente un bucket privado EXCLUSIVO de PDF, independiente del de
   respaldos. Desactivar r2.dev y acceso público; no habilitar dominios públicos.
   Crear credenciales limitadas a objetos de ese bucket. No usar credenciales de
   respaldos ni incluirlas en VITE_*, código, capturas o logs.
2. Configurar privadamente en Render `R2_PDF_ACCOUNT_ID`, `R2_PDF_BUCKET`,
   `R2_PDF_ACCESS_KEY_ID`, `R2_PDF_SECRET_ACCESS_KEY`. El adaptador rechaza que
   R2_PDF_BUCKET coincida con R2_BUCKET si esta última variable está presente.
   Verificar también por consola la separación cuando respaldos usa otro entorno.
   La configuración R2 es diferida: el registro sin PDF continúa disponible sin ella.
3. Configurar CORS como sigue, sustituyendo/agregando exclusivamente orígenes
   autorizados. Localhost solo debe habilitarse en un bucket seguro de pruebas.

```json
[
  {
    "AllowedOrigins": ["https://sistema-documental-p.pages.dev"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["Content-Type", "If-None-Match"],
    "ExposeHeaders": ["ETag", "Content-Length"],
    "MaxAgeSeconds": 300
  }
]
```

4. Configurar lifecycle de expiración de objetos exclusivamente para `tmp/` a un
   día. No activar versiones, copias de contenidos anteriores ni reglas de respaldo
   de este bucket. Revisar también registros externos para no registrar URLs firmadas.
5. Revisar/aprobar 005 y su rol runtime; obtener respaldo institucional conforme a
   la guía existente y aplicarla manualmente con credencial de migración, contra
   identidad verificada. No reutilizar 001–004 ni modificar secretos automáticamente.
6. Publicar el código revisado y configurar mantenimiento periódico externo al
   arranque gratuito de Render: `node scripts/limpiar-pdf.mjs` desde backend ya
   compilado, con las mismas variables privadas y perfil aprobado. Procesa hasta
   50 objetos por ejecución; repetir hasta vaciar pendientes. El programa verifica
   la identidad PostgreSQL antes de operar. No necesita enumerar el bucket.
7. Antes de habilitar uso institucional, verificar en un bucket privado de pruebas
   con un origen autorizado PUT firmado/condicional, CORS, lectura, borrado real,
   revocación, reemplazo y lifecycle. Revisar que el objeto anterior desaparece
   mediante HEAD y que el nuevo permanece. No usar archivos institucionales en QA.

No se crearon recursos cloud, no se modificaron secretos de Render, no se publicó
código ni se ejecutaron migraciones productivas. Las pruebas unitarias usan dobles de PostgreSQL/R2 y bytes PDF generados. Además,
`node --test tests/pdf.postgres.integration.mjs` crea un cluster PostgreSQL 18 en
una carpeta temporal, restringido a loopback y con rol/base ficticios; aplica 005
a tablas mínimas de usuarios y documentos. Sus seis comprobaciones verifican
integridad, dos conexiones reales compitiendo por revisión, rollback, SKIP LOCKED,
backoff visible y limpieza de temporales. La suite detiene el cluster y elimina su
carpeta al finalizar. No reproduce todos los triggers/esquema institucionales ni
acredita operación en R2. Puede ubicarse PostgreSQL mediante PDF_TEST_PG_BIN.

Dependencias añadidas al backend: @aws-sdk/client-s3 y
@aws-sdk/s3-request-presigner para R2; pdf-lib para validar la estructura real,
además de la firma. Los manifiestos y lockfile se actualizaron con npm install.
No se añadieron dependencias frontend.

## Comprobaciones ejecutadas

| Proyecto / comando | Resultado final |
| --- | --- |
| Backend: npm run typecheck | Correcto |
| Backend: npm run lint | Correcto, sin advertencias |
| Backend: npm test | 51 pruebas correctas |
| Backend: npm run build | Correcto |
| Frontend: npm run typecheck | Correcto |
| Frontend: npm run lint | Correcto, sin advertencias |
| Frontend: npm test | 59 pruebas correctas |
| Frontend: npm run build | Correcto |
| node --test tests/pdf.postgres.integration.mjs (backend) | 6 comprobaciones correctas; cluster retirado |
| git diff --check | Correcto |

Las pruebas nuevas verifican selección y tamaño, PDF parseable y bytes falsos,
firma de PUT condicional, MIME/longitud HEAD, copia por ETag, adjunto posterior,
consulta y descarga, reemplazo, borrado, fallo R2/SQL, revisión concurrente,
recogida de temporales y autorización SíseVe por cada operación. Se comprobó en
solo lectura que el rol productivo vigente ya tiene UPDATE sobre documentos,
necesario para el bloqueo documental existente; 005 no amplía ese permiso.
La validación de producción no leyó contenidos PDF ni modificó datos.

No se ejecutó un recorrido visual de navegador contra R2 real. Ese ensayo con
bucket seguro y archivos ficticios sigue siendo un requisito previo a habilitar
la funcionalidad institucional, incluida la verificación de CORS y expiración.

Documentación del proveedor usada para el diseño:
[URLs prefirmadas](https://developers.cloudflare.com/r2/api/s3/presigned-urls/),
[operaciones condicionales](https://developers.cloudflare.com/r2/api/s3/extensions/),
[CORS](https://developers.cloudflare.com/r2/buckets/cors/).

## Validación operativa PDF — 29 de octubre de 2026

La migración 005 está instalada en PostgreSQL local y en Neon production. Los
respaldos privados incluyen comprobación GCM y recuperación en PostgreSQL aislado;
la comparación entre servidores normaliza UTC para representar timestamptz.
No volver a ejecutar 001–005 en estas bases.

El ensayo local sobre el documento ficticio 95 confirmó adjunto posterior,
visualización, descarga y reemplazo. HEAD de R2 confirmó que ambos PDF finales
retirados desaparecieron físicamente; el documento sigue disponible.

La limpieza prioriza claves definitivas retiradas frente a temporales vencidos.
El backend reintenta al arrancar y cada cinco minutos mientras está activo.
Render gratuito puede suspenderse: durante esa suspensión no corre el temporizador;
las tareas durables se retoman al despertar. R2 expira independientemente los
prefijos tmp/ y qa/pdf-validacion-local/tmp/ a un día. Nunca aplicar expiración
sobre pdf/ ni sobre qa/pdf-validacion-local/pdf/.

La configuración local adicional se carga desde .env.r2-pdf únicamente en perfil
local y fuera de pruebas. R2_PDF_PREFIX=qa/pdf-validacion-local/ aísla las claves
ficticias; este valor no debe trasladarse a Render. Las claves completas quedan
persistidas, por lo que cambiar un prefijo no redirige archivos existentes.

La publicación todavía requiere completar la matriz funcional y comprobar las
variables privadas en Render, los permisos, el commit y ambos alojamientos.
