# Retirada de Workers y preparación Render

Se revisaron los informes WORKERS_NEON_QA, INTEGRACION_HIBRIDA_NEON_WORKERS y MEDICION_CPU_CLOUDFLARE y se guardó una copia privada anterior. No se usaron git reset ni git clean.

## Archivos exclusivos retirados

- backend/src/config/runtime.ts
- backend/src/shared/security/rate-limit-store.ts
- backend/worker-configuration.d.ts
- backend/tsconfig.worker.json
- backend/wrangler.qa.jsonc
- backend/wrangler.pruebas.jsonc
- backend/wrangler.pruebas-segunda.jsonc
- backend/wrangler.cpu-qa.jsonc
- backend/workers/adapter.ts
- backend/workers/cpu-probe.ts
- backend/workers/index.ts
- backend/workers/pg-client.ts
- backend/workers/pg-socket.ts
- backend/workers/postgres.ts
- backend/workers/pruebas.ts
- backend/workers/rate-limiter-pruebas.ts
- backend/workers/rate-limiter.ts
- backend/scripts/worker-dev-qa.mjs
- backend/scripts/probar-workers.mjs
- backend/scripts/probar-hibrido.mjs
- backend/scripts/probar-cpu-probe.mjs
- backend/scripts/preparar-hyperdrive-qa.mjs
- backend/scripts/medir-cpu-remota.mjs
- backend/scripts/capturar-http-qa.mjs
- backend/.dev.vars y backend/.dev.vars.qa: archivos privados exclusivos del runtime retirado, conservados en la copia privada.
- backend/.wrangler: caché generado, retirado tras verificar su ruta.

## Restauración y conservación

- database.ts: un pg.Pool Node directo; sin Proxy, pool por petición ni selector híbrido.
- Unidades administrativas, documentales y de ubicaciones: pool.connect y callback original; SQL, locks y actor sin cambios.
- auth.routes.ts y siseve.routes.ts: MemoryStore estándar, límites y fallo cerrado conservados.
- AsyncLocalStorage de shared/documental/contexto.ts conservado por ser la autorización transaccional de SíseVe.
- Perfiles local, Neon principal y QA, TLS verify-full, JWT, scrypt, Dashboard y cinco estados conservados.
- probar-api-hibrida.mjs se adaptó a probar-api-node-qa.mjs: HTTP Express, sin diagnósticos DO ni segunda instancia Workers.
- QA_HTTP_BASE permanece como herramienta HTTP local genérica de las suites; la guarda rechaza destinos remotos heredados.
- Suites persistentes filtran por tipo/documento en la prueba de confidencialidad para no exigir que otros fixtures desaparezcan.
- Comparaciones de URLs privadas en guardas usan mensajes sin valores para evitar incluir credenciales en errores de aserción.

## Dependencias y despliegue

Se retiró Wrangler como dependencia del backend y sus scripts worker:/hyperdrive:. Se conservó pg 8.23.1; sus dependencias transitivas internas no se borran manualmente. Wrangler puede usarse temporalmente mediante npx para publicar Pages sin incorporarlo al backend.

Node 24.21.0, PORT del servicio, escucha 0.0.0.0, CORS exacto y proxy inmediato configurable. render.yaml declara solo el servicio QA Free. No hay bootstrap ni migraciones de arranque.

El cambio autorizado del frontend se limita a VITE_API_URL en el cliente HTTP y una plantilla pública sin secretos. No se cambian pantallas, estilos ni contratos.

Los informes y capturas históricas permanecen en disco; Git excluye datos privados, entornos, respaldos y evidencias con contenido. La antigua plantilla QA con credenciales se sustituyó por marcadores.

Consultar DESPLIEGUE_RENDER_PAGES.md y el informe final de esta etapa para los resultados verificados y el estado de publicación.
