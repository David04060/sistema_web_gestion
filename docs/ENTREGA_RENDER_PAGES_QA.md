# Entrega QA en Render y Cloudflare Pages

Fecha: 23 de octubre de 2026, America/Lima. Es un despliegue público de QA,
conectado exclusivamente a la rama Neon qa-pruebas. No se habilitó Neon principal.

## Servicios comprobados

| Servicio | URL y estado |
| --- | --- |
| Frontend Pages | https://sistema-documental-p.pages.dev — HTML, assets, rutas SPA y sesión verificados |
| Backend Render | https://sistema-documental-hw7t.onrender.com — API HTTPS operativa |
| Salud | https://sistema-documental-hw7t.onrender.com/api/health — HTTP200, status ok |
| Código | https://github.com/David04060/sistema_web_gestion — repositorio privado |

Render: sistema-documental, Free, 0.1 CPU y 512 MB RAM según el panel, Node.js
24.21.0, rootDir backend, build npm ci --include=dev && npm run build,
inicio npm start y puerto proporcionado por Render. Código de aplicación
desplegado: 307690a83a639faf010fc1aca4ddedcd8d536c71.
Despliegue activo después de rotar secretos: dep-dbdr55e7bikc7385g4tg.
Los commits posteriores de esta entrega solo documentan resultados.

Pages: sistema-documental-p, publicación estática Direct Upload. El bundle
publicado contiene la URL HTTPS real de Render; no hay Functions ni proxy /api.
La publicación inicial usa el identificador 23e52a67. El origen canónico permitido
por CORS es el dominio principal del proyecto Pages, no sus aliases de preview.

## Pruebas y distinción de runtimes

| Comprobación | Resultado |
| --- | --- |
| Backend TypeScript, ESLint y build | Aprobados |
| Unitarias backend, incluidos CORS y proxy/límite por IP | 33/33 |
| Frontend TypeScript, ESLint, regresiones y build | Aprobados |
| Flujo documental con Express local y Neon QA | 35/35 |
| Dashboard con Express local y Neon QA | 10/10 |
| Administración, usuarios, sesión, auditoría y límites HTTP Node QA | Ocho grupos aprobados |
| Flujo documental con HTTP hacia Render real y SQL QA | 35/35 |
| Dashboard con HTTP hacia Render real y SQL QA | 10/10 |
| Regresiones auxiliares con Node HTTP y ROLLBACK QA | Administración 14, catálogos 14 y consultas 5 aprobadas |
| Inicio de sesión desde Pages y restauración al recargar | Aprobados con cuenta sintética ordinaria |
| Salud Render | HTTP200 |
| Rutas protegidas sin JWT | HTTP401 |
| Preflight Pages → Render | HTTP204, origen exacto |
| Origen no permitido | HTTP403 |
| Pages /, /login y /dashboard | HTTP200 y fallback SPA correcto |

Las suites remotas hacen sus solicitudes documentales y del Dashboard al servicio
real de Render. Los fixtures, los casos SQL directos y las tres regresiones
auxiliares se ejecutan desde Node contra QA. No se presentan esos casos SQL o
auxiliares como mediciones del servicio remoto. La suite SíseVe incluye bloqueo
HTTP429 por cuenta, aislamiento de usuarios, rechazo de claves y permisos,
auditoría, confidencialidad y reutilización del circuito documental.

Los fixtures y avances de secuencias permanecen únicamente en QA; no se ejecutó
DDL, migraciones ni bootstrap de arranque. Las pruebas no utilizan claves ni
contraseñas institucionales. Las evidencias detalladas y capturas con el usuario
sintético se conservan en .private/render, fuera de Git.

## Conservación y secretos

Se comprobaron los hashes de cuatro fuentes SQL y 53 componentes/hojas de estilo:
intactos. También permanecen intactos password.ts, jwt.ts y el contexto restringido
de SíseVe. Los perfiles privados local y Neon principal conservaron sus hashes.
El perfil QA cambió por las rotaciones de contraseña realizadas por el usuario.
Su JWT_SECRET todavía era un marcador de plantilla: se sustituyó únicamente ese
marcador por un secreto aleatorio privado, conservando URL y demás variables.
Render utiliza otro secreto JWT independiente.

Git excluye .env, .private, node_modules, dist, respaldos y capturas históricas.
El escaneo del código versionado no encontró coincidencias con los secretos
privados comparados. El inventario de Git no contiene adaptaciones Workers.

Se corrigió la antigua plantilla QA que contenía credenciales. Durante la revisión
del formulario Render, la accesibilidad devolvió valores aunque estaban ocultos
visualmente. Se suspendió el servicio, se rotaron contraseña QA y JWT, se guardaron
los secretos nuevos y se desplegó de nuevo. La aceptación de un JWT firmado con
el nuevo secreto se comprobó mediante /api/auth/me sin imprimir sus valores.
Las credenciales no se incluyeron en el repositorio ni en este informe.

La prueba de confidencialidad se aisló por tipo/documento para admitir otros datos
acumulados en QA. Una ejecución intermedia se interrumpió al cambiar la contraseña
durante las pruebas; las ejecuciones finales completas con configuración estable
pasaron. Las restricciones de procesos del sandbox se resolvieron mediante la
ejecución autorizada, sin modificar la lógica de la aplicación.

## Límites conocidos

Render Free puede suspenderse por inactividad y tardar 50 segundos o más en
despertar. Se observaron timeouts de salud durante la reanudación/despliegue;
el servicio caliente y las pruebas finales respondieron correctamente. El timeout
del cliente sigue en quince segundos: una primera solicitud en frío puede requerir
reintento. No se modificó ese contrato ni se instalaron mecanismos keep-alive.

Los limitadores conservan MemoryStore y sus cantidades originales. Se reinician
con el proceso y no coordinan múltiples instancias. No se deben escalar procesos
sin acordar un almacén compartido. El límite de diez ms de Workers Free ya no
aplica al backend Node en Render; no se redujeron parámetros scrypt.

No se configuró R2 ni se conectó el servicio público a Neon principal.
La guía operativa está en DESPLIEGUE_RENDER_PAGES.md y el inventario de retirada
en RETIRADA_WORKERS_RENDER.md.
