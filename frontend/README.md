# Frontend — Sistema Web Documental

Interfaz de la I.E. Enrique Paillardelle. Ver las decisiones comunes en [../README.md](../README.md).

## Tecnologías y configuración

React, TypeScript, Vite, Tailwind CSS 4, React Router, React Hook Form, Zod, Fetch API, CSS Modules y ESLint con soporte de TypeScript.

React Router implementa navegación y guards. React Hook Form y Zod validan el formulario y los contratos de la API. Fetch API y CSS Modules no requieren paquetes adicionales.

`src/index.css`, importado por `main.tsx`, centraliza los estilos globales. `@tailwindcss/vite` procesa las capas de tema y utilidades de Tailwind 4. Se omite Preflight para conservar los estilos existentes. Esta configuración básica no necesita `tailwind.config.js`.

Los estilos de una funcionalidad deben permanecer en su módulo, normalmente en `styles/`. Los archivos `*.module.css` permiten encapsular clases mediante el soporte incluido en Vite y sus tipos.

## Comandos

Ejecutar desde `frontend/`:

- `npm ci`: reproducir las versiones del archivo de bloqueo.
- `npm run dev`: iniciar Vite; `/api` se redirige a `http://localhost:3000`.
- `npm run typecheck`: comprobar la aplicación y la configuración de Vite.
- `npm run lint`: ejecutar ESLint; las advertencias también hacen fallar el comando.
- `npm run build`: comprobar TypeScript y compilar para producción.
- `npm run preview`: previsualizar una compilación existente.
- `npm test`: verificar contratos y errores HTTP con respuestas simuladas, sin conexión a PostgreSQL.

## Estado actual

`App.tsx` compone `routes/AppRoutes.tsx`. `features/auth/` contiene API, esquemas/tipos, gestor de sesión, contexto/proveedor, hook, página y CSS Module del login. Las pantallas de los diez módulos se cargan por rutas con React.lazy y Suspense. Dashboard consume estadísticas autorizadas calculadas en PostgreSQL; Documentos, Movimientos y SíseVe conservan sus flujos y contratos existentes.

`src/api/client.ts` se ocupa exclusivamente del transporte y valida las respuestas con el esquema proporcionado por cada funcionalidad. La compilación completa ya pasa: el login importa `features/auth/styles/Login.module.css`, con estilos reales y responsivos.

`features/roles/`, `features/oficinas/` y `features/usuarios/` implementan la administración
de los catálogos y las cuentas con API real. `components/layout/AdminLayout.tsx`
centraliza navegación y cierre de sesión. Las rutas administrativas tienen un guard
de rol y Express vuelve a comprobar los permisos. Los catálogos de los selectores
proceden de PostgreSQL. Ver [documentación de administración](../docs/ADMINISTRACION.md).

La sesión persiste en sessionStorage guardando solo el JWT y se recupera mediante /me antes de mostrar contenido privado. La entrada `/` redirige según la sesión y `/login` permanece pública. El layout privado contiene Dashboard, Documentos, Movimientos, Tipos documentales y Ubicaciones; SíseVe exige además autorización individual y clave por operación. Usuarios, Roles, Oficinas y la administración de SíseVe tienen guard de Administrador. Las rutas inexistentes muestran 404. Al llegar a exp o recibir 401 autenticado, se limpia la sesión; la recarga no extiende los 900 segundos del backend. Los fallos de red bloquean la pantalla privada y permiten reintentar.

sessionStorage es accesible ante XSS y normalmente dura la sesión de la pestaña. Cerrar sesión elimina el token local, pero no lo revoca en Express. No hay cookies, sesiones de servidor ni renovación. Ver [documentación de autenticación y resultados reales](../docs/AUTENTICACION.md).

## Tipos documentales y ubicaciones

`features/tipos-documentales` contiene catálogo, detalles y formulario administrativo.
`features/ubicaciones` contiene listados, detalles y formularios de estantes y archivadores.
Ambos utilizan API real, Zod, RHF, el gestor de sesión y los CSS Modules compartidos.
Las opciones de asignación provienen de PostgreSQL y el servidor aplica permisos.
Ver [documentación técnica](../docs/TIPOS_UBICACIONES.md).

## Mantenimiento

La separación por módulos, los archivos de las pantallas y formularios de ubicaciones,
el hook del menú móvil y las reglas que deben conservarse están descritos en
[la guía de arquitectura del código](../docs/ARQUITECTURA_CODIGO.md).
Desde la raíz del proyecto, `node frontend/scripts/auditar-documentacion.mjs --check`
comprueba que las implementaciones propias tengan documentación descriptiva.
