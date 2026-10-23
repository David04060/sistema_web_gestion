# Medición remota criptográfica — 23 de octubre de 2026

Se publicó exclusivamente `documental-cpu-probe` con `nodejs_compat`, fecha de
compatibilidad 2026-10-23, observabilidad al 100 %, sin previews y con un único
binding `CPU_PROBE_TOKEN` de tipo Cloudflare Secret. No se desplegó la API.
No hubo bindings ni conexiones a PostgreSQL, Neon, Hyperdrive, R2 o Durable Objects.

Se reutilizaron directamente `generarHash`, `verificarContrasena` y los helpers
JWT del backend. Parámetros scrypt sin cambios: N=16384, r=8, p=1, salida 64 bytes,
sal 16 bytes, maxmem 32 MiB. Solo se emplearon vectores sintéticos públicos.

## Resultados reales de Cloudflare

Se ejecutaron 28 solicitudes secuenciales entre 17:57:54 y 17:58:01 UTC.
Las veinte solicitudes funcionales devolvieron 200 y `ok:true`: cuatro health,
cuatro JWT, cuatro generación scrypt, cuatro verificaciones con contraseña
incorrecta y cuatro verificaciones correctas.
Dos accesos sin secreto válido dieron 403; cinco rutas de negocio dieron 404;
un método incorrecto dio 405. Cero errores HTTP 5xx o cuerpos de error 1102.

La captura tail conservó 22 eventos de las 28 solicitudes; los seis eventos
finales no llegaron antes de cerrar la observación. No se inventan sus CPU.
El script ahora espera 20 segundos para futuras capturas, sin repetir esta tanda.

CPU por solicitud capturada, en milisegundos, directamente del campo cpuTime:

| Operación HTTP 200 | CPU capturadas (ms) |
| --- | --- |
| Health | 3, 0, 0 |
| JWT (firma y verificación) | 5, 9, 1 |
| Generar hash scrypt | 68, 45, 67 |
| Verificar contraseña incorrecta | 48, 96, 42 |
| Verificar contraseña correcta | 56, 54 |

Los ocho eventos de control restantes tuvieron CPU de 4, 1, 0, 0, 0, 0, 1 y 0 ms.
Los ceros son la resolución reportada, no ausencia matemática de trabajo.

GraphQL Analytics contabilizó las 28 solicitudes, todas con estado success,
errores=0 y subrequests=0. Los percentiles están en microsegundos y agrupados
por segundo, no por ruta: no se convierten en mediciones individuales inventadas.
P99 máximo de esos grupos: 96076 microsegundos (96,076 ms).
No se observaron excepciones ni outcomes de agotamiento en los 22 eventos tail.

## Plan, límite y conclusión

La API de configuración confirmó usage_model=standard, sin límites CPU personalizados.
Esto no acredita el plan comercial. La consulta de suscripciones devolvió HTTP403
por permisos insuficientes de OAuth; no se pudo certificar por API que esta cuenta
esté en Workers Free. No se activó ni modificó ninguna suscripción de pago.

Comparadas con el presupuesto documentado Free de 10 ms, las ocho operaciones
scrypt capturadas consumieron 42–96 ms (4,2–9,6 veces el presupuesto).
La finalización HTTP200 no demuestra adecuación al límite: Cloudflare documenta
tolerancia para excesos ocasionales. No se provocó una prueba de agotamiento
deliberado ni se realizó una prueba de carga sostenida.

Conclusión: compatibilidad funcional demostrada de los helpers, pero scrypt con
los parámetros actuales excede el presupuesto Free. No publicar la API en Free.
Alternativas: evaluar Workers Paid con presupuesto adecuado y pruebas QA completas,
o alojar el backend en un runtime Node con recursos suficientes. Conservar parámetros
criptográficos, auditoría y toda la lógica de seguridad en ambas alternativas.

La referencia Node local anterior (~37,6 ms por scrypt) es independiente; los
valores de esta tabla sí proceden del servicio remoto Cloudflare.

## Retirada y evidencia

Se eliminó el Worker mediante API: HTTP200, success=true. La lectura posterior de
settings devolvió HTTP404, confirmando ausencia del recurso y de su secreto activo.
La API documental permanece sin publicar. Ninguna base de datos fue utilizada.

Evidencia sanitizada: `RESULTADOS_CPU_CLOUDFLARE.json`. No contiene cabeceras,
secreto, cuerpos de solicitud ni datos institucionales. Tipos Workers, lint y
prueba local del candidato se comprobaron; no se añadieron dependencias.

Referencias oficiales:
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/analytics/graphql-api/tutorials/querying-workers-metrics/
