# Sistema Web Documental — I.E. Enrique Paillardelle

## Despliegue vigente

Backend convencional Node.js 24 y Express en Render Free; frontend estático en
Cloudflare Pages; PostgreSQL directo en Neon. La preparación y las pruebas públicas
usan exclusivamente la rama `qa-pruebas`. Workers e Hyperdrive fueron retirados del
backend. R2 queda reservado para la etapa posterior de respaldos.
Consultar [la guía operativa de Render y Pages](docs/DESPLIEGUE_RENDER_PAGES.md).
Los informes anteriores de Workers se conservan como documentación histórica.

## Stack aprobado

Frontend: React, TypeScript, Vite, Tailwind CSS, React Router, React Hook Form,
Zod, Fetch API, CSS Modules y ESLint.

Backend: Node.js, Express, TypeScript, PostgreSQL, `pg`, JWT con `jsonwebtoken`,
`scrypt` de `node:crypto`, Zod, Helmet, `tsx` y ESLint.

PostgreSQL utiliza `pg` y SQL directo parametrizado, sin ORM. Fetch API, CSS Modules
y `scrypt` no necesitan dependencias independientes. Se conservan `dotenv` y
`express-rate-limit`, que ya forman parte de la implementación existente.
Los paquetes de tipos y el soporte de ESLint para TypeScript son herramientas de
desarrollo del stack.

No retirar tecnologías aprobadas porque todavía no tengan consumidores. Consultar
al usuario antes de introducir tecnologías distintas. No modificar la base de
datos ni desarrollar funcionalidades fuera del alcance autorizado.

## Arquitectura del frontend

Arquitectura modular por funcionalidades dentro de `frontend/src/`:

- `api/`: infraestructura HTTP compartida.
- `assets/`: recursos de la aplicación.
- `components/layout/` y `components/ui/`: componentes compartidos.
- `features/`: `auth`, `dashboard`, `documentos`, `movimientos`, `oficinas`, `roles`,
  `siseve`, `tipos-documentales`, `ubicaciones` y `usuarios`.
- `hooks/`, `lib/`, `routes/` y `types/`: elementos comunes según responsabilidad.
- `App.tsx` y `main.tsx`: composición y entrada de la aplicación.

Cada funcionalidad utiliza `components/`, `pages/`, `hooks/`, `api/` o `services/`,
`schemas/`, `types/` y `styles/` cuando haya archivos que lo requieran. Mantener
estilos exclusivos dentro del módulo y globales centralizados en `src/index.css`.
Evitar concentrar nueva lógica en `App.tsx`. No crear carpetas vacías innecesarias.

## Arquitectura del backend

Monolito modular por capas en `backend/src/`. Conservar `config/`, `middlewares/`,
`modules/`, `shared/`, `app.ts` y `server.ts`. Los módulos previstos son los mismos
del frontend: `auth`, `roles`, `oficinas`, `usuarios`, `tipos-documentales`, `ubicaciones`,
`documentos`, `movimientos`, `siseve` y `dashboard`.

`Routes → Controllers → Services → Repositories → PostgreSQL`

- Routes: endpoints y middlewares.
- Controllers: solicitudes y respuestas HTTP; sin SQL directo.
- Services: reglas de negocio.
- Repositories: acceso a PostgreSQL y consultas parametrizadas.
- Schemas/DTOs: validación y contratos de entrada y salida.
- Mappers: transformación de modelos y respuestas cuando sea necesario.

Aplicar SOLID y separación de responsabilidades. Ubicar elementos compartidos en
carpetas comunes adecuadas y evitar duplicación. No trasladar archivos funcionales
solo para reproducir visualmente una estructura de referencia.

## Calidad y documentación

Usar nombres claros, funciones acotadas y TypeScript coherente. Documentar
componentes, funciones y métodos importantes mediante JSDoc/TSDoc cuando
corresponda. Explicar reglas de negocio, validaciones y operaciones complejas,
sin repetir instrucciones evidentes. Mantener documentación y código sincronizados.

Ambos proyectos tienen `eslint.config.js` con reglas recomendadas de ESLint y
typescript-eslint. Se permiten parámetros no utilizados con prefijo `_` para
conservar las firmas HTTP de Express. Se excluyen dependencias y código generado.
ESLint reemplaza a Oxlint en el frontend.

## Instalación y comprobaciones

Ejecutar `npm ci` en `frontend/` y `backend/` para reproducir sus archivos de bloqueo.
El entorno verificado utiliza Node.js 24.21.0 y npm 11.19.0.

En ambos proyectos:

```sh
npm run typecheck
npm run lint
npm run build
```

Para desarrollo, ejecutar `npm run dev` en cada proyecto. El backend mantiene su
configuración privada y su conexión mediante `pg`.

## Estado actual: autenticación y navegación integradas

Los módulos Roles, Oficinas y Usuarios están implementados sobre el esquema real,
con endpoints exclusivos de Administrador y navegación en el shell autenticado.
Consultar [docs/ADMINISTRACION.md](docs/ADMINISTRACION.md) para reglas, API y pruebas,
y [docs/CAMBIOS_ADMINISTRACION.md](docs/CAMBIOS_ADMINISTRACION.md) para los archivos.

- Dependencias directas sin conflictos reportados por `npm ls --depth=0`.
- Manifiestos y archivos de bloqueo sincronizados en ambos proyectos.
- TypeScript y ESLint correctos en ambos proyectos; backend compilado.
- React Router implementa /, /login, /dashboard protegido y 404, con redirecciones.
- Los módulos administrativos añaden /roles, /oficinas y /usuarios con páginas de
  listado, creación, detalle y edición. Solo Administrador ve y accede a estas rutas.
- React Hook Form y Zod validan el formulario y los contratos de respuestas existentes.
- Tailwind 4.3.3 integrado con Vite 8.3.4; CSS Modules encapsula login y perfil.
- Compilación completa del frontend correcta; el login utiliza estilos reales de su módulo.
- `App.tsx` compone las rutas. AuthProvider y AuthSession comparten estado y persisten
  solo el JWT en sessionStorage; /me valida la recuperación antes de mostrar el panel.
- Autenticación backend con tipos internos/públicos separados y mapper explícito.
- Duración JWT conservada en 900 segundos, compartida entre firma y respuesta.
  `JWT_EXPIRES_IN` no controlaba la duración y se retiró del esquema de configuración;
  no se modificó el entorno privado ni se activó una política de vencimiento distinta.
- PostgreSQL verificado mediante consultas de lectura, sin modificar datos ni esquema.
- Acceso real verificado con una cuenta autorizada introducida por el usuario en el
  navegador, incluyendo recarga, recuperación, redirecciones y cierre de sesión.

La arquitectura, seguridad, pruebas reales y manifiesto de la integración están en
[docs/AUTENTICACION.md](docs/AUTENTICACION.md). La revisión anterior se conserva como
informe histórico en [docs/REVISION_CODIGO.md](docs/REVISION_CODIGO.md).

## Pruebas de regresión

`npm test` en cada proyecto ejecuta pruebas nativas de Node.js, sin tecnologías
adicionales. El backend se compila antes de sus pruebas; su pool se sustituye por
datos ficticios. El frontend verifica transporte y gestor de sesión con adaptadores
aislados. Estas regresiones complementan la prueba positiva real con PostgreSQL.

`npm run test:admin` en backend ejecuta HTTP y SQL reales dentro de ROLLBACK y exige
autorización explícita mediante ADMIN_WRITE_TESTS=ROLLBACK_AUTHORIZED. No altera el
esquema ni deja registros de QA; las secuencias pueden avanzar, como se advirtió y
autorizó. El detalle de ejecución segura está en docs/ADMINISTRACION.md.

En backend, `npm run check:db` verifica identidad, metadatos y resúmenes agregados
con una transacción READ ONLY y ROLLBACK. Usa el entorno local sin imprimir secretos.

Opcionalmente, para reproducir la QA visual aislada de la revisión anterior, compilar backend y ejecutar
`node tests/visual-server.mjs` desde backend y frontend en dos terminales.
Abrir `http://127.0.0.1:5174`. Las credenciales ficticias se definen en el verificador
del backend y no corresponden a una cuenta real. Los puertos 3107 y 5174 y su proxy
solo se utilizan en esos procesos de prueba; detenerlos con Ctrl+C.

La sesión conserva el vencimiento absoluto del JWT: recargar no concede otros 900
segundos. sessionStorage normalmente termina con la pestaña y es accesible a JavaScript,
por lo que no protege ante XSS. Logout limpia el navegador, pero no revoca una copia
del JWT en el servidor. No se implementaron cookies, sesiones de servidor, refresh
tokens ni revocación individual del token al cerrar sesión. Los módulos documentales
implementados posteriormente se describen en las secciones siguientes.

## Tipos documentales y ubicaciones físicas

Implementados catálogo institucional, estantes y archivadores con permisos por
responsable, consulta de Dirección y administración/reasignación institucional.
El cambio autorizado estantes.oficina_id mantiene fija la oficina del estante.
Consultar [reglas, endpoints y pruebas](docs/TIPOS_UBICACIONES.md) y
[manifiesto de archivos](docs/CAMBIOS_TIPOS_UBICACIONES.md).


## Documentos y movimientos documentales

Implementados sobre el esquema de cinco estados aprobado y aplicado mediante autorizacion expresa.
El registro, las decisiones de Direccion, la salida fisica, recepcion, rechazo, recuperacion,
cancelacion y anulacion conservan custodia e historial. El detalle de contratos, permisos,
pruebas reales y limites esta en [docs/DOCUMENTOS_MOVIMIENTOS.md](docs/DOCUMENTOS_MOVIMIENTOS.md).
La mencion anterior a ausencia de modulos documentales describe la etapa historica de autenticacion.

Desde backend, `npm run test:migracion-documental` requiere
`VALIDAR_FLUJO_DOCUMENTAL=ROLLBACK_Y_QA_AISLADA`. Crea una base QA efimera con solo el
esquema y los catalogos institucionales; no copia cuentas personales. Las escrituras se
confirman exclusivamente en QA y la base se elimina al terminar. Compara estructura y
huellas de datos de la base institucional antes y despues. No vuelve a aplicar la migracion
si ya detecta las columnas aprobadas. Necesita pg_dump/psql de PostgreSQL 18 y permiso
CREATEDB del entorno de pruebas. `npm test` continua ejecutando regresiones aisladas.


## SíseVe

Implementado el módulo restringido con autorización individual y contraseña compartida
verificadas en cada operación. Administración y contenido están separados; ser Administrador
no concede acceso documental. El usuario aprobó el prefijo SISEVE y se actualizó el catálogo
sin cambios de esquema ni generador paralelo. Ver [docs/SISEVE.md](docs/SISEVE.md).

El Administrador debe configurar privadamente la clave institucional y las autorizaciones en
`/siseve/administracion`. No se dejaron claves ni autorizaciones de QA en la base real.
`npm run test:siseve` en backend ejecuta la integración real aislada, con la misma guarda
VALIDAR_FLUJO_DOCUMENTAL=ROLLBACK_Y_QA_AISLADA documentada arriba.

## Revisión integral del 22 de octubre de 2026

Los diez módulos se revisaron mediante análisis de código, HTTP directo, PostgreSQL QA
y navegador. El estado por módulo, las correcciones, los resultados y los pendientes
para habilitación institucional están en [docs/REVISION_FINAL.md](docs/REVISION_FINAL.md).
La evidencia estructurada está en [docs/RESULTADOS_REVISION_FINAL.json](docs/RESULTADOS_REVISION_FINAL.json).

`npm run test:revision-final` desde backend ejecuta la revisión nueva con una base QA
efímera y Chrome. No debe confundirse una validación funcional QA con una habilitación
institucional: siguen pendientes los privilegios mínimos de PostgreSQL y la configuración
privada de la clave adicional SíseVe en el entorno institucional.

## Optimización técnica final

Las pantallas utilizan carga diferida por rutas con React.lazy/Suspense; el layout y
los guards conservan la autorización existente. El diagnóstico de bundles, reducción
de solicitudes, contraste, pruebas del build productivo y pendientes de producción
están en [docs/OPTIMIZACION_FINAL.md](docs/OPTIMIZACION_FINAL.md).
Desde frontend, `npm run analyze:bundle -- despues` genera la medición actual.

## Organización y documentación del código

La responsabilidad de las capas, los diez módulos, la sesión, la circulación y las
reglas de confidencialidad están descritas en [docs/ARQUITECTURA_CODIGO.md](docs/ARQUITECTURA_CODIGO.md).
El informe de refactorización, su inventario y los resultados de regresión están en
[docs/REFACTORIZACION_CODIGO.md](docs/REFACTORIZACION_CODIGO.md).

Desde la raíz, `node frontend/scripts/auditar-documentacion.mjs --check` comprueba
la presencia de documentación de implementaciones propias en `src`, `tests` y
`scripts`, incluidos métodos, constructores y callbacks. La guía técnica distingue
esta comprobación automática de la revisión de precisión de los comentarios.
