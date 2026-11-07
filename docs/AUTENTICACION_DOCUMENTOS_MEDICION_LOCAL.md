# Autenticación de documentos y PDF

La revisión local partió de `e951399`. El router administrativo descartaba el prefijo documental. El router PDF autenticaba primero y, cuando no resolvía la ruta, el router documental autenticaba de nuevo. La prueba aislada reprodujo dos consultas para el listado. Una ruta PDF que sí coincidía ya hacía una sola consulta.

El [experimento regional del 5 de noviembre](EXPERIMENTO_REGIONAL_20261105.md), sobre `8863726`, registró 2 autenticaciones y 8 llamadas SQL para el listado. En Oregon–São Paulo las medianas fueron 1.583 ms desde el cliente, 1.386 ms en el backend, 1.383 ms acumulados en el driver y 347 ms de autenticación inclusiva. Los planes probados ejecutaron en menos de 0,8 ms y el `SELECT 1` del driver tuvo una mediana de 172,63 ms en ese trayecto. El ensayo atribuyó la mayor parte del tiempo interno a los viajes SQL y midió una mejora regional de aproximadamente 32–33 % en las cuatro API calientes al comparar Render en Virginia con Render en Oregon, con Neon en São Paulo en ambos casos. Esa comparación geográfica es independiente de esta corrección local.

## Archivos

- `backend/src/app.ts` aplica la autenticación y luego `Cache-Control: no-store, private` una sola vez, antes de los dos routers y conservando su orden.
- `backend/src/modules/documentos/documentos.routes.ts` y `backend/src/modules/documentos-pdf/pdf.routes.ts` retiran las dos copias del middleware. Conservan los manejadores y sus validaciones.
- `backend/tests/autenticacion-documentos.test.mjs` prueba HTTP con JWT, SQL real y fixtures aislados. `backend/tests/helpers/suites.mjs` incorpora la regresión a la suite completa y permite medirla por separado.

La comprobación transaccional de actividad, rol y ámbito sigue en `actorActual`. Un JWT con versión revocada llega a la consulta de identidad y recibe 401. Un JWT inválido o ausente se rechaza antes de consultar SQL. Las rutas sin coincidencia siguen pasando por autenticación antes del 404. El esquema vigente no monta el router histórico SíseVe y la suite completa verifica que su ruta retirada sigue devolviendo 404. El cambio se limita a la composición HTTP y no modifica predicados ni repositorios.

## Medición local

Dos ejecuciones secuenciales en la misma máquina, con Node 24.21.0, PostgreSQL 18 efímero en loopback, el mismo esquema, seis cuentas y seis documentos sintéticos, base de IDs 4100 y el mismo rol Dirección. Cada serie usó 15 peticiones de calentamiento excluidas y 120 GET sin filtros, todas 200, con el mismo arnés. La API se mide desde `fetch` hasta terminar de leer y decodificar el JSON. El driver se mide desde la llamada a `Client.query` hasta su resolución o callback, incluyendo ida y vuelta local y esperas. Las transacciones y la autorización se cuentan en SQL total. La autenticación SQL se identifica por la consulta de usuario por ID que lee la versión del JWT. Los tiempos de autenticación están incluidos en SQL total.

| Métrica | Antes, mediana / p95 | Después, mediana / p95 | Reducción de la mediana |
| --- | ---: | ---: | ---: |
| Consultas de autenticación | 2 / 2 | 1 / 1 | 1 consulta (50 %) |
| Llamadas SQL totales | 8 / 8 | 7 / 7 | 1 llamada (12,5 %) |
| SQL de autenticación | 1,363 / 2,567 ms | 0,832 / 1,109 ms | 0,530 ms (38,9 %) |
| SQL total en driver | 4,076 / 6,006 ms | 3,906 / 4,924 ms | 0,170 ms (4,2 %) |
| API completa desde cliente | 6,352 / 8,571 ms | 5,798 / 7,003 ms | 0,554 ms (8,7 %) |

Las diferencias se calculan antes de redondear. El p95 usa rango más próximo. La eliminación de una llamada de autenticación fue constante en la muestra. Las diferencias de tiempo son observaciones de una serie por versión, con variación entre ejecuciones y sin estimación estadística de incertidumbre. Las medianas de componentes no son aditivas. Loopback no reproduce la red regional, la carga concurrente, el volumen productivo ni la latencia de R2. Las pruebas de PDF cubren metadatos y permisos con PostgreSQL aislado, además de almacenamiento simulado en las suites existentes.

Para repetir cada serie desde `backend`, compilar la variante correspondiente con `npm run build` y ejecutar `node scripts/probar-backend-aislado.mjs auth-documentos` con `POSTGRES_TEST_BIN` apuntando al directorio binario de PostgreSQL 18, `POSTGRES_TEST_ID_BASE=4100` y `MEDIR_AUTH_DOCUMENTOS=1`. La prueba anterior al cambio debe fallar por la consulta adicional después de emitir las métricas.

## Verificación

- Regresión focalizada. Falló antes con dos consultas donde se esperaba una y pasó después. Cubre los cinco roles, un segundo usuario de ámbito ajeno, listado, filtro de anulados, detalle, PDF, 400, 401 y 404, y el encabezado de caché.
- Suite completa local, 67/67. Suite de revisión local, 39/39. Compilación y lint correctos.
