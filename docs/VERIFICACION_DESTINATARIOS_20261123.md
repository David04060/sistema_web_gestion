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

Los identificadores y comprobaciones finales de GitHub, Render y Pages se informan al cerrar la entrega, tras observar los despliegues activos.
