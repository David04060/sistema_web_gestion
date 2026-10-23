# Autenticación JWT y navegación — 21 de octubre de 2026

## Alcance y resultado

Integración real de React, Express y PostgreSQL, sin modificar tablas, datos,
contratos HTTP ni duración del JWT. No se instalaron dependencias. React Router,
Zod, React Hook Form, Fetch, TypeScript, Tailwind y CSS Modules siguen siendo el stack.

La prueba positiva se realizó con una cuenta autorizada cuyas credenciales introdujo
el usuario directamente en el navegador. No se leyeron ni almacenaron esas
credenciales en código, registros o documentación. No se fotografió el perfil real.
Las pruebas automatizadas aisladas complementan esa verificación y no la sustituyen.

## Arquitectura

- `AuthSession`: estado único de sesión, recuperación, expiración, cierre y carreras
  asíncronas. Las dependencias productivas son API real, sessionStorage y reloj real.
  Las pruebas pueden inyectar adaptadores sin modificar el flujo productivo.
- `AuthProvider`: ciclo de vida y revalidación al recuperar foco, visibilidad o página.
- `AuthContext` y `useAuth`: comparten la misma instancia mediante useSyncExternalStore.
- `auth.api.ts`: conserva login y /me. `api/client.ts`: Fetch, esquemas y errores HTTP.
- `AppRoutes`: rutas, redirecciones, bloqueo durante verificación y 404.
- `App.tsx`: composición. Las páginas y sus estilos visuales existentes se conservaron.

Estados: `verificando`, `anonimo`, `autenticado`, `error`. El estado error corresponde
a una sesión que no pudo verificarse por indisponibilidad o respuesta incompatible:
no contiene usuario ni habilita pantallas privadas. Ofrece reintentar o cerrar la sesión.

## Persistencia y recuperación

1. POST /api/auth/login recibe identificador/contrasena y se valida con Zod.
2. Se consulta GET /api/auth/me con Authorization: Bearer para validar el perfil.
3. Solo tras ambas respuestas correctas se guarda el JWT en la clave
   `documental.jwt` de sessionStorage. No se guarda contraseña ni perfil.
4. Al iniciar React se lee el token, se comprueba su estructura/vencimiento y se
   consulta /me. No se considera autenticado al usuario antes de esa respuesta.
5. JWT ausente, inválido, vencido o rechazado: sesión anónima y limpieza del token.
6. Error de red/5xx: conserva el token aún vigente pero bloquea la vista privada
   hasta que /me responda correctamente. Su vencimiento sigue programado.
7. Fallos de almacenamiento se informan; no se afirma persistencia si guardar falla.

sessionStorage pertenece al origen y la pestaña: conserva datos al recargar y
normalmente termina al cerrar la sesión de esa pestaña. La restauración de sesiones
del navegador puede recuperar pestañas; por ello el servidor y exp siguen mandando.
Cambiar entre localhost y 127.0.0.1 o cambiar el puerto implica otro origen.
Referencia: https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage

## Navegación

| Ruta | Anónimo | Autenticado |
| --- | --- | --- |
| / | Redirige a /login | Redirige a /dashboard |
| /login | Formulario existente | Redirige a /dashboard |
| /dashboard | Redirige a /login | Panel existente |
| Cualquier otra | 404 con enlace al login | 404 con enlace al dashboard |

Durante verificación se muestra un estado de carga sin contenido privado.
Navigate utiliza replace para no conservar el login/redirect anterior como destino.
Tras logout el guard vuelve a comprobar la identidad, incluso al navegar atrás.
La página 404 usa Link para navegación interna. No hay window.location.
La protección React no sustituye requiereAuth en Express.

Vite admite la recarga de /dashboard en desarrollo. Un hosting de producción para
esta SPA deberá devolver index.html en las rutas del frontend, sin interceptar /api.
No se modificó ni desplegó infraestructura en esta tarea.

## Expiración

La duración del backend sigue siendo exactamente 900 segundos. El cliente lee exp
del JWT para calcular el instante absoluto; decodificar no verifica su firma.
Express realiza la validación criptográfica y vuelve a comprobar actividad/versión.

Recargar no inicia otros 900 segundos. El gestor conserva el exp original, programa
un temporizador y comprueba el reloj también al navegar. Al recuperar foco,
visibilidad o una página restaurada vuelve a consultar /me. Un 401 autenticado
invalida el estado local, incluso si el temporizador no se ejecutó por suspensión.

No hay refresh tokens ni ampliación silenciosa. El backend conserva su tolerancia
de reloj existente; el cliente deja de mostrar contenido privado al llegar a exp.
La precisión depende del reloj del dispositivo, pero el backend sigue rechazando
tokens expirados independientemente del estado de React.

## Errores y seguridad

- 401 con Bearer: elimina sesión local. Un 401 de login se presenta como credenciales
  incorrectas y no autentica.
- 403 de una operación autenticada: falta de permiso; no se transforma en 401 ni
  revoca por sí mismo la identidad. Si /me devuelve 403 se deniega el acceso global.
- 400/413/429/5xx mantienen mensajes específicos/sanitizados.
- Fetch tiene un límite de espera de 15 segundos y maneja errores al leer el cuerpo.
- Las operaciones llevan una versión para descartar respuestas posteriores a
  logout/desmontaje; no pueden resucitar una sesión cerrada.
- Temporizadores nativos se invocan mediante wrappers que conservan su contexto.
  Se corrigió Illegal invocation detectado en la primera prueba y se añadió regresión.
- React representa los datos como texto; no se usa dangerouslySetInnerHTML, eval ni
  scripts externos nuevos. Tokens y contraseñas no se incluyen en URLs ni logs.
- sessionStorage es accesible desde JavaScript: un XSS en este origen puede robar el
  JWT. El almacenamiento por pestaña limita persistencia, pero no elimina ese riesgo.
  Mantener escape/validación y evitar HTML no confiable. El hosting productivo debe
  usar HTTPS y una CSP apropiada para sus scripts/estilos. Helmet protege la API;
  su CSP no equivale a configurar los encabezados del hosting del frontend.

## Cierre de sesión y revocación

Cerrar sesión elimina el token de sessionStorage, el perfil, el temporizador y el
estado en memoria, y provoca redirección a /login. Si el navegador impide limpiar
storage, se informa y se indica cerrar la pestaña; no se oculta esa limitación.

Eliminar el token NO lo revoca en Express. Una copia obtenida previamente sigue
siendo válida hasta su vencimiento o hasta que el usuario quede inactivo/cambie su
version_autenticacion por un mecanismo externo autorizado ya existente.

No se implementó revocación individual. Añadirla requeriría decidir endpoint de
logout y almacenamiento compartido de jti revocados hasta exp, además de consultas
en la validación y su limpieza. Implicaría estado de servidor, posibles cambios de
persistencia y un nuevo contrato; queda fuera de este alcance y requiere aprobación.
No se implementaron cookies HttpOnly ni sesiones de servidor.

## Pruebas realizadas

### Automatizadas

- Frontend: npm run typecheck, npm run lint, npm test y npm run build.
- Backend: npm run typecheck, npm run lint y npm test (incluye compilación).
- Frontend: 22 pruebas aprobadas contabilizadas por Node (21 casos y una agrupadora):
  contratos, persistencia, espera de /me, recarga sin ampliar exp, errores de login,
  token malformado/vencido/rechazado, 401/403, red, reintento, vencimiento durante
  caída, logout/vencimiento durante petición pendiente, almacenamiento bloqueado, identidad
  incompatible y contexto de temporizadores.
- Backend: 16 pruebas aprobadas (15 casos y una agrupadora), conservadas de la revisión.

### Integración real

El backend compilado se inició con el entorno privado existente en el puerto 3108:
verificó la identidad sistema_web_final. Vite se inició temporalmente en 5175 con
proxy al backend real, sin cambiar vite.config.ts ni sus puertos predeterminados.
No se utilizaron los servidores ficticios de QA de la revisión anterior.

- Cuenta autorizada introducida por el usuario: login correcto y URL /dashboard.
- Recarga de /dashboard: espera a /me y permanece autenticado.
- Acceso a /login autenticado y a /: redirección a /dashboard.
- 404 autenticado y anónimo; navegación con Link.
- Backend detenido durante recarga: muestra error de comprobación, sin perfil privado.
- Backend reiniciado: Reintentar recupera la sesión sin pedir de nuevo credenciales.
- Cierre de sesión: /login. Navegar atrás no muestra perfil. Acceso directo a
  /dashboard sin sesión redirige a /login.
- Credenciales incorrectas desde la UI y desde HTTP real: 401.
- JWT inválido y JWT vencido firmado enviados al backend real: 401.
- GET /api/health real: 200.
- Medidas DOM en 375×812 y 1366×900: sin desbordamiento horizontal. El perfil móvil
  se comprobó antes de logout. Capturas del formulario sin datos personales en evidencias/.

`backend/scripts/verificar-http-real.mjs` reproduce las pruebas negativas sin
credenciales reales ni escrituras. Usa CHECK_HTTP_URL opcional y el secreto privado
solo en memoria para firmar el token ya expirado; no lo imprime ni persiste.

Las pruebas de vencimiento del cliente usan un reloj controlado; no se esperaron
quince minutos en navegador. Sí se envió un token firmado vencido al backend real.
La eliminación local de tokens rechazados se cubre en los tests del gestor; no se
inyectaron manualmente tokens en sessionStorage del navegador con la cuenta real.

## Archivos de esta tarea

### Creados

- frontend/src/features/auth/services/AuthSession.ts: gestor único de sesión.
- frontend/src/features/auth/services/sessionStorage.ts: almacenamiento y lectura de exp.
- frontend/src/features/auth/context/AuthContext.ts: contexto compartido.
- frontend/src/features/auth/context/AuthProvider.tsx: ciclo de vida/revalidación.
- frontend/src/routes/AppRoutes.tsx: tabla, guards, redirecciones y 404.
- frontend/src/components/ui/EstadoPagina.module.css: carga, error y 404 coherentes con el tema.
- frontend/tests/session.test.mjs: regresiones de sesión sin bibliotecas adicionales.
- backend/scripts/verificar-http-real.mjs: comprobación HTTP negativa real.
- docs/AUTENTICACION.md: arquitectura, seguridad, alcance y resultados.
- docs/evidencias/auth-login-movil.png y auth-login-escritorio.png: evidencia sin credenciales.

### Modificados

- frontend/src/features/auth/hooks/useAuth.ts: suscripción al contexto compartido.
- frontend/src/api/client.ts: notificación de 401 autenticados y tiempo máximo de petición.
- frontend/src/App.tsx: composición de AppRoutes.
- frontend/src/main.tsx: BrowserRouter y AuthProvider.
- frontend/eslint.config.js: globals de los verificadores existentes.
- README.md y frontend/README.md: estado actual y enlace a esta documentación.
- docs/REVISION_CODIGO.md: identificación de su alcance histórico.

No se eliminaron archivos de código ni se alteraron dependencias/package-lock.
Los dist se regeneraron. El script temporal de Vite usado para integración no forma
parte de la aplicación y se elimina tras las pruebas.

Se cerró la sesión de la cuenta real, se cerró la pestaña de QA y se detuvieron los
procesos temporales 3108/5175. Para el desarrollo habitual se mantienen los comandos
`npm run dev` en backend y frontend, con los puertos configurados originalmente.
