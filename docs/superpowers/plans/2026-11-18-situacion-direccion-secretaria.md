# Situación de Dirección y Secretaría

- [x] Verificar versiones activas, árbol de trabajo y destino PostgreSQL local.
- [x] Rastrear el alta, la proyección común y la anulación; reproducir los dos errores.
- [x] Conservar la situación institucional para ambos perfiles en la proyección común. Mantener lectura, delegaciones y situaciones personales.
- [x] Restringir anulación de Secretaría cuando el estado o la delegación ya registran una decisión de Dirección. Proteger la misma transición en SQL sin modificar el historial ni los permisos de corrección.
- [x] Validar en la base existente con rollback, comprobar las superficies HTTP y visuales y ejecutar las comprobaciones sin crear otro clúster. Los dos estados sin filas vigentes locales se comprueban dentro de una transacción.
- [ ] Publicar únicamente después de completar las pruebas locales. Verificar el destino de la migración, los commits activos y las tres vistas de producción con sesiones autorizadas.
