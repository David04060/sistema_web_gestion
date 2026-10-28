# Documentos relacionados y consulta recíproca — 27/10/2026

Entorno: proyecto Sistema_Web_Final, base sistema_web_final en localhost:5432, esquema public.
Frontend habitual localhost:5173 y proxy a 127.0.0.1:3000. Sin copias ni QA.

## Consulta y permisos

El predicado compartido de documentos aplica Secretaría propia + Dirección, o Dirección propia + Secretaría.
Usuario conserva sus registros y Administrador no obtiene consulta documental. El predicado se utiliza en
páginas, búsquedas, conteos, detalles, opciones y Dashboard. El historial exige antes el detalle autorizado.
La consulta compartida no concede corrección ni anulación. Los permisos de decisión y entrega se conservan.
El contexto protegido de SíseVe mantiene su alcance y sus puertas adicionales, sin ampliar acceso por relaciones.

## Registro y persistencia

La acción Registrar documento relacionado aparece para Secretaría sobre un origen de Secretaría consultable,
incluso entregado, guardado o anulado. La página reutiliza el formulario y las rutas recibido/emitido,
conservando el parámetro de origen al elegir clasificación. Muestra código, tipo y asunto del origen.
El backend revalida actor y origen y bloquea el origen en la transacción de registro, sin modificarlo.

La nueva migración 20261027-documentos-relacionados-local.sql crea documentos_relaciones.
Cada documento puede ser independiente o tener un origen explícito. Guarda creador, nombre histórico y fecha.
Sus claves foráneas, unicidad y trigger impiden referencias inválidas, ciclos y modificación/borrado del vínculo.
No se deducen relaciones anteriores. Una anulación lógica no borra la relación.

Documento, código correlativo, recorrido inicial, relación y auditoría se guardan en la misma transacción.
La auditoría de relación usa historial_modificaciones con tabla documentos_relaciones y registro del hijo;
no inserta eventos ni modifica el historial del origen. El detalle incluye la referencia y fecha/actor de relación
solo cuando el lector también tiene acceso al documento vinculado. El origen filtra sus hijos por el mismo permiso.

La migración conservó los 13 documentos existentes y los datos y secuencias de las doce tablas anteriores.
Se aplicó con npm run migrate:local; las migraciones previas no se modificaron.

## Diseño

Ajustes acotados en los componentes existentes: botones de corrección y anulación, campos de motivo,
selector de decisión, formularios de guardar/delegar, confirmación, formulario de registro y tarjetas de relación.
Campos y botones utilizan las clases existentes; estilos específicos en Documentos.module.css.
No se rediseñó el resto de la aplicación. No se añadieron dependencias.

## Verificación ejecutada

- npm run test:relacionados:local: 49 solicitudes HTTP correctas a través de localhost:5173.
- Consulta recíproca, registros personales bloqueados por API, búsqueda por código/asunto,
  opciones autorizadas, totales y Dashboard.
- FUT entregado -> informe nuevo, códigos independientes, origen/hijos recargables por ambos perfiles.
- Comparación exacta de documento original, recorrido, historial documental, historial de entrega y movimientos.
- Documento hijo guardado en Dirección; otro registro desde ese origen guardado; anulación del hijo conserva vínculo.
- Fallo deliberado acotado de relación: reversión conjunta de documento, relación, auditorías y correlativo.
  El trigger temporal de comprobación fue eliminado al terminar. No queda activo.
- Rechazo de actores/orígenes ajenos, origen de Dirección, inexistente y tipo protegido; clave SíseVe incorrecta.
- Comprobación adicional posterior: 20 lecturas HTTP por cuatro perfiles y 5 guardas SQL en transacciones revertidas
  (autorreferencia, ciclo, referencia inexistente, borrado y cambio de relación).
- Backend 36/36, frontend 53/53; typecheck y lint correctos; compilación frontend correcta.

Revisión visual en navegador con sesiones reales facilitadas por el usuario, a 1440x1000 y 390x844:
Secretaría abrió el FUT2026004 entregado, registró desde el móvil el informe emitido INF2026008 (ID 27)
y comprobó su origen, formulario, corrección y anulación sin ejecutar esta última. Dirección abrió ese informe,
lo guardó en DIRECCION / archivador 1 y registró una delegación con oficina + nombre manual y observaciones
sobre otro documento de verificación (ID 18). Se revisó el filtrado de usuarios por oficina.
Las pantallas móviles comprobadas no desbordaron horizontalmente.

El FUT2026004 (ID 21) sigue entregado, revisión 2 y exactamente tres eventos de recorrido.
Muestra los informes INF2026006 (API) e INF2026008 (interfaz). El nuevo informe conserva el recorrido normal.
Las capturas están en docs/evidencias-relacionados/ (evidencias locales ignoradas por Git).
Los registros creados se identifican como verificaciones locales y no provienen de QA.

## Comandos

Terminal backend: Set-Location C:\Users\David\Sistema_Web_Final\backend; npm run dev

Terminal frontend: Set-Location C:\Users\David\Sistema_Web_Final\frontend; npm run dev

Migración ya aplicada: npm run migrate:local (backend).
Prueba opcional: npm run test:relacionados:local (crea registros locales de verificación).
No se hizo commit, push ni despliegue.
