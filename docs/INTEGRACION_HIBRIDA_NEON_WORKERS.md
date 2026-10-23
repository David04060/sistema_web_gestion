# Integración híbrida Neon QA + Workers

> HISTÓRICO: esta implementación se retiró al elegir Node.js y Express en Render.
> Consultar [DESPLIEGUE_RENDER_PAGES.md](DESPLIEGUE_RENDER_PAGES.md) para operar el sistema.

Fecha: 23 de octubre de 2026. Esta etapa implementa la alternativa 2 aprobada.
La API no se ha publicado. No se conectó Workers a Neon principal ni se cambió
la estructura PostgreSQL. Las pruebas usaron exclusivamente `qa-pruebas`.

## Selección de conexiones

| Operación | Conexión en Workers |
| --- | --- |
| Consultas compatibles, autenticación y catálogos | Binding `HYPERDRIVE`, caché SQL desactivada |
| Dashboard y su instantánea de lectura | Cliente compatible, conservado durante su transacción |
| Escritura administrativa | Cliente directo, obtenido por `abrirTransaccion()` |
| Escritura documental y operaciones SíseVe | El mismo cliente directo durante toda la unidad de trabajo |
| Escritura de estantes y archivadores | Cliente directo |

`conClienteTransaccional()` mantiene también las consultas indirectas del
callback en el cliente directo mediante AsyncLocalStorage. No se divide una
transacción entre las dos vías. Se conservan BEGIN, advisory lock, permisos,
set_config(...,true), funciones, triggers y COMMIT/ROLLBACK. SíseVe conserva
su contexto restringido y reutiliza ese mismo cliente.

Los tres advisory locks originales permanecen sin cambios. No se modificó el
generador SQL de códigos ni su INSERT ... ON CONFLICT DO UPDATE. Tampoco se
duplicaron servicios, controladores o repositorios.

En Node, `abrirTransaccion()` usa el pool local existente y el contexto adicional
es un passthrough. Permanecen los perfiles `.env`, `.env.neon` y `.env.neon.qa`.

## Configuración privada

| Binding/secret | Uso |
| --- | --- |
| `HYPERDRIVE` | Configuración remota QA existente, verificada mediante API Cloudflare |
| `NEON_QA_DIRECT_URL` | URL directa QA, usuario sistema_web_app, neondb, verify-full |
| `NEON_QA_HOST` | Host QA esperado, contrastado con la URL directa |
| `NEON_QA_BRANCH_ID` | Branch ID esperado, contrastado con PostgreSQL en cada conexión nueva |
| `JWT_SECRET` | Firma y verificación JWT del perfil QA |
| `RATE_LIMIT_SECRET` | HMAC de las claves de los contadores; mantener estable entre versiones |

La comprobación de cada conexión consulta base, usuario y
current_setting('neon.branch_id',true) antes de entregar el cliente a los
repositorios. Una identidad diferente falla sin ejecutar consultas de negocio.
No hay fallback hacia Neon principal o PostgreSQL local.

Los archivos `.dev.vars` y `.dev.vars.qa` contienen las variables privadas
locales. Sus valores no están en las configuraciones Wrangler versionables.
Una rotación de RATE_LIMIT_SECRET cambiaría las identidades de los contadores;
no regenerarlo automáticamente al publicar.

## Corrección del ciclo de vida PostgreSQL

Se reprodujo el TypeError de cierre en el lector `_listen` de
pg-cloudflare 1.4.1. Su cierre completo del socket invalidaba el lector pendiente.
Se comprobó que pg 8.23.1 y pg-cloudflare 1.4.1 eran las versiones actuales.

`workers/pg-socket.ts` inyecta el transporte por la opción `stream` de pg:
utiliza cloudflare:sockets, envía FIN, espera EOF del lector y después cierra el
socket. No modifica node_modules, no elimina listeners de error ni filtra los
errores por encontrarse en fase de cierre. TLS utiliza el hostname original y
rechaza desactivar la validación del certificado.

`PostgresSolicitud` administra un cliente serializado por vía y petición.
No utiliza Pool con temporizadores de inactividad ni sockets globales. Un
cliente transaccional permanece alquilado hasta release(). El cierre se espera
antes de devolver la respuesta y detecta clientes no liberados. El adaptador
consume la respuesta Express y espera también operaciones pendientes del store.
Los fallos de transporte se registran con tipo/código, sin el mensaje privado.

No se reintentan sentencias SQL. Una desconexión produce error; otra solicitud
crea y verifica un cliente nuevo. La prueba de desconexión termina únicamente
su propia sesión QA mediante pg_terminate_backend(pg_backend_pid()). Respondió
500 y la siguiente solicitud respondió 200; es un fallo provocado y esperado.

Hay como máximo dos conexiones por petición: una compatible y una directa.
Se probaron cuatro solicitudes SQL concurrentes y la generación de doce códigos
en sesiones PostgreSQL independientes. La inspección final encontró cero
sesiones con los application_name de este runtime tras cerrar las pruebas.

PostgreSQL QA informó max_connections=901 y rolconnlimit=-1. Son valores del
compute observado, no una garantía de capacidad del plan ni un límite global
implementado entre todos los Workers. El tamaño del compute determina la
capacidad Neon; deben medirse los picos previstos antes de publicar.

## Limitadores compartidos

| Ámbito | Límite conservado |
| --- | --- |
| Login | 10 solicitudes por IP en 15 minutos |
| Operación SíseVe | 10 fallos por cuenta en 15 minutos; éxitos no consumen el contador |
| Cambio de clave SíseVe | 30 solicitudes por cuenta en 15 minutos |

Workers usa Durable Objects con almacenamiento SQLite, configurados mediante
new_sqlite_classes. Estas son migraciones del recurso Cloudflare, no DDL de
PostgreSQL. Node conserva el MemoryStore anterior.

El objeto guarda únicamente totalHits y fin. La identidad es un HMAC con secreto
independiente, ámbito y clave; no se envían contraseñas, JWT, contenido documental
o claves SíseVe al objeto. Incremento y limpieza por alarma son transaccionales.
El decremento de una respuesta exitosa exige la misma ventana que su incremento,
para no descontar solicitudes de una ventana posterior.

passOnStoreError=false conserva el fallo cerrado. Una respuesta inválida,
indisponibilidad o timeout no permite acceder al controlador. El timeout de
infraestructura es de 15 segundos; no cambia la ventana o cantidad de intentos.
Las respuestas lentas superiores a cinco segundos se registran sin identidades.
Se comprobaron expresamente dos rechazos HTTP 500 cuando falló el almacén.

Los dos procesos locales usan directorios de persistencia separados. B accede
al objeto de A mediante binding; no abren el mismo archivo SQLite. Un sondeo
aislado de contador espera que el registro de wrangler dev esté listo; nunca
repite operaciones de negocio.

## Resultados verificados

| Verificación | Resultado |
| --- | --- |
| npm test, Node con repositorios simulados y contratos | 27/27 |
| Suite documental, HTTP workerd local + fixtures SQL QA | 35/35 |
| Regresiones Node adicionales dentro de QA | Administración 14/14, catálogos 14/14, consultas 5/5 |
| Dashboard mediante HTTP workerd local | 10/10 |
| Administración HTTP, sesión, ubicaciones, auditoría y límites | Ocho grupos aprobados |
| Dos instancias, contador compartido | Veinte incrementos concurrentes únicos |
| Persistencia SQLite tras reiniciar los dos procesos | Contador continuó en 21 |
| Expiración y alarma de una ventana vigente | Ventana renovada; contador vigente conservado |
| Operaciones SíseVe exitosas | Quince éxitos; contador de fallos igual a cero |
| Aislamiento de cuentas y límite administrativo | 10 fallos/429 y 30 solicitudes/429, con cuenta independiente operativa |
| Revocación de sesión | Contraseña, desactivación y reactivación no reviven JWT anteriores |
| TypeScript, build, ESLint y paquetes Wrangler dry-run | Aprobados |
| Funciones, triggers y restricciones PostgreSQL | Huella SHA-256 final igual a la inicial |
| Estados documentales fuera de los cinco aprobados | Cero |
| Sesiones PostgreSQL residuales del runtime | Cero |
| .env y .env.neon | SHA-256 sin cambios |

Se mantienen exclusivamente PENDIENTE_DECISION, EN_TRASLADO, RECIBIDO,
RECHAZADO y CANCELADO. La suite cubre decisiones, salida, recepción, rechazo,
recuperación, cancelación, auditoría, códigos y confidencialidad SíseVe.

Las pruebas locales simulan el binding Hyperdrive con una URL directa QA.
Demuestran el enrutamiento entre dos clientes distintos, pero NO prueban el
servicio Hyperdrive en la red de Cloudflare. El recurso real se comprobó por
API: mismo origen QA y caching.disabled=true. Sus transacciones compatibles,
latencia y recuperación remotas siguen pendientes.

Los fixtures, cuentas y clave de prueba SíseVe quedan en QA. No se limpió la
rama ni se copiaron esos cambios a Neon principal. Los fallos de desarrollo
anteriores incluyeron reinicios al editar durante una suite, colisión de archivos
SQLite entre procesos y un verificador que asumía JSON para el 429 de texto
administrativo. Se corrigieron los verificadores sin cambiar ese contrato.

Evidencias sin contenido institucional en `.private/workers/`:
RESULTADOS_HIBRIDO_DOCUMENTAL.json, workerd-dashboard.integration.mjs.log,
RESULTADOS_API_HIBRIDA.json, RESULTADOS_HIBRIDO.json,
VERIFICACION_HIBRIDA_FINAL.json y CPU_NODE_REFERENCIA.json.

## Workers Free y medición remota pendiente

La compatibilidad funcional local de scrypt, JWT, Express, middlewares y pg está
comprobada. No se han reducido N=16384,r=8,p=1, longitud 64 o maxmem de scrypt.

La referencia Node local midió 188 ms de CPU para cinco generaciones y 188 ms
para cinco verificaciones: aproximadamente 37,6 ms por operación. Cien
verificaciones JWT consumieron 15 ms de CPU total. Estos datos NO miden la CPU
del servicio Cloudflare. Tampoco el tiempo transcurrido de los probes workerd
se presenta como CPU remota.

Workers Free dispone de 10 ms de CPU por solicitud. El consumo real de login,
operaciones SíseVe, middleware y concurrencia requiere medición remota. No se
certifica que Free sea suficiente. Si scrypt excede ese presupuesto, detener
esa etapa y elegir Workers Paid con presupuesto adecuado o un runtime Node para
Express, conservando los parámetros criptográficos. No cambiar de plan automáticamente.

## Candidato aislado para medir CPU; NO publicado

`workers/cpu-probe.ts` y `wrangler.cpu-qa.jsonc` preparan documental-cpu-qa.
No tiene binding PostgreSQL, Hyperdrive o R2, ni rutas de autenticación o SíseVe.
Solo ejecuta fixtures criptográficos con las funciones existentes y requiere
x-qa-probe-token en todas sus rutas. Sin configuración responde 503; sin secreto
correcto responde 403. Las rutas de negocio responden 404 incluso con el secreto.
No devuelve hashes ni tokens JWT. La clave privada está excluida de Git.

Su protección y operaciones pasaron en workerd local y su dry-run compiló.
No se ejecutaron los siguientes comandos de publicación; necesitan autorización:

```powershell
# Desde backend, únicamente después de autorización explícita.
npx wrangler deploy --config wrangler.cpu-qa.jsonc
npx wrangler secret bulk ..\.private\workers\cpu-probe-secret.json --config wrangler.cpu-qa.jsonc
```

La primera versión permanece cerrada con 503 hasta cargar el secreto. Luego
medir por separado /health, /scrypt/generar, /scrypt/verificar y /jwt y obtener
CPU real desde métricas/logs de invocación Cloudflare. No pegar el secreto en
terminales, URLs o chat. Un HTTP 200 aislado no certifica rendimiento sostenido;
revisar CPU y outcomes de varias muestras. Si aparece exceso de CPU, no continuar
con la API documental hasta decidir el runtime/plan.

La prueba remota posterior de la integración completa requiere otra versión QA
protegida, cargar exclusivamente secretos QA, mantener caché Hyperdrive desactivada
y verificar nuevamente ambas identidades y controles. El punto de entrada actual
de la API sigue respondiendo 503 fuera de salud. No se solicita ni prepara una
conexión Workers a Neon principal.

## Archivos de esta etapa

- backend/src/config/database.ts y runtime.ts: fachada y contexto de conexión.
- backend/src/shared/admin/admin.repository.ts y shared/documental/transaccion.ts:
  selección del cliente al iniciar la unidad de trabajo.
- backend/src/modules/ubicaciones/ubicaciones.service.ts: misma selección.
- backend/src/modules/auth/auth.routes.ts, modules/siseve/siseve.routes.ts y
  shared/security/rate-limit-store.ts: store compartido, IP y seguimiento de promesas.
- backend/workers/adapter.ts, postgres.ts, pg-client.ts, pg-socket.ts, index.ts:
  infraestructura y ciclo de vida Workers.
- backend/workers/rate-limiter.ts: almacenamiento y alarmas atómicos.
- backend/workers/pruebas.ts, rate-limiter-pruebas.ts: herramientas exclusivamente locales.
- backend/workers/cpu-probe.ts y wrangler.cpu-qa.jsonc: candidato protegido sin base de datos.
- backend/wrangler.pruebas-segunda.jsonc: segunda instancia con binding compartido.
- backend/scripts/probar-hibrido.mjs, probar-api-hibrida.mjs, probar-cpu-probe.mjs,
  capturar-http-qa.mjs y probar-neon-qa.mjs: verificaciones y metadatos sin cuerpos privados.
- backend/tests/dashboard.integration.mjs y flujo-migration.integration.mjs:
  destino HTTP externo local y evidencia separada por runtime.
- backend/package.json y package-lock.json: comandos y fijación de pg 8.23.1,
  sin instalar nuevas dependencias o actualizar el driver.
- backend/worker-configuration.d.ts: tipos regenerados.
- backend/.dev.vars y .dev.vars.qa: variables privadas de las dos conexiones.
- Este documento y nota de continuidad en WORKERS_NEON_QA.md.

## Comandos locales

```powershell
npm test
npm run typecheck
npm run worker:types
npm run worker:typecheck
npm run lint
npm run build
npm run worker:test:hybrid
npm run worker:test:hybrid:full
npm run worker:test:cpu-probe
npm run worker:dry-run
npm run worker:cpu:dry-run
npm run hyperdrive:qa:check
```

## Referencias oficiales

- https://developers.cloudflare.com/workers/runtime-apis/tcp-sockets/
- https://developers.cloudflare.com/hyperdrive/reference/supported-databases-and-features/
- https://developers.cloudflare.com/hyperdrive/concepts/connection-lifecycle/
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/workers/observability/metrics-and-analytics/
- https://neon.com/docs/manage/endpoints/
