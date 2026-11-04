# Registro delegado, permisos PDF y limpieza · 2026-11-04

## Cambios funcionales

- El listado de Usuario ofrece Todos mis documentos, Personal y Delegado. Los enlaces con una situación incompatible pierden ese filtro y reinician la página. La consulta SQL mantiene el ámbito personal.
- El formulario ofrece Delegar al registrar para Recibido y Emitido. Dirección delega desde Pendiente de Dirección y excluye ubicación. Secretaría conserva en Mesa de Partes mientras está marcada la delegación. Usuario delega desde Personal. Desmarcar conserva la selección de alta previa.
- La transacción de alta reutiliza la validación e inserción del detalle. PostgreSQL conserva los triggers de transición y auditoría. Un destino inválido revierte también correlativo e historial.
- El selector consulta un endpoint autenticado tras dos caracteres, con pausa de 250 ms, cancelación, límite de 20 coincidencias, nombre de cuenta y oficina. Conserva entrada manual y filtro opcional de oficina. El guardado revalida actividad y compatibilidad de la oficina. El catálogo anterior queda limitado a 20 resultados para pestañas que aún cargaron la compilación previa.
- El autor vigente puede cargar y reemplazar el PDF después de delegar. Dirección y Secretaría mantienen las capacidades del ámbito compartido. La eliminación mantiene la regla anterior. Administrador y otros Usuarios carecen de permiso de escritura. La migración 005 alinea el trigger con la API y conserva los eventos de carga y reemplazo.
- La carga opcional se inicia después de confirmar el documento. Si falla R2, el formulario conserva el ID y ofrece reintentar sobre ese registro. La transacción del alta y delegación pertenece a PostgreSQL.

## Limpieza y configuración

Se retiraron ConfiguracionPages.tsx y OficinasPages.tsx de frontend/src/features/usuarios/pages. El router ya importaba pantallas directas. Se actualizaron los imports del único consumidor ejecutable identificado, detalle-documental.test.mjs, y se quitaron reexports redundantes en CamposActualesPage, RolesActualesPage y TiposActualesPage. Las coincidencias en copias de evidencia pertenecen a sus propios árboles. El resto de fuentes históricas se conserva donde hay consumidores o incertidumbre.

Se contrastó el inventario de la revisión anterior con Git, el punto de entrada React, routers Express, herramientas SQL y configuración de despliegue. Los compilados, cachés, logs privados y evidencias locales siguen cubiertos por las reglas vigentes de Git. No hay un árbol propio out o core que retirar. Los recursos públicos se conservan por consumo de la aplicación, licencias o acceso directo mediante URL. Los informes anteriores permanecen intactos.

env.ts selecciona perfil y valida entorno, local.ts comprueba el destino local, neon.ts valida URL e identidad remotas y database.ts administra el pool y el arranque. esquema.ts concentra las sondas de documentos y PDF. La identidad verificada se reutiliza al arrancar. Cada conexión nueva conserva su verificación. Se conserva la sangría local existente y se corrige el mensaje Neon que mencionaba la base anterior. README.md pasa a describir el flujo activo.

## Verificación local

- Revisión aislada PostgreSQL, 38/38. Incluye los tres roles de registro en Recibido y Emitido, rollback de alta con destino incompatible, búsqueda y ámbito personal.
- PDF con PostgreSQL real y almacenamiento simulado. Carga después del alta delegada, adjunto posterior, reemplazo tras delegación, auditoría de actor y recuperación de fallo simulado. Otro Usuario de la misma oficina recibe rechazo.
- Frontend, 70/70. Typecheck, lint y build de ambos proyectos verificados.
- La suite general detectó que el inventario aún omitía PUT y DELETE de tipos de la publicación previa. El inventario actualizado incluye ambas rutas y la nueva búsqueda.
La repetición de la suite general pasó 62/62 en PostgreSQL aislado.

## Publicación y comprobación productiva

- Código dc2e808cfaceefaa4a880fde8daf4bc7f2f8f247 enviado a main. Render confirmó Live en dep-dblle4etlv9c73c398bg y registró la identidad de sistema_documental_produccion al iniciar.
- Incremental 005 aplicado en la base y rama productivas comprobadas. La definición previa se guardó en el área privada y se confirmó la nueva regla mediante lectura posterior del catálogo PostgreSQL.
- Pages 8fed2ec1-3fe5-4f8e-abca-8ae8e5e2efe6 activo. Los 53 recursos del dominio canónico coinciden byte por byte con frontend/dist. /documentos/nuevo responde 200 y devuelve la entrada SPA esperada.
- Con las cuentas productivas activas se verificaron 200 para búsqueda de Dirección, Secretaría y Usuario, 403 para ambos roles administrativos y 401 sin sesión. Se verificó CORS desde el origen de Pages. En las cuentas Usuario, la consulta directa Pendiente de Dirección devolvió cero filas.
- Los casos de escritura y fallo de R2 se cubrieron en PostgreSQL aislado con almacenamiento simulado. En producción se hicieron consultas de lectura y la migración de función. Quedan pendientes la interacción manual completa con teclado y móvil y un recorrido con un PDF real en R2. El incremental queda disponible para instalaciones locales existentes.
- La revisión de consumidores confirmó dos retiradas de código. Queda pendiente certificar el uso de herramientas históricas que no entran en el flujo activo antes de considerar otras retiradas.
