# Retirada completa de campos opcionales — 18 de noviembre de 2026

## Estado inicial contrastado

- Git local: main, a08ae60883d6a5e15e147d164521ad5b0744d305. GitHub main idéntico por ls-remote.
- Render: último commit exitoso a08ae60, Live dep-dbusgiuk1f9s73b7p4fg, observado en su panel.
- Pages: deployment 0d712395-4310-40b9-9873-7e7abd569ede, main/71fb729, success; panel y API coinciden. No hay diferencias de frontend entre ese commit y HEAD inicial.
- Local: sistema_web_documental_final, PostgreSQL 18.6, OID 98367, ::1:5432, sin rama Neon.
- Neon: sistema_documental_produccion, rama br-shiny-mud-b6qqkm4n del proyecto shy-truth-29246056; neondb_owner con TLS y certificado validados. No se usaron perfiles históricos /neondb.
- Local: las tres tablas de campos estaban vacías y no había eventos CAMPO_OPCIONAL.
- Neon: valores_documento=0, cambios_nombre_campo=0; una definición de campo (id 43) y un evento CAMPO_OPCIONAL (id 442). No hay auditoría documental de valores de campos.
- Las consultas iniciales fueron READ ONLY/REPEATABLE READ. Las evidencias privadas se guardaron en .private/limpieza-opcionales sin añadirlas a Git.

## Cambios locales previos conservados

El cambio de docs/VERIFICACION_RELEVO_Y_PUBLICACION_20261118.md agrega el resultado de una publicación anterior: se conservó íntegro y se excluye del commit de limpieza.
Los ocho archivos sin seguimiento se inspeccionaron y se conservan fuera del commit:

- backend/scripts/experimento-regional.cjs: utilidad de diagnóstico para proyectos temporales, con guardas propias; no se ejecutó.
- docs/ENTREGA_RELEVO_RELACIONADOS_20261106.md: informe histórico de entrega.
- docs/ENTREGA_RETENCION_PDF_20261105.md: informe histórico de retención.
- docs/EXPERIMENTO_REGIONAL_20261105.md: mediciones históricas.
- docs/INFORME_SITUACION_PERSONAL_Y_DELEGACIONES_20261118.md: informe funcional anterior.
- docs/REVISION_SIETE_COMMITS_20261117.md: revisión histórica.
- docs/superpowers/plans/2026-11-18-situacion-personal.md: plan anterior.
- docs/superpowers/specs/2026-11-05-eliminacion-definitiva-design.md: propuesta distinta de esta tarea; no se implementó.

## Objetos y dependencias retirados

014-retirar-campos-opcionales.sql usa DROP sin CASCADE. Se revisaron pg_depend, pg_constraint, pg_trigger, pg_indexes, funciones SQL/PLpgSQL y vistas; las 57 relaciones de dependencia registradas del conjunto eran internas o referencias salientes a tablas conservadas. Las llamadas en cuerpos de funciones también se inspeccionaron: no se asumió que pg_depend detectase SQL dinámico.

**Tablas:** `campos_opcionales`, `cambios_nombre_campo`, `valores_documento`.

**Secuencias:** `campos_opcionales_id_seq`, `cambios_nombre_campo_id_seq`.

**Funciones:** `registrar_cambio_nombre_campo()`, `validar_valor_documento()`, `auditar_valor_documento()`.

**Disparadores:**

- `cambios_nombre_campo.proteger_cambios_campo`
- `campos_opcionales.no_borrar_campo`
- `campos_opcionales.registrar_cambio_nombre_campo`
- `valores_documento.a_proteger_historico`
- `valores_documento.auditar_valor_documento`
- `valores_documento.no_borrar_valor`
- `valores_documento.no_truncar_valores`
- `valores_documento.validar_valor_documento`

**Índices exclusivos:** `cambios_nombre_campo_pkey`, `campos_opcionales_id_usuario_id_key`, `campos_opcionales_pkey`, `campos_opcionales_usuario_id_nombre_actual_key`, `valores_documento_pkey`.

**Restricciones exclusivas (incluye NOT NULL del catálogo PostgreSQL 18):**

- `cambios_nombre_campo.cambios_nombre_campo_actor_id_fkey`: FOREIGN KEY (actor_id) REFERENCES usuarios(id)
- `cambios_nombre_campo.cambios_nombre_campo_actor_id_not_null`: NOT NULL actor_id
- `cambios_nombre_campo.cambios_nombre_campo_campo_id_fkey`: FOREIGN KEY (campo_id) REFERENCES campos_opcionales(id)
- `cambios_nombre_campo.cambios_nombre_campo_campo_id_not_null`: NOT NULL campo_id
- `cambios_nombre_campo.cambios_nombre_campo_fecha_not_null`: NOT NULL fecha
- `cambios_nombre_campo.cambios_nombre_campo_id_not_null`: NOT NULL id
- `cambios_nombre_campo.cambios_nombre_campo_motivo_check`: CHECK ((length(btrim(motivo)) > 0))
- `cambios_nombre_campo.cambios_nombre_campo_motivo_not_null`: NOT NULL motivo
- `cambios_nombre_campo.cambios_nombre_campo_nombre_anterior_not_null`: NOT NULL nombre_anterior
- `cambios_nombre_campo.cambios_nombre_campo_nombre_nuevo_not_null`: NOT NULL nombre_nuevo
- `cambios_nombre_campo.cambios_nombre_campo_pkey`: PRIMARY KEY (id)
- `campos_opcionales.campos_opcionales_creado_en_not_null`: NOT NULL creado_en
- `campos_opcionales.campos_opcionales_creado_por_fkey`: FOREIGN KEY (creado_por) REFERENCES usuarios(id)
- `campos_opcionales.campos_opcionales_creado_por_not_null`: NOT NULL creado_por
- `campos_opcionales.campos_opcionales_id_not_null`: NOT NULL id
- `campos_opcionales.campos_opcionales_id_usuario_id_key`: UNIQUE (id, usuario_id)
- `campos_opcionales.campos_opcionales_nombre_actual_check`: CHECK ((length(btrim(nombre_actual)) > 0))
- `campos_opcionales.campos_opcionales_nombre_actual_not_null`: NOT NULL nombre_actual
- `campos_opcionales.campos_opcionales_pkey`: PRIMARY KEY (id)
- `campos_opcionales.campos_opcionales_usuario_id_fkey`: FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
- `campos_opcionales.campos_opcionales_usuario_id_nombre_actual_key`: UNIQUE (usuario_id, nombre_actual)
- `campos_opcionales.campos_opcionales_usuario_id_not_null`: NOT NULL usuario_id
- `valores_documento.valores_documento_campo_id_fkey`: FOREIGN KEY (campo_id) REFERENCES campos_opcionales(id)
- `valores_documento.valores_documento_campo_id_not_null`: NOT NULL campo_id
- `valores_documento.valores_documento_documento_id_fkey`: FOREIGN KEY (documento_id) REFERENCES documentos(id)
- `valores_documento.valores_documento_documento_id_not_null`: NOT NULL documento_id
- `valores_documento.valores_documento_nombre_guardado_not_null`: NOT NULL nombre_guardado
- `valores_documento.valores_documento_pkey`: PRIMARY KEY (documento_id, campo_id)
- `valores_documento.valores_documento_valor_not_null`: NOT NULL valor

También se retiran los tipos de fila y objetos TOAST asociados automáticamente a las tablas. Las funciones comunes impedir_cambio_historico, impedir_truncado y proteger_documento_historico siguen instaladas y protegiendo las otras tablas. El registro dinámico de 008 se conserva en su archivo histórico; el instalador actualizado ya no crea el trigger sobre valores_documento.

La auditoría general permanece protegida. Durante 014 se bloquea su tabla y se sustituye temporalmente solo su disparador por una función que admite exclusivamente DELETE cuando OLD.entidad=CAMPO_OPCIONAL; todo UPDATE y todo otro DELETE siguen rechazados. El disparador original se restaura y la función transitoria se elimina antes de COMMIT. No se deshabilitan triggers de forma general, ni se usa TRUNCATE o session_replication_role.

La ejecución local comprobó ausencia de las tablas y funciones con to_regclass/to_regprocedure, conservación exacta de huellas de las 23 tablas ajenas (filtrando solo CAMPO_OPCIONAL de la bitácora general) y las 41 definiciones/estados de sus triggers. DROP sin CASCADE habría rechazado dependencias externas.

## Otros candidatos

Se eliminó ix_documentos_relaciones_origen, conservando documentos_relaciones_origen. 014 compara tabla, unicidad, claves, columnas incluidas, clases de operador, collation, opciones, predicado, expresiones, método de acceso y estados válido/listo; además rechaza índices ligados a restricciones. El ensayo local y el catálogo de ambas bases confirman la equivalencia B-tree por origen_id.

Se retiró de /documentos/opciones el catálogo general destinatarios: el esquema del cliente vigente no lo consume y DestinoDocumental usa la ruta activa /documentos/destinatarios. Esa ruta específica sigue vigente. También se retiró campos:[], valores:[] en alta/corrección y sus comentarios de compatibilidad.

Se conservaron documentos_ordinarios, documentos_anulados y documento_tiene_relacion_visible(): no hay consumidor vigente en el repositorio, pero existen permisos SQL concedidos y no se pueden descartar consultas externas. No se considera que ausencia en pg_depend descarte llamadas dentro de cuerpos SQL.

El grafo desde backend/src/server.ts y frontend/src/main.tsx, incluidas importaciones dinámicas literales, dejó 92 archivos fuera del arranque y 103 alcanzables. Hay 72 pruebas/scripts con posibles referencias a archivos fuera del arranque. Se conservan los árboles antiguos SISEVE/movimientos, los servicios/repositorios antiguos de documentos/dashboard/PDF y los componentes antiguos: sostienen verificaciones y utilidades heredadas, cuyo valor no se descarta por no estar montados. No se retiran dependencias npm ni columnas vigentes de Excel. La clasificación es conservadora, no una afirmación de uso productivo de esos módulos.

## Permisos: divergencia y alineación local

Neon usa pertenencia al ámbito como vía personal y periodo cerrado de la misma oficina con titular vigente como vía histórica. Local exigía adicionalmente autoría y comprobaciones explícitas de la asignación en documento_consultable. Las restricciones instaladas de pertenencia y autoría sostienen el aislamiento. La envolvente documento_consultable_con_delegacion era idéntica.

validar_pdf_permiso de Neon incluye la rama del autor documental de roles 3/4/5 para INSERT/UPDATE aunque esté delegado; DELETE conserva su regla anterior y la excepción de finalización de retención. Local carecía de esa rama adicional. La API ya concede al autor delegado carga/reemplazo y conserva el control separado de eliminación.

Se ensayaron las definiciones productivas en local dentro de una transacción revertida: 90 pares actor/documento conservaron la misma lectura; 270 casos INSERT/UPDATE/DELETE del disparador PDF coincidieron con las reglas para cinco roles y los 18 documentos existentes. Para aislar el disparador se usó una tabla temporal con la estructura PDF, sin crear documentos ni invocar R2. Después se alinearon exclusivamente las dos funciones locales. 014 no modifica estas funciones ni su definición productiva.

El relevo se probó posteriormente con los documentos existentes del Usuario y una cuenta temporal necesaria por no existir un segundo Usuario: el reemplazo leyó el documento del periodo cerrado, el Administrador tercero fue denegado, los permisos de escritura quedaron falsos y SQL rechazó actualizar el documento histórico. Cuenta, asignaciones y cambios se revirtieron.

## Código, instalador y pruebas

Se retiraron consultas, interfaz de detalle, esquemas, tipo RegistroExcel, fragmentación y columnas opcionales de XLSX, y presentación de eventos/valores de esa función. Se retiraron las pruebas que creaban valores históricos y se actualizaron las de contratos/exportación. Los contratos estrictos rechazan valores incluso como arreglo vacío.

El instalador completo y database/schema se exportaron del catálogo local depurado. Son 23 tablas, 35 funciones y 41 triggers; incluyen los incrementales vigentes y semillas de catálogos, sin usuarios/documentos productivos. El runner aislado ahora usa esa instantánea completa sin reejecutar 007–012, que recrearían referencias retiradas. Los archivos 001–013 permanecen sin cambios. La herramienta de exportación del esquema ya no depende de un archivo Downloads ni de una base anterior ajena a esta tarea. No se ejecutó una instalación nueva porque el usuario prohibió crear otra base/clúster.

**Pruebas locales SQL/API:** 6/6 de tests/limpieza-campos.local.test.mjs. Comprueban objetos ausentes, protecciones UPDATE/DELETE/TRUNCATE de tres auditorías, cinco roles, listado contra alcance SQL, detalle/auditoría/historial/metadatos PDF, 12 XLSX (mes, relacionados y vacío), 23 columnas, códigos/asuntos/autofiltro, corrección, contrato rechazado, registro y delegación, relevo y plazo de retención. Todo dentro de una transacción revertida, con comparación final de las huellas de todas las tablas. El alta documental requirió una fila temporal; se reutilizaron tipo y cuentas existentes. Las secuencias pueden avanzar por los ensayos revertidos, sin pérdida de registros.

**Pruebas automatizadas:** frontend npm test 78/78; backend 73/73 en suites sin clúster. Typecheck, lint y build de ambos componentes pasaron. El build publicable configura VITE_API_URL con la URL existente de Render. Prueba XLSX red/green: anterior 25 columnas frente a 23 esperadas, posterior 23; se mantienen tipos, fechas Perú, texto seguro y hoja vacía.

Al ampliar la revisión se ejecutó además tests/pdf.test.mjs, fuera de las suites actuales: falla antes de ejecutar casos porque fija /fixture en DATABASE_URL, incompatible con la guarda vigente. Es una prueba del servicio PDF anterior no montado. Se conserva y se informa; no se alteró para simular un pase. No se ejecutó npm test de backend porque crea otro clúster; la orden del usuario tiene prioridad. R2 real y retención con borrado efectivo no se ejecutaron en local.

## Pages, controles y límites de navegador

No existen _headers ni _redirects en el árbol local, incluido dist y los directorios privados inspeccionados. Las rutas públicas /_headers y /_redirects devuelven index.html por fallback SPA, no el contenido de controles. Se verificaron HTTP 200 de / y /documentos, nosniff, strict-origin-when-cross-origin y caché pública con revalidación; /api/health en Pages devuelve HTML y la aplicación usa Render directamente. No se afirma identidad de archivos de control publicados. El panel mostró 52 recursos antes de la publicación.

Computer Use permitió confirmar los despliegues iniciales pero se detuvo al no poder determinar con suficiente confianza la URL activa de Chrome. No se continuó operando UI por otra tecnología. Las comprobaciones visuales de aplicación y PDF productivo quedan pendientes de recuperar el navegador/sesión.

## Publicación y cierre

Pendiente de completar y actualizar tras publicación: SHA final de GitHub, Render Live del nuevo commit, Pages, respaldo/migración 014 en Neon y verificaciones autenticadas publicadas. No aplicar 014 en Neon mientras Render siga ejecutando la consulta anterior a valores_documento.
