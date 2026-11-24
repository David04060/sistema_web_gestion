# Destinatarios operativos y filtro de oficina de delegación

Solicitud del 23 de noviembre de 2026. Implementación en el repositorio habitual, rama `main`, desde `c0a5152b1119ac80c341a37de6646506760a010d`. Los documentos, scripts y pruebas preexistentes sin confirmar quedan fuera de esta entrega.

## Cambios

- La búsqueda documental une `usuarios` con el catálogo real `roles` y excluye los códigos `ADMINISTRADOR` y `SUPERADMINISTRADOR` antes de ordenar recientes y limitar resultados. No depende del ID ni del nombre visible del rol.
- La validación transaccional compartida por registro con delegación y delegación posterior rechaza esas cuentas; bloquea tanto usuario como rol durante la comprobación.
- Las opciones documentales informan `oficina_actual_id` desde la identidad reconsultada. Solo `DestinoDocumental` la excluye de «Oficina opcional». El catálogo general de oficinas activas permanece íntegro y se conserva «Todas las oficinas».
- Los selectores operativos de ubicaciones y relevo ya acotan los roles correspondientes; no requieren alterar sus reglas. Las rutas antiguas de destinatarios no están montadas en `app.ts`. No se modifican administración de usuarios, nombres históricos, acceso, permisos, relevo ni esquema. No hay migraciones.

## Verificación local

Base existente comprobada: `sistema_web_documental_final`, `::1:5432`, esquema `public`. No se crean repositorios, worktrees, clústeres ni bases.

- `node --test --test-isolation=none tests/destinatarios.base-local.test.mjs`: 6 pruebas aprobadas. Incluye búsquedas vacías/texto, oficinas, Dirección/Secretaría/Usuario, listado y detalle administrativos, edición temporal de ambas cuentas administrativas, rechazo HTTP 400 para ambos roles en delegación posterior e inmediata, aceptación de personal y manual, conservación de autoría y lectura sin escritura del receptor.
- La prueba bloquea las tablas afectadas, usa transacción exterior y savepoints y restaura las secuencias antes de liberar los bloqueos. Compara huellas de las tablas tras rollback. No quedan registros ni cambios de cuentas de prueba.
- Prueba preexistente de ubicaciones en base habitual: 7 aprobadas; verifica cinco roles, ámbitos y lecturas.
- Pruebas unitarias/HTTP complementarias backend: 58 aprobadas (auth, esquemas, guard, Neon, CORS, cuerpos comprimidos y almacenamiento simulado). No ejecuta el runner que crea clústeres; los tests que exigen su manifiesto no se fuerzan contra la base habitual.
- `npm test` frontend: 79 aprobadas, incluida la regresión del selector, contratos, sesiones, administración, lectura, relevo y PDF.
- Typecheck y lint de ambos componentes aprobados. Build backend aprobado. Build frontend aprobado con `VITE_API_URL=https://sistema-documental-hw7t.onrender.com`.
- Navegador local sobre aplicación y API reales: los tres perfiles muestran todas las oficinas activas ajenas y «Todas las oficinas», excluyen la propia y permiten filtrar, buscar y seleccionar una persona. La apertura de sugerencias conserva destinatarios operativos.

## Incidencias y correcciones

Las regresiones reprodujeron la oferta de cuentas administrativas y la aceptación de delegación directa al Superadministrador antes del arreglo. La prueba frontend reprodujo la oficina propia antes del filtro. Ambos quedaron corregidos.

El sandbox bloqueó subprocesos de Node/Vite con `EPERM`; las pruebas que no requieren subprocesos se ejecutaron sin aislamiento de procesos y los comandos de Vite y las demás pruebas se repitieron con permisos de ejecución. El primer inventario de secuencias del test asumía una columna `id` en la tabla de delegaciones; se corrigió consultando las dependencias reales de PostgreSQL.

La revisión automática rechazó una propuesta de crear tokens de sesión productivos fuera del login normal; no se ejecutó. La verificación autenticada usa el login normal completado por el usuario.

## Publicación

Código publicado: `3c32d67c4342e9457da64ae739f0233d5e327ab8`, confirmado en GitHub `main`.

| Servicio | Resultado |
| --- | --- |
| Render | `dep-dc2eojei0phs73al3r2g`, commit `3c32d67`, `Deploy succeeded / Live`, duración 55,3 s |
| Cloudflare Pages | `e4de271f-af66-481d-9429-0994ccf431b3`, commit `3c32d67`, despliegue canónico `success` |
| Dominio principal | `https://sistema-documental-p.pages.dev`, 52 recursos idénticos por SHA-256 al build local |
| Backend | `https://sistema-documental-hw7t.onrender.com/api/health`, HTTP 200, `status: ok` |

El login normal de Dirección se completó con intervención del usuario. Tras recargar el dominio principal, el formulario de delegación mostró «Todas las oficinas» y las doce oficinas activas ajenas, sin «Dirección». La búsqueda vacía ofreció personal operativo; las búsquedas `admin` y `superadmin` devolvieron «No se encontraron personas». El filtro «Mesa de Partes» devolvió su cuenta operativa y permitió seleccionarla. No se enviaron registros ni delegaciones de prueba a producción.

También se comprobó en navegador local el listado administrativo, el detalle y el formulario de edición de Administrador. La modificación efectiva de ambas cuentas administrativas se probó por HTTP dentro de la transacción revertida.

Una consulta auxiliar con el archivo local `.env.neon` fue rechazada por Neon (`28P01`, credencial guardada no vigente). No se cambiaron credenciales ni configuración de la base. Render mantuvo su configuración válida y la aplicación publicada pasó login, lecturas y salud. Esta consulta auxiliar no fue necesaria para la comprobación de la mejora en el dominio real.

Los cambios preexistentes del árbol local se conservaron fuera de los commits de esta entrega. La documentación de cierre se publica en un commit posterior sin cambios de aplicación; ambos servicios conservan el commit de código indicado arriba.
