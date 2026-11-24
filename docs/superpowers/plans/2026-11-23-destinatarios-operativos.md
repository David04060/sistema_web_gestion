# Destinatarios operativos y oficina de delegación

**Objetivo:** ejecutar la mejora y publicación autorizadas en la solicitud del 23 de noviembre, en el repositorio y base habituales.

**Diseño:** consultar `roles.codigo` en la búsqueda y validación transaccional compartida de delegación. Excluir `ADMINISTRADOR` y `SUPERADMINISTRADOR` antes de paginar. En `DestinoDocumental`, excluir únicamente la oficina de la sesión del selector específico. No cambiar administración, históricos, permisos, relevo ni esquema.

- [ ] Añadir regresiones HTTP sobre la base local existente: búsquedas vacías, texto, oficinas, tres roles operativos y administración; delegación directa e inmediata rechazada para administrativos y aceptada para personal/manual, con rollback.
- [ ] Reproducir el fallo y corregir `documentos.operaciones.ts`; comprobar selectores de personal existentes sin alterar consultas administrativas.
- [ ] Corregir `DestinoDocumental.tsx` y comprobar interacción para Dirección, Secretaría y Usuario, conservando Todas las oficinas y oficinas activas ajenas.
- [ ] Ejecutar pruebas pertinentes sin el runner que crea clústeres, typecheck, lint y builds de ambos componentes. Verificar restauración local.
- [ ] Revisar diff, publicar solo archivos de esta mejora en GitHub main, desplegar Render y Pages con configuración vigente.
- [ ] Verificar commit activo, salud, login y selectores en dominio principal; documentar resultados e incidencias.
