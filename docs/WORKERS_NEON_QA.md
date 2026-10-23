# Neon QA y preparación de Workers — 23 de octubre de 2026

> HISTÓRICO: Workers e Hyperdrive ya no ejecutan el backend. La guía operativa
> vigente es [DESPLIEGUE_RENDER_PAGES.md](DESPLIEGUE_RENDER_PAGES.md).

> Documento histórico del diagnóstico inicial. La alternativa 2 ya fue aprobada
> e implementada en la etapa siguiente; el estado y las verificaciones actuales
> están en [INTEGRACION_HIBRIDA_NEON_WORKERS.md](INTEGRACION_HIBRIDA_NEON_WORKERS.md).

## Estado y límites

Neon QA se verifica por host distinto del principal, base `neondb`, usuario
`sistema_web_app` y comparación del `NEON_BRANCH_ID` privado con
`current_setting('neon.branch_id',true)` devuelto por PostgreSQL. No basta con el
nombre de la base: ambas ramas pueden usar `neondb`.

Los archivos `.env` y `.env.neon` se conservan. QA usa `.env.neon.qa`;
Wrangler usa `.dev.vars`/`.dev.vars.qa`, privados y excluidos de Git. Ningún
secreto PostgreSQL forma parte de los archivos Wrangler. La herramienta nueva
de despliegue es Wrangler 4.152.0; `pg` 8.23.1 no necesita actualización.

No se ha publicado ningún Worker. El punto de entrada `workers/index.ts`
responde 503 para cualquier ruta distinta de salud. Tampoco se ha ejecutado
DDL, migraciones, bootstrap o limpieza en Neon QA/principal durante estas pruebas.
Las suites dejan sus fixtures comprometidos exclusivamente en QA; no eliminan
la rama. Las pruebas con rollback revierten filas, pero no los avances de secuencias.

## Diagnóstico de advisory locks

Tres puntos de la aplicación adquieren exactamente la misma clave:

```sql
SELECT pg_advisory_xact_lock(hashtext('administracion-institucional'));
```

1. `src/shared/admin/admin.repository.ts`, `escrituraAdministrativa`:
   serializa roles, oficinas, usuarios y configuración/autorizaciones SíseVe;
   revalida al actor y establece su contexto de auditoría después del bloqueo.
   Protege, entre otras reglas, el recuento del último Administrador activo.
2. `src/modules/ubicaciones/ubicaciones.service.ts`, `escribir`:
   coordina responsabilidad y oficina de estantes/archivadores con cambios
   administrativos y circulación documental.
3. `src/shared/documental/transaccion.ts`, `transaccionDocumental`:
   coordina registro, corrección, decisiones y movimientos físicos con los
   cambios de cuenta/oficina. La operación restringida SíseVe usa esta misma
   transacción y reutiliza su cliente dentro del contexto asíncrono.

Se adquiere después de BEGIN y antes de validar permisos o modificar datos.
PostgreSQL lo libera con COMMIT o ROLLBACK. Sustituirlo por un bloqueo de sesión
o eliminarlo rompe ese contrato de coordinación.

El script histórico `scripts/sql/20261021-siseve-prefijo.sql` también contiene
el bloqueo. No forma parte del arranque y no se ha ejecutado en esta preparación.

Se leyeron las funciones reales de la rama QA. El generador
`fn_documentos_generar_codigo` obtiene el tipo con FOR SHARE y actualiza
`correlativos_documentales` mediante INSERT ... ON CONFLICT DO UPDATE sobre
(tipo_documental_id,anio). No contiene advisory locks. Las funciones de
integridad y circulación usan bloqueos de filas; no se modificó ninguna.
La generación concurrente de doce códigos se verifica en la suite documental.

## Alternativas evaluadas; ninguna aplicada

### 1. Sustituir la coordinación por SQL compatible con Hyperdrive

Las operaciones atómicas y restricciones existentes conservan la protección
del correlativo. Los bloqueos de documentos, movimientos y destinos conservan
sus garantías por fila. Sin embargo, no sustituyen automáticamente el mutex
global: dos administradores podrían observar el mismo recuento antes de
desactivarse entre sí si se retira sin una protección equivalente.

Una sustitución necesita un recurso estable compartido por las tres unidades
de escritura y el mismo orden de adquisición. Puede diseñarse una fila mutex
dedicada (requiere autorización de esquema), o evaluarse una fila institucional
existente y protegida (sin DDL, pero acopla la coordinación al catálogo y cambia
las interacciones con FOR SHARE/FK). Requiere demostrar ausencia de carreras y
deadlocks frente a cambios de rol/oficina, ubicaciones, revocaciones SíseVe y
transiciones documentales. No se recomienda reemplazar cada bloqueo por un
FOR UPDATE sobre la fila que cada operación modifica: son recursos diferentes.

### 2. Conexión directa para las unidades de trabajo que requieren el bloqueo

Conservar BEGIN, bloqueo, set_config(...,true), consultas, triggers y COMMIT o
ROLLBACK en un único cliente directo de `pg`. Hyperdrive puede servir consultas
ordinarias compatibles con caché totalmente desactivada. La selección debe
realizarse en infraestructura al abrir la unidad de trabajo, nunca por consulta
individual ni creando repositorios alternativos. SíseVe debe conservar ese
mismo cliente para toda la operación restringida, incluidas sus lecturas.

El secreto de la conexión directa QA debe ser un secret de Workers independiente
del binding Hyperdrive. Cada petición debe crear/cerrar sus conexiones; no
compartir sockets de Node entre peticiones Workers. Conservar límites pequeños
de conexiones, teniendo en cuenta el límite de seis conexiones simultáneas de
Workers y la capacidad de Neon Free. La conexión directa añade handshakes y
reduce el beneficio de pooling para esas transacciones.

**Recomendación para esta etapa:** alternativa 2 por el menor cambio funcional
y la conservación exacta del mecanismo de exclusión actual. La alternativa 1
puede resultar mejor a largo plazo si se exige que todas las operaciones pasen
por Hyperdrive, pero requiere un rediseño y pruebas específicas del bloqueo.
No se ha implementado ninguna selección híbrida ni sustituido los bloqueos.

## Adaptación ya preparada

Se mantiene `src/server.ts` como entrada Node. `workers/adapter.ts` usa
`httpServerHandler` y la misma aplicación Express; AsyncLocalStorage entrega
un pool por petición a la fachada utilizada por los repositorios. No hay
servicios ni consultas de negocio duplicados. Los secretos JWT se resuelven
dentro del contexto de la petición.

Wrangler utiliza `nodejs_compat`, `enable_nodejs_http_server_modules` y fecha
de compatibilidad 2026-10-23. Workers no carga el `.env` local del backend.
La generación de un hash ficticio aleatorio al importar SíseVe impedía iniciar
workerd; se sustituyó por un formato ficticio constante válido, como en login.
Cada rechazo sigue ejecutando scrypt con N=16384,r=8,p=1 y 64 bytes. La puerta
SíseVe sigue exigiendo autorización y un hash real configurado.

Los limitadores locales conservan MemoryStore. Para Workers se preparó un Store
que utiliza Durable Objects persistentes, con ámbitos separados, contador
atómico y ventana de quince minutos; un fallo del almacén no permite pasar.
Se verificaron veinte incrementos concurrentes. Falta verificar la integración
completa de los middlewares, IP del cliente real, éxito/decremento, expiración,
indisponibilidad y múltiples instancias remotas antes de abrir la API. El binding
nativo de rate limiting no es equivalente: es aproximado por ubicación y solo
ofrece ventanas de 10/60 segundos.

## Verificación y diferencias de runtime

- Node local: 27/27 pruebas unitarias.
- Node con Neon QA directo: suite documental 35/35, incluyendo SQL concurrente,
  flujo HTTP y trece grupos de comprobaciones SíseVe. Regresiones adicionales:
  administración 14/14, catálogos/ubicaciones 14/14 y consultas 5/5.
- Node con Neon QA directo: Dashboard 10/10 tras adaptar los fixtures a la rama heredada.
- Express Node con perfil QA: arranque correcto y salud HTTP 200.
- workerd local mediante Wrangler: Express/salud 200, scrypt correcto e incorrecto,
  JWT con bigint/versión, contador compartido y lectura SQL de QA con BEGIN,
  contexto transaccional, advisory lock directo y ROLLBACK.
- El binding Hyperdrive se simula en desarrollo local mediante la URL QA directa.
  Esas pruebas NO atraviesan el servicio Hyperdrive remoto.
- No se han probado operaciones documentales o SíseVe HTTP completas en workerd
  ni se han ejecutado pruebas en la red real de Cloudflare.

El primer intento de Dashboard supuso una base vacía, pero QA heredaba el
Administrador original. La primera regresión administrativa supuso un único
Administrador, pero las suites ya habían creado otros. Se adaptó la preparación
de fixtures: conteos/incrementos contra una base previa y, para el último admin,
preparación únicamente dentro del rollback de QA. No se alteraron reglas de negocio.

### Criptografía y Workers Free

Workers Free tiene 10 ms de CPU por solicitud. Un benchmark Node local del
scrypt vigente registró 31–109 ms de CPU en cinco muestras; no es la medición
del servicio Cloudflare. La prueba workerd local tardó 169 ms observados en
generar un hash y comprobar dos contraseñas (147–169 ms en las repeticiones); es tiempo transcurrido, no CPU
facturada. No se puede afirmar que el flujo cumple el límite Free con esos datos.
La comprobación remota de CPU sigue pendiente. No se redujeron parámetros.
Si excede el límite real, las opciones incluyen Workers Paid con presupuesto
adecuado o conservar Express en un runtime Node capaz de ejecutar el scrypt
actual. La elección de conexión PostgreSQL no resuelve este límite.

## Hyperdrive QA

Configuración remota `documental-neon-qa` creada después de autorización explícita
para transmitir las credenciales QA a la API oficial de Cloudflare. Un GET posterior
verificó coincidencia del host QA, `neondb`, `sistema_web_app` y
`caching.disabled=true`. El binding real está en `wrangler.qa.jsonc`.
Hyperdrive utiliza TLS `require`, cuyo comportamiento documentado incluye
validación WebPKI. La URL directa QA conserva `verify-full`.
La propiedad TLS de la API pertenece a `mtls`, no a `origin`; el primer chequeo
estricto del script detectó esa diferencia y se corrigió. No se cargó una CA
personalizada ni se configuró mTLS de cliente.

Los advisory locks están documentados como no soportados por Hyperdrive.
La prueba de su funcionamiento mediante conexión directa no contradice esa
limitación. El recurso creado no implica que toda la aplicación sea compatible.

## Comandos disponibles (desde backend)

```powershell
npm run check:neon:qa
npm run dev:neon:qa
npm run build
npm run start:neon:qa
npm run worker:types
npm run worker:typecheck
npm run worker:dry-run
npm run worker:test
npm run hyperdrive:qa:check
```

`worker:dev` verifica QA y arranca Wrangler en loopback con el punto de entrada
cerrado; solo salud está habilitada. `worker:test` ejecuta un punto de entrada
de pruebas separado, exclusivamente local. No usar `workers/pruebas.ts` para
publicar. No se proporciona todavía un comando de publicación operativa:
primero decidir la alternativa del bloqueo, verificar los controles en runtime
y resolver el presupuesto de CPU.

La selección local y Neon principal conserva sus comandos anteriores. No se
modificó el frontend ni se configuraron Pages o R2. No se utilizó SDD.

En las repeticiones locales apareció un aviso del pool durante el ciclo de
conexión/cierre: TypeError sin código, clasificado como socket cerrado; no como
contexto de otra petición. Las consultas y aserciones respondieron correctamente,
pero queda pendiente resolver ese aviso antes de habilitar la API. No se presenta
como un arranque remoto verificado. El candidato local conserva salud 200 y
autenticación/SíseVe 503. Compilación, tipos de Workers y ESLint pasaron.

## Inventario de archivos de esta etapa

- `.gitignore`; `backend/package.json`; `backend/package-lock.json`.
- `backend/.env.neon.qa.example`; configuración privada `backend/.env.neon.qa`;
  privados `backend/.dev.vars` y `backend/.dev.vars.qa`.
- `backend/src/config/env.ts`, `database.ts`, `runtime.ts`.
- `backend/src/shared/security/rate-limit-store.ts`.
- `backend/src/modules/auth/auth.routes.ts`.
- `backend/src/modules/siseve/siseve.routes.ts`, `siseve.service.ts`.
- `backend/workers/index.ts`, `adapter.ts`, `rate-limiter.ts`, `pruebas.ts`.
- `backend/wrangler.qa.jsonc`, `wrangler.pruebas.jsonc`, `tsconfig.worker.json`.
- `backend/worker-configuration.d.ts` generado con Wrangler; `backend/eslint.config.js`.
- `backend/scripts/neon-qa-guard.mjs`, `verificar-neon-qa.mjs`,
  `probar-neon-qa.mjs`, `preparar-hyperdrive-qa.mjs`, `probar-workers.mjs`,
  `worker-dev-qa.mjs`.
- `backend/tests/flujo-migration-sandbox.mjs`, `admin-sandbox.mjs`,
  `flujo-migration.integration.mjs`, `dashboard.integration.mjs`,
  `documental-http-casos.mjs`.
- Este documento; evidencias y logs privados en `.private/workers/`.

La comprobación SHA-256 de `.env` y `.env.neon` confirmó ambos archivos intactos.
Una búsqueda de los secretos reales en código, scripts, configuraciones Wrangler,
manifiestos de dependencias, tipos generados y este documento no encontró copias.
El checkout no tiene un repositorio Git inicializado; no se realizó commit o push.

## Fuentes oficiales consultadas

- https://developers.cloudflare.com/workers/tutorials/deploy-an-express-app/
- https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-drivers-and-libraries/node-postgres/
- https://developers.cloudflare.com/hyperdrive/reference/supported-databases-and-features/
- https://developers.cloudflare.com/hyperdrive/concepts/connection-pooling/
- https://developers.cloudflare.com/hyperdrive/concepts/query-caching/
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/workers/runtime-apis/nodejs/crypto/
- https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/
- https://developers.cloudflare.com/api/resources/hyperdrive/subresources/configs/methods/create/
