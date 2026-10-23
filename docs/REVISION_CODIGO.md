# Revisión del código existente — 21 de octubre de 2026

> Informe histórico de la revisión previa. Sus pendientes de persistencia, rutas
> protegidas y acceso real se abordaron en la tarea posterior documentada en
> [AUTENTICACION.md](AUTENTICACION.md); consultar allí el estado vigente.

## Alcance

Revisión, corrección y organización de la base existente. No se añadieron módulos
documentales, persistencia, rutas protegidas, refresh tokens, ORM ni tecnologías.
No se modificaron datos, esquema, credenciales privadas o políticas de acceso.
No se utilizó SDD. Esta carpeta no contiene repositorio Git; no hay commit o push.

## Elementos correctos conservados

- Express 5: Helmet, JSON limitado a 100 KB, ausencia de x-powered-by y 404 JSON.
- Capas auth: rutas → controlador → servicio → repositorio → PostgreSQL.
- Pool `pg` con límites y comprobación de identidad de `sistema_web_final`.
- Consultas parametrizadas; bigint serializado como texto.
- Zod estricto para login, con límites 254/1024 y contraseña sin trim.
- JWT HS256, emisor/audiencia explícitos y tolerancia de reloj de cinco segundos.
- Consulta del usuario activo y versión de autenticación en cada /me.
- scrypt asíncrono con sal aleatoria y comparación de buffers de igual longitud
  mediante timingSafeEqual. El formato y parámetros de los hashes se conservaron.
- Hash ficticio para no omitir scrypt cuando no existe el usuario.
- Límite de diez solicitudes de login por IP cada quince minutos.
- Flujo del frontend login → /me, perfil y cierre local; sesión solo en memoria.
- Integración Tailwind/Vite y dependencias aprobadas, aunque no todas tengan uso actual.

## Correcciones

1. El frontend carecía de estilos de login; el import a Login.css señalado en la
   revisión anterior ya no estaba en App.tsx al comenzar esta tarea, pero tampoco
   existía una hoja que estilara sus clases. Se implementó Login.module.css con
   estilos reales, foco visible, estados de error y diseño responsivo. El perfil
   tiene su propio CSS Module y usa utilidades Tailwind para la cuadrícula.
2. App.tsx mezclaba transporte, formulario, sesión y presentación. Ahora solo compone
   useAuth, LoginPage y DashboardPage; se conserva el alcance del perfil existente.
3. Las respuestas JSON se convertían mediante `as T` y el usuario admitía campos
   opcionales/unknown que no coincidían con Express. Se definieron esquemas Zod
   para id string, rol string, email/oficina nullables y respuestas login/perfil.
4. El cliente descartaba estados útiles y fallaba al combinar Headers. Ahora usa
   Headers, maneja fallos al leer el cuerpo, reconoce 400/401/403/413/429/5xx y
   conserva el estado incluso ante HTML de un proxy. No muestra detalles privados.
5. La sesión se publicaba con varios estados independientes y su duración empezaba
   después de /me. Ahora se publica de forma atómica; el cálculo incluye ambas
   solicitudes. Se evita doble envío y actualización tras desmontaje.
6. El frontend no tenía strict. Se activó en ambas configuraciones TypeScript del
   frontend y se habilitó noUncheckedSideEffectImports en la aplicación.
7. El middleware de errores convertía errores de tamaño/codificación del parser
   en 500. Ahora responde 413/415/400 según el caso, respeta headersSent y registra
   únicamente la clase de los errores inesperados para no filtrar cuerpos o SQL.
   Esto sigue los estados documentados por Express/body-parser.
8. Los tipos internos del repositorio eran importados por el middleware y el mapper
   público vivía en el servicio. Ahora auth.types.ts y auth.mapper.ts separan modelo,
   contrato y serialización. Los controladores no ejecutan SQL.
9. /me tenía una aserción no nula. Ahora devuelve 401 defensivamente si falta usuario.
10. JWT verificaba exp si estaba presente, pero no exigía su presencia. Ahora exige
    exp entero y valida sub como bigint positivo dentro del rango de PostgreSQL;
    evita enviar identificadores fuera de rango a SQL. No se cambió el mecanismo.
11. La duración estaba duplicada entre firma y respuesta. Se centralizó en 900
    segundos, conservando exactamente los quince minutos efectivos. Se retiró del
    esquema env la variable JWT_EXPIRES_IN, que no se utilizaba, sin editar .env.
12. El arranque no liberaba el pool al fallar la verificación inicial y carecía de
    manejo del error de escucha HTTP. Se añadieron ambas salidas con código de error.
13. Se retiró App.css, vacío y sin importaciones. main.tsx valida el contenedor y
    index.html identifica el idioma español y el nombre real del proyecto.

Referencia de los estados del parser:
https://expressjs.com/en/resources/middleware/body-parser/

## Contratos HTTP conservados

| Método/ruta | Entrada | Respuesta correcta |
| --- | --- | --- |
| GET /api/health | Sin credenciales | 200, `{status: "ok", message: "Backend funcionando correctamente"}` |
| POST /api/auth/login | `{identificador: string, contrasena: string}` | 200, `{token, tipo: "Bearer", expiresIn: 900, usuario}` |
| GET /api/auth/me | `Authorization: Bearer <JWT>` | 200, `{usuario}` |

Usuario público: id string, nombre, apellido, nombre_usuario y rol string;
email y oficina string o null. No incluye hash, activo o version_autenticacion.
Errores mantienen `{error: string}`. Login conserva 400 para entrada inválida,
401 para credenciales no válidas y 429 para límite de intentos. Errores internos
siguen en 500 genérico. Los cambios 413/415 corrigen estados del parser sin cambiar
los contratos exitosos. Las rutas auth envían Cache-Control: no-store.

## Organización final

```text
frontend/src/
  api/client.ts
  features/auth/
    api/auth.api.ts
    hooks/useAuth.ts
    pages/LoginPage.tsx
    schemas/auth.schema.ts
    styles/Login.module.css
  features/dashboard/
    pages/DashboardPage.tsx
    styles/Dashboard.module.css
  App.tsx
  main.tsx
  index.css
```

Solo se crearon directorios con archivos necesarios. `dashboard` organiza el
perfil que ya existía; no incorpora indicadores ni funcionalidades documentales.
El backend conserva config/, middlewares/, modules/auth/ y shared/security/.

## Manifiesto de archivos

### Frontend creados

- src/features/auth/api/auth.api.ts: llamadas HTTP específicas de autenticación.
- src/features/auth/hooks/useAuth.ts: sesión en memoria y flujo existente.
- src/features/auth/pages/LoginPage.tsx: formulario React Hook Form y validación Zod.
- src/features/auth/schemas/auth.schema.ts: contratos validados y tipos inferidos.
- src/features/auth/styles/Login.module.css: presentación encapsulada del acceso.
- src/features/dashboard/pages/DashboardPage.tsx: perfil público existente.
- src/features/dashboard/styles/Dashboard.module.css: estilos del perfil.
- tests/contracts.test.mjs: regresiones del transporte/contratos sin credenciales reales.
- tests/visual-server.mjs: Vite temporal de QA con proxy aislado en 5174 → 3107.

### Frontend modificados/eliminados

- src/App.tsx: composición de las pantallas y hook.
- src/api/client.ts: transporte genérico y validación de respuestas.
- src/main.tsx: comprobación del contenedor de React.
- src/index.css: tema y reglas globales, eliminando estilos de la plantilla.
- index.html: idioma/título.
- tsconfig.app.json y tsconfig.node.json: tipado estricto.
- eslint.config.js: análisis también de verificadores JavaScript.
- package.json: comando npm test; no se cambiaron dependencias.
- README.md: documentación actualizada del módulo y comandos.
- src/App.css: eliminado por estar vacío y no tener consumidores.

### Backend creados

- src/modules/auth/auth.types.ts: tipos internos y públicos explícitos.
- src/modules/auth/auth.mapper.ts: lista segura de campos públicos.
- src/middlewares/error.middleware.ts: traducción centralizada de errores HTTP.
- tests/auth.test.mjs: criptografía, capas, estados HTTP y seguridad con pool simulado.
- tests/visual-server.mjs: servidor de QA ficticio sin conexión PostgreSQL, puerto 3107.
- scripts/verificar-db.mjs: identidad, metadatos y agregados mediante lectura.

### Backend modificados

- src/app.ts: composición del middleware de errores.
- src/server.ts: errores de arranque/escucha, cierre del pool y documentación.
- src/config/database.ts: documentación del pool y verificación de identidad.
- src/config/env.ts: documentación y eliminación de configuración sin efecto.
- src/middlewares/auth.middleware.ts: tipo común y documentación de seguridad.
- src/middlewares/roles.middleware.ts: documentación de orden y autorización.
- src/modules/auth/auth.controller.ts: mapper, import .js y defensa de /me sin usuario.
- src/modules/auth/auth.repository.ts: tipos comunes y documentación SQL/normalización.
- src/modules/auth/auth.routes.ts: no-store y documentación del límite existente.
- src/modules/auth/auth.schema.ts: documentación del contrato de entrada.
- src/modules/auth/auth.service.ts: mapper/tipos separados y duración única.
- src/shared/security/jwt.ts: vencimiento obligatorio, rango de sub y duración única.
- src/shared/security/password.ts: documentación y formato legible, algoritmo conservado.
- eslint.config.js: análisis de pruebas y verificador de lectura.
- package.json: comandos test y check:db.

### Documentación y artefactos

- README.md raíz y frontend/README.md sincronizados con la implementación.
- docs/REVISION_CODIGO.md: este informe.
- docs/evidencias/login-escritorio.png y login-movil.png: UI revisada.
- docs/evidencias/perfil-qa.png y perfil-movil-qa.png: perfil con datos ficticios.
- dist/ en ambos proyectos: salida regenerada por compilación, no código fuente.

No se introdujeron dependencias ni se editaron los archivos de bloqueo.

## Verificación de PostgreSQL

La conexión real a sistema_web_final respondió correctamente. Dentro de BEGIN
READ ONLY, con statement_timeout local y ROLLBACK final, se leyeron columnas,
nulabilidad, índices, restricciones y conteos agregados, sin mostrar filas personales.

Se encontró un usuario activo, sin versiones inválidas, roles ausentes o hashes de
formato incompatible. La comprobación de formato no equivale a verificar su contraseña.

El CHECK de nombre_usuario exige minúsculas, trim y patrón sin @. El CHECK del
email exige @, formato básico y ausencia de espacios laterales. Por ello se conservó
la búsqueda actual: nombre_usuario = $1 OR lower(email) = $1. Las restricciones e
índices observados respaldan la normalización existente y evitan la ambigüedad
entre nombre de usuario y correo sin cambiar la consulta.

## Pruebas y límites

Resultado final: TypeScript, ESLint y compilación correctos en ambos proyectos.
Node contabilizó 16 pruebas aprobadas en backend (15 casos y la agrupadora) y
8 en frontend (7 casos y la agrupadora), sin fallos, cancelaciones ni omisiones.
Los procesos temporales de QA se detuvieron al finalizar.

- npm run typecheck, npm run lint y npm run build en ambos proyectos.
- Backend: npm test compila y ejecuta la suite nativa de Node con pool sustituido.
  Se prueban scrypt, firma/vencimiento/audiencia/emisor/algoritmo de JWT, bigint,
  health/404, validación, 413/415, login, /me, revocación por versión, inactividad,
  error de repositorio, roles y 429.
- Frontend: npm test compila contratos en memoria con Vite y simula Fetch. Se prueban
  campos, Bearer, tipos, JSON inválido, códigos HTTP, error de red/lectura y Headers.
- Los primeros intentos afectados por spawn EPERM se repitieron con ejecución
  permitida. No se consideran evidencia de aprobación por sí mismos.
- Navegador: formulario vacío, mensajes de validación, mostrar/ocultar contraseña,
  login → perfil, cierre local y retorno al login al recargar. El flujo exitoso usó
  los servidores aislados 3107/5174 y datos ficticios, nunca una cuenta real.
- Login revisado en 1366×900 y 375×812; perfil en la vista normal y 375×812.
  Las medidas del DOM no mostraron desbordamiento horizontal. Consola de QA aislada
  sin errores/advertencias al comprobar el flujo. Capturas en evidencias/.

No se comprobó login con contraseña real, persistencia, renovación, rutas protegidas,
producción ni vencimiento del temporizador de React tras esperar quince minutos.
El rechazo de JWT vencidos sí tiene pruebas automatizadas. No se ejecutó una auditoría
de dependencias ni una prueba de penetración. Las pruebas de seguridad son acotadas.

## Preparación para la siguiente tarea

La base queda compilable, modular y con contratos comprobados. La siguiente tarea
puede completar el acceso real con PostgreSQL, definir/implementar persistencia y
rutas protegidas sobre esta estructura. La duración efectiva sigue siendo 15 minutos;
el cierre actual sigue siendo local y no revoca el JWT. Cualquier cambio de esos
mecanismos deberá respetar las decisiones funcionales que se acuerden entonces.
