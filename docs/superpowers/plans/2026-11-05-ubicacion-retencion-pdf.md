# Ubicación, delegación y retención PDF — plan de ejecución

Objetivo autorizado: cambiar el texto de ubicación según la ubicación vigente; conservar el trigger de delegación si supera la matriz de roles; conservar PDF anulado 14 días completos y eliminar únicamente el objeto mediante reintentos verificables.

1. Añadir pruebas aisladas para Dirección, Secretaría y Usuario con/sin ubicación; comprobar negativas de los cinco roles y auditoría. Cambiar solo el summary de AccionesDocumento según documento.ubicacion.
2. Crear migración 007: cola de retención con identidad exacta del PDF, fecha de anulación obtenida de auditoría y vencimiento + interval '14 days'; trigger transaccional y recuperación de anulados históricos con fecha verificable. Permisos mínimos y finalización SQL acotada, sin borrar documento/historia.
3. Añadir recolector de retenciones al mantenimiento existente: documento primero, SKIP LOCKED, borrar clave vinculada, comprobar ausencia por HEAD; después finalizar metadatos/auditoría. Ante fallo, conservar vínculo y reintento durable. Probar límite temporal, fallos de DELETE/HEAD y fallo de commit con objeto ya ausente.
4. Programar activación horaria mediante workflow que solicita únicamente /api/health. El backend revisa al arrancar y cada cinco minutos activo. No usar lifecycle por edad de creación, que no conoce la anulación. No añadir UI para retención: Superadministrador conserva consulta PDF existente.
5. Ejecutar suites y estáticos; respaldo productivo verificado, preflight de identidad/funciones/anulados y migración; publicar commit acotado en servicio/región vigentes y Pages. Verificar salud, versión, esquema, permisos y consultas sin mutaciones productivas ni vencimientos artificiales. Documentar límites del cron y resultado por entorno.

Decisiones de implementación: tabla durable separada del PDF; hora PostgreSQL; eliminación no antes del vencimiento, ejecución en la siguiente revisión disponible. GitHub schedule puede retrasarse; no se promete borrado al segundo exacto. Sin nuevas dependencias, cambios de región, lifecycle de PDF vigentes ni datos productivos de prueba.
