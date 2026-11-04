# Sistema Web Documental · I.E. Enrique Paillardelle

Aplicación React y TypeScript en Cloudflare Pages, API Express en Render y PostgreSQL en Neon. Los PDF se almacenan en Cloudflare R2 privado. El servicio productivo utiliza la base sistema_documental_produccion. Para desarrollo se utiliza sistema_web_documental_final en PostgreSQL local.

## Desarrollo

Desde backend, instala dependencias con npm ci y ejecuta npm run dev. Desde frontend, instala con npm ci y ejecuta npm run dev. Vite reenvía /api al backend local. El esquema de instalación se usa exclusivamente en una base vacía. Los cambios a una base existente se aplican explícitamente y nunca al arrancar. Consulta [la guía de base de datos](database/README.md).

## Código activo

- frontend/src/main.tsx y frontend/src/routes/AppRoutes.tsx definen la entrada y las pantallas. features agrupa autenticación, dashboard, documentos, administración y ubicaciones. public contiene fuentes y recursos estáticos.
- backend/src/server.ts inicia el servicio y backend/src/app.ts monta las rutas. modules contiene operaciones de dominio. shared/documental/nucleo.ts concentra la identidad, el alcance de consulta y los permisos.
- database/sistema_documental_instalacion.sql instala el modelo vigente. database/schema lo documenta por dominio y database/changes contiene los incrementales.
- backend/scripts y frontend/scripts contienen herramientas. Algunos scripts y fuentes se refieren a circuitos anteriores. Verifica su destino y sus consumidores antes de ejecutarlos.
- docs conserva informes y evidencias. El [inventario de fase 5](docs/LIMPIEZA_FRONTEND_FASE_5_20261103.md) distingue las rutas activas de consumidores históricos.

## Registro, delegación y PDF

Dirección, Secretaría y Usuario registran documentos Recibidos o Emitidos. Dirección parte de Pendiente de Dirección, Secretaría elige Mesa de Partes o envío a Dirección y Usuario parte de Personal. El alta permite delegar inmediatamente. Secretaría delega desde Mesa de Partes y Dirección elige entre delegar o registrar ubicación. PostgreSQL confirma alta y delegación juntas. La delegación deja constancia de la persona indicada y su observación.

El destinatario se puede buscar por nombre y oficina o indicar manualmente. La API limita las coincidencias a 20 y vuelve a validar la cuenta seleccionada al guardar. Usuario consulta sus documentos personales y delegados, dentro de su ámbito.

El autor de un registro vigente puede cargar o reemplazar el PDF tras delegarlo. Dirección y Secretaría mantienen sus permisos sobre el ámbito compartido. Usuario delegado conserva la carga y el reemplazo de sus propios archivos, con la eliminación sujeta a su permiso previo. La carga opcional se procesa después del alta. Si falla, el registro persiste y se puede reintentar desde el detalle.

## Configuración PostgreSQL

- env.ts resuelve el perfil y valida variables y URL remota antes de conectar.
- local.ts verifica loopback, base local, puerto, esquema y ausencia de rama Neon. También se usa desde herramientas locales.
- neon.ts contiene los validadores de URL e identidad remotas, incluyendo el TLS y la rama esperados.
- database.ts crea el pool, valida cada conexión nueva y usa la identidad verificada al arrancar.
- esquema.ts reúne las sondas comunes de documentos y PDF. Neon añade la comprobación de miembros del ámbito.

## Pruebas y publicación

Ejecuta typecheck, lint y build en cada proyecto. Para el backend usa npm test y npm run test:revision:local con PostgreSQL 18 disponible para el ejecutor aislado. Para el frontend usa npm test.

El despliegue usa main en GitHub, Render con el API compilado y Pages con frontend/dist. Compila el frontend con VITE_API_URL del API público. Aplica primero los incrementales requeridos y comprueba el commit activo en Render antes de cargar Pages. El almacenamiento productivo usa el prefijo produccion/ en R2.

Consulta [la publicación de la base productiva](docs/PUBLICACION_BASE_LIMPIA_20261103.md) y [la gestión de tipos propios](docs/CORRECCION_TIPOS_DOCUMENTALES_20261103.md) para el historial reciente.
