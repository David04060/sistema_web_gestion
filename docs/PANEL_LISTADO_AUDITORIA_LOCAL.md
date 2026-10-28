# Listado, cuadros destacados y auditoría — entorno local

Proyecto Sistema_Web_Final; base sistema_web_final, localhost:5432, esquema public.
No hubo migraciones ni cambios de esquema para esta entrega. No se crearon copias ni bases QA.

## Cambios

- Listado: se oculta circulación y sus estados anteriores. La situación actual y la clasificación
  recibido/emitido se conservan. Los enlaces antiguos con estado no restringen silenciosamente
  la consulta del listado. La API histórica conserva su contrato.
- Actualizar listado consulta de nuevo página y opciones usando el hook existente; no recarga
  la página completa. Mantiene filtros/paginación y los resultados ordinarios durante la consulta.
- Cada fila tiene Ver detalle, además del enlace por código.
- Dirección: cuadro destacado de registros activos de Secretaría con PENDIENTE_DECISION.
- Secretaría: cuadro destacado de sus registros activos DELEGADO pendientes de confirmar entrega.
- Los totales se calculan en SQL y las listas se limitan a ocho documentos. Ver todos conserva
  el filtro de situación cuando el total supera los ocho elementos. Las intervenciones existentes
  también usan el estado vigente y excluyen recorridos ya entregados o guardados.
- La auditoría devuelve campos_presentacion con nombres, oficinas, tipos y ubicaciones resueltos
  únicamente para las referencias del historial autorizado. campos_modificados permanece intacto.
  La vista presenta cuadros con acción, persona, fecha y valores antes/después.
- Los movimientos conservan los ID internos necesarios para los contratos, pero la presentación
  muestra nombres de registrador, Dirección, traslado, recepción, rechazo, recuperación y cancelación.
  El detalle separa participantes y acciones/fechas; se mejoran los enlaces documento/recorrido.

No se amplían permisos ni se crea un sistema para concederlos. Dirección y Secretaría comparten
la consulta aprobada entre ambas y no acceden a registros personales del Usuario. Se conservan
las puertas adicionales de SíseVe, el motivo obligatorio y el flujo/relaciones existentes.

## Verificación ejecutada

- npm run test:panel-listado:local: 39 solicitudes HTTP por localhost:5173, contra el backend real.
- Usuario, Secretaría y Dirección registraron recibido y emitido: seis documentos locales, IDs 30–35,
  códigos INF2026009–INF2026014. Administrador conserva su restricción de registro documental.
- API directa, búsqueda y totales: registros personales del Usuario bloqueados para ambos perfiles.
- Los cuadros se compararon con SQL: Dirección solo pendientes de decisión de Secretaría;
  Secretaría solo sus delegados. Una delegación sale del cuadro de Dirección, entra en Secretaría
  y desaparece al confirmar entrega; la doble confirmación se rechaza.
- Corrección/anulación sin motivo: 400. Auditoría y movimientos devuelven nombres.
- Se compararon los registros anteriores de documentos, historial, recorridos, entregas y relaciones;
  quedaron sin modificaciones. Los nuevos documentos son comprobaciones locales, sin importar QA.
- Backend 36/36; frontend 53/53; typecheck/lint y compilación frontend correctos.
- Revisión visual con sesiones reales de Secretaría y Dirección a 1440x1000 y 390x844.
- Actualización en navegador: antes se veía ACT2026011; tras registrar por API y pulsar Actualizar
  apareció INF2026014. Se conservó el texto sin enviar del buscador, demostrando que no se recargó
  toda la página. Circulación no aparece; Ver detalle está disponible por fila.
- Auditoría del FUT2026001 y movimiento 1: participantes por nombre, acciones y fechas conservadas,
  cuadros alineados en escritorio y móvil. Las pantallas móviles verificadas no desbordaron la página.

Evidencias locales en docs/evidencias-panel-listado/; se excluyen de Git.

## Cómo probar

Backend: Set-Location C:\Users\David\Sistema_Web_Final\backend; npm run dev

Frontend: Set-Location C:\Users\David\Sistema_Web_Final\frontend; npm run dev

Abrir http://localhost:5173. Dirección ve su cuadro y puede abrir un pendiente para decidir.
Secretaría ve delegados pendientes y puede abrirlos para confirmar. En Documentos, usar Actualizar
listado y Ver detalle. En un documento anterior, expandir Antecedentes y auditoría de datos o abrir
Consultar movimientos anteriores y luego el detalle del movimiento.

El comando de prueba local crea seis documentos de comprobación; no es necesario ejecutarlo
para arrancar el proyecto. No se añadieron dependencias ni se hizo commit, push o despliegue.
