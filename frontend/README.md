# Frontend documental

Aplicación React para consultar y gestionar documentos según los permisos de la API. [Volver al proyecto](../README.md).

## Instalación y configuración

Requiere Node.js 24.x y npm. Desde este directorio:

```sh
npm ci
npm run dev
```

Abrir [localhost:5173](http://localhost:5173). `vite.config.ts` fija ese puerto y reenvía `/api` a `http://127.0.0.1:3000`. Iniciar el backend en otra terminal.

La variable pública de conexión es **`VITE_API_URL`**. Copiar `.env.example` como `.env` cuando sea necesario: vacía para el proxy local o el origen HTTPS de Render para producción, sin `/api` y sin barra final. Vite la incorpora al compilar; cambiarla exige volver a construir y publicar. Nunca colocar credenciales PostgreSQL, JWT ni R2 en variables `VITE_*`.

## Comandos

| Comando desde `frontend/` | Uso |
|---|---|
| `npm run dev` | Servidor Vite de desarrollo |
| `npm run lint` | ESLint de fuentes y herramientas |
| `npm run typecheck` | Verifica proyectos TypeScript; genera metadatos incrementales ignorados |
| `npm test` | Contratos, rutas, sesión, PDF, dashboard, tema y Excel |
| `npm run build` | TypeScript y Vite; salida `dist/` |
| `npm run preview` | Inspección local del build; no es servidor de producción |

La suite predeterminada usa `node:test`; no abre navegador ni conecta con producción. Las respuestas de las pruebas se generan en memoria; el renderizado de HTML no sustituye una comprobación visual en navegador.

## Estructura

- `src/main.tsx`: entrada de React y estilos generales.
- `src/routes/AppRoutes.tsx`: rutas, carga diferida y barreras de sesión y perfil.
- `src/api/client.ts`: transporte JSON y descargas, validación Zod y notificación de 401. `conectividad.ts` acota esperas y reintentos; `documental.ts` agrupa solicitudes y `documental.schemas.ts` valida sus respuestas.
- `src/features/auth`: formulario, contexto, hook y máquina de sesión.
- `src/features/documentos`: listado, alta, edición, detalle, destinatarios, ubicaciones, PDF y Excel.
- `src/features/dashboard`: indicadores y gráficos por perfil.
- `src/features/usuarios`: administración vigente de cuentas, oficinas, roles, tipos y relevos.
- `src/features/ubicaciones`: árbol personal de estantes y archivadores.
- `src/components/layout` y `src/components/ui`: navegación, diálogos, carga y controles comunes.
- `src/hooks` y `src/lib`: consultas cancelables, fechas, tema, perfiles e historial.
- `src/index.css`: tokens, tipografía y reglas globales. `*.module.css` limita estilos por componente.
- `public/`: iconos, IBM Plex Sans y licencias.

El frontend usa permisos del detalle para mostrar acciones; API y PostgreSQL los comprueban al escribir. Ocultar un botón no autoriza una operación. `useConsulta` descarta resultados de otra cuenta, filtro o revisión de acceso.

## Estilos y publicación

Los comentarios de sección identifican estructura, contenido, estados, tema y adaptación de pantalla. El orden de reglas conserva la cascada. Las fuentes se sirven localmente con sus licencias.

Cloudflare Pages publica `dist/`, con raíz `frontend` y comando `npm ci && npm run build`. Configurar `VITE_API_URL` antes de compilar. La [guía manual](../documentacion-publica/DESPLIEGUE_MANUAL.md) explica CORS, rutas SPA y R2.

## Atención documental (26/11/2026)

El detalle incorpora `AtencionDocumento`, con acciones individuales, correcciones propias, visor PDF y recorrido cronológico. El contrato se valida en `features/documentos/api/atencion.api.ts`; el servidor concede las capacidades. Se conserva el selector «Delegado a mí» y el formulario habitual de relacionados.

Revisión local con backend en 3000 y Vite en 5173. También puede revisarse una compilación con `npm run build` y `npm run preview -- --port 5174`; conserva el proxy API local. Resultados concretos y límites en `docs/ATENCION_SEGUIMIENTO_DOCUMENTAL_20261126.md`.
