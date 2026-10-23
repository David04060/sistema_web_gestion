# Operación Node.js + Render + Pages

Esta guía sustituye las instrucciones de ejecución Workers/Hyperdrive. Los
informes históricos no se borran; sus comandos Workers dejaron de estar disponibles.

## Backend y conexiones

Arquitectura conservada: Routes → Controllers → Services → Repositories → PostgreSQL.
Un único `pg.Pool` Node, máximo diez clientes, espera de conexión cinco segundos y
retiro de clientes inactivos treinta segundos. No hay adaptador, transporte ni
selección híbrida. Las unidades de trabajo adquieren `pool.connect()` y conservan
el cliente hasta COMMIT/ROLLBACK y release. Se preserva el AsyncLocalStorage de
SíseVe: es autorización de negocio, no infraestructura Workers.

Los advisory locks, SQL de correlativos, funciones, triggers y restricciones no
se modifican. El arranque verifica identidad antes de escuchar y las señales
SIGINT/SIGTERM cierran HTTP y el pool. Los errores no imprimen credenciales.

Perfiles desde backend:

| Destino | Comando | Configuración privada |
| --- | --- | --- |
| Local | npm start | .env |
| Neon principal | npm run start:neon | .env.neon; no usar para pruebas |
| Neon QA | npm run start:neon:qa | .env.neon.qa |
| Render QA | npm start | Variables del servicio; DB_PROFILE=neon-qa |

Render no carga archivos .env. DATABASE_URL requiere neondb, sistema_web_app,
host directo Neon y sslmode=verify-full. NEON_QA_HOST contrasta el host y
NEON_BRANCH_ID se contrasta con current_setting('neon.branch_id',true) antes de
escuchar. El modo Render rechaza perfiles distintos de QA en esta etapa.

## Servicio Render

Nombre solicitado: sistema-documental. Usar repositorio privado
David04060/sistema_web_gestion, rama main, rootDir backend, Node.js 24.21.0,
plan Free, build `npm ci --include=dev && npm run build`, inicio `npm start`,
health check `/api/health`. Render proporciona PORT; escucha en 0.0.0.0.
No configurar migraciones, bootstrap ni un comando predeploy de escritura.
render.yaml y backend/.env.render.example contienen solo referencias sin secretos.
Introducir exclusivamente credenciales QA en el panel de Render.

CORS_ORIGINS es una lista separada por comas de orígenes HTTPS completos, sin
rutas, comodines ni barra final. Registrar el origen real de Pages después de
crearlo; no dar por disponible un subdominio solicitado hasta que Cloudflare lo
confirme. Se admiten Authorization y Content-Type, sin cookies de sesión.
TRUST_PROXY_HOPS=1 confía solo en el proxy inmediato. Verificar en remoto que
el límite por IP no se pueda evadir añadiendo prefijos falsos a X-Forwarded-For.

## Limitadores

express-rate-limit usa su MemoryStore Node: login diez solicitudes por IP y
quince minutos; SíseVe diez fallos por cuenta y quince minutos, descontando
éxitos; cambio de clave SíseVe treinta solicitudes por cuenta y quince minutos.
passOnStoreError=false se conserva. No hay Durable Objects ni contadores propios.
Los contadores se pierden cuando Render suspende, reinicia o reemplaza el proceso;
no constituyen coordinación entre múltiples procesos. No escalar a múltiples
instancias sin acordar un almacén compartido adecuado.

Render Free suspende por inactividad y tiene arranque en frío. El navegador conserva
el timeout existente de quince segundos: una primera solicitud puede fallar mientras
el servicio despierta. La disponibilidad del plan gratuito no equivale a SLA.

## Frontend Pages

Nombre solicitado: sistema-documental-p. Build desde frontend: npm ci y npm run
build; salida dist. VITE_API_URL es exclusivamente el origen HTTPS real de Render,
sin /api ni barra final. Es público: no introducir JWT_SECRET ni DATABASE_URL en
variables VITE_. Vacío conserva el proxy Vite local y los contratos existentes.
Pages sirve el fallback SPA si no se publica un 404.html. No necesita Workers,
Functions, Hyperdrive ni un proxy para /api. Mantener pantallas y diseño.

## Verificación y publicación

Antes de subir: comprobar repositorio privado, exclusión de .env, .private,
respaldos, capturas e informes con datos; escanear los archivos preparados para
commit contra secretos reales actuales y antiguos. Nunca incluir volcados SQL
de datos. Conservar las evidencias históricas excluidas en disco.

Ejecutar tipos, ESLint, build y unitarias en ambos proyectos. Para escrituras QA,
usar exclusivamente `npm run test:neon:qa:documental`,
`npm run test:neon:qa:dashboard` y `node scripts/probar-api-node-qa.mjs`.
La guarda contrasta host y Branch ID. No crea ni elimina ramas o estructura SQL;
los fixtures y avances de secuencias quedan exclusivamente en QA.

Después de publicar: verificar HTTPS, salud, preflight CORS, protección JWT,
login/me con cuenta sintética, roles, límites y flujos de negocio sobre fixtures
QA. No copiar datos institucionales al navegador o al repositorio como evidencia.
Neon principal requiere autorización independiente; R2 no se configura en esta etapa.

Referencias oficiales:
- https://render.com/docs/web-services
- https://render.com/docs/node-version
- https://render.com/docs/free
- https://expressjs.com/en/guide/behind-proxies/
- https://developers.cloudflare.com/pages/configuration/serving-pages/
