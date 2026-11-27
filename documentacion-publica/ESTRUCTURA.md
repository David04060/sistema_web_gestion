# Estructura del Sistema Web Documental

[Inicio](../README.md) · [Flujos](FUNCIONAMIENTO.md) · [Guías públicas](README.md)

## Carpetas y subcarpetas

```text
backend/ — API Express, configuración, pruebas y herramientas necesarias.
  scripts/ — Ejecutor aislado de pruebas, hash inicial y limpieza de PDF.
  src/ — Código ejecutable del servidor.
    config/ — Entorno, conexiones y verificación del destino y esquema PostgreSQL.
    middlewares/ — Controles comunes antes de responder: sesión, roles, CORS y errores.
    modules/ — Operaciones agrupadas por función del sistema.
      auth/ — Acceso: rutas, validaciones, consultas y perfil público.
      dashboard/ — Cifras y series autorizadas para cada perfil.
      documentos/ — Consultas, registro, delegación, ubicación, historial y Excel.
      documentos-pdf/ — Carga, consulta y conservación de adjuntos privados.
      usuarios/ — Administración de cuentas, oficinas, tipos y relevo.
    shared/ — Reglas utilizadas por varios módulos.
      admin/ — Validaciones comunes de identificadores y nombres.
      documental/ — Autorización, transacciones y presentación de situaciones.
      http/ — Validación de entradas y errores públicos.
      security/ — Contraseñas, comprobantes de sesión y códigos de rol.
  tests/ — Pruebas unitarias e integración con PostgreSQL temporal.
    fixtures/ — Datos sintéticos y contrato de rutas HTTP.
    helpers/ — Barreras de aislamiento, suites y adaptadores de prueba.
database/ — Punto de entrada y guías de instalación PostgreSQL.
  README.md — Orden de preparación y diferencias entre las presentaciones SQL.
  CUENTAS_MANUALES.md — Alta inicial de Superadministrador y pertenencias por rol.
  instalar.sql — Entrada recomendada; incluye los bloques de instalacion/.
  sistema_documental_instalacion.sql — Alternativa completa en un solo archivo.
  changes/ — Migraciones para adaptar estructuras existentes; no se ejecutan tras instalar desde cero.
  instalacion/ — Bloques ejecutados por instalar.sql en orden de dependencias.
    funciones/ — Reglas SQL: cada archivo define una función y sus efectos.
    tablas/ — Tablas y secuencias agrupadas por finalidad.
    sesion.sql — Opciones de sesión y codificación UTF-8.
    claves.sql — Claves que identifican filas y evitan duplicados.
    indices.sql — Índices de búsqueda y restricciones de unicidad adicionales.
    triggers.sql — Reglas automáticas que validan cambios y registran efectos.
    relaciones.sql — Referencias válidas entre tablas.
    vistas.sql — Consultas guardadas de documentos ordinarios y anulados.
    catalogos.sql — Roles, oficinas y ámbito compartido iniciales.
  schema/ — Referencia de definiciones por tema; no se ejecuta como instalador.
    INVENTARIO.md — Lista de objetos y columnas.
    *.schema.sql — Identidad, configuración, documentos, PDF, auditoría e integridad.
docs/ — Informes y evidencias internos, separados de las guías públicas.
documentacion-publica/ — Guías de instalación, funcionamiento, estructura y despliegue.
frontend/ — Aplicación React, configuración Vite y pruebas.
  public/ — Recursos que Vite copia sin transformar.
    fuentes/ — Tipografía alojada por el propio sitio.
      ibm-plex-sans/ — Archivo de fuente, licencia y metadatos de distribución.
  src/ — Código del navegador.
    api/ — Solicitudes HTTP y validación de respuestas.
    assets/ — Imagen institucional importada por la aplicación.
    components/ — Elementos compartidos por pantallas.
      icons/ — Trazos de iconos decorativos.
      layout/ — Distribución de navegación y contenido.
      ui/ — Carga, errores, tema y estilos comunes.
    features/ — Pantallas organizadas por función.
      auth/ — Formulario, perfil y estado de sesión.
        api/ — Solicitudes de acceso y perfil.
        context/ — Sesión compartida por el árbol React.
        hooks/ — Acceso de componentes al contexto de sesión.
        pages/ — Pantalla de inicio de sesión.
        schemas/ — Campos válidos de acceso y respuesta.
        services/ — Recuperación, vencimiento y almacenamiento de sesión.
        styles/ — Presentación del formulario de acceso.
      dashboard/ — Resumen por perfil.
        components/ — Gráficos, tablas equivalentes y selector mensual.
        pages/ — Consulta y presentación del panel.
        styles/ — Tarjetas y distribución del resumen.
      documentos/ — Registro, consulta y acciones documentales.
        api/ — Transporte y control de revisión de PDF.
        components/ — Formulario, destinos, ubicación, historial, PDF y Excel.
        pages/ — Listado, formulario y detalle del documento.
      ubicaciones/ — Catálogo personal de lugares.
        pages/ — Árbol de estantes y contenido.
      usuarios/ — Administración disponible según el perfil.
        components/ — Formularios de tipo documental y relevo.
        pages/ — Listas, creación y detalle de cuentas y oficinas.
    hooks/ — Consultas y menú adaptados al ciclo de vida React.
    lib/ — Fechas, perfiles, tema e historia legible.
    routes/ — Direcciones, carga de pantallas y barreras de sesión.
  tests/ — Pruebas de contratos, sesión y HTML de componentes.
    fixtures/ — Componentes usados exclusivamente por las pruebas de HTML.
    helpers/ — Carga de módulos reales y reloj de sesión simulado.
```

## Cómo se conectan

React inicia en `main.tsx`, obtiene sesión mediante `AuthProvider` y elige la pantalla en
`AppRoutes.tsx`. Las páginas llaman a `api/documental.ts` o a sus adaptadores de autenticación
y PDF. Express recibe la petición en `app.ts`, valida la sesión y la envía a las rutas del módulo.
Las operaciones usan `shared/documental/nucleo.ts` para comprobar cuenta, alcance y revisión
y ejecutar la transacción PostgreSQL. Las funciones y triggers SQL mantienen integridad e historia.
Los archivos PDF se guardan en R2 privado; Excel se construye como un archivo temporal.

## Propósito de cada archivo

Los enlaces apuntan a los archivos principales del repositorio local. Los archivos de versiones de dependencias y
recursos binarios se distribuyen completos; no se editan como código de aplicación.

### Raíz

- [.editorconfig](../.editorconfig): Define UTF-8, saltos de línea y sangría compartida entre editores.
- [.gitignore](../.gitignore): Evita incorporar configuración privada, dependencias y resultados generados.
- [.prettierrc.json](../.prettierrc.json): Fija formato de dos espacios, comillas simples y ancho orientativo de 110 caracteres.
- [README.md](../README.md): Guía de propósito, preparación y comandos del directorio.

### backend

- [.env.example](../backend/.env.example): Plantilla de variables con marcadores, sin credenciales reales.
- [.env.neon.example](../backend/.env.neon.example): Plantilla de variables con marcadores, sin credenciales reales.
- [.env.neon.qa.example](../backend/.env.neon.qa.example): Plantilla de variables con marcadores, sin credenciales reales.
- [.env.render.example](../backend/.env.render.example): Plantilla de variables con marcadores, sin credenciales reales.
- [.node-version](../backend/.node-version): Versión Node usada por el servicio.
- [README.md](../backend/README.md): Guía de propósito, preparación y comandos del directorio.
- [eslint.config.js](../backend/eslint.config.js): Define las comprobaciones del servidor y sus pruebas y omite dependencias y archivos generados.
- [package-lock.json](../backend/package-lock.json): Versiones e integridad de dependencias; npm ci instala este conjunto reproducible.
- [package.json](../backend/package.json): Declara dependencias, versión de Node y comandos de instalación, ejecución y pruebas del servidor.
- [tsconfig.json](../backend/tsconfig.json): Define la compilación estricta de TypeScript del servidor a JavaScript ejecutable por Node.

### backend/scripts

- [generar-hash-local.mjs](../backend/scripts/generar-hash-local.mjs): Lee una contraseña de forma oculta en terminal y genera la huella compatible con el servidor.
- [limpiar-pdf.mjs](../backend/scripts/limpiar-pdf.mjs): Ejecuta la limpieza de PDF registrados por el sistema y cierra las conexiones al terminar.
- [probar-backend-aislado.mjs](../backend/scripts/probar-backend-aislado.mjs): Crea PostgreSQL temporal con identidad comprobada, instala el esquema, ejecuta pruebas y retira el entorno.

### backend/src

- [app.ts](../backend/src/app.ts): Conecta las rutas de la API con autenticación, protección de solicitudes y mensajes de error.
- [server.ts](../backend/src/server.ts): Inicia la API tras comprobar PostgreSQL y cierra conexiones y mantenimiento al detenerse.

### backend/src/config

- [database.ts](../backend/src/config/database.ts): Comparte conexiones PostgreSQL y verifica el destino de cada conexión nueva.
- [env.ts](../backend/src/config/env.ts): Lee y valida la configuración elegida antes de conectar con servicios externos.
- [esquema.ts](../backend/src/config/esquema.ts): Comprueba que existen las columnas y funciones SQL que necesita la API, sin leer documentos.
- [local.ts](../backend/src/config/local.ts): Comprueba que la conexión local apunta a la base documental esperada en este equipo.
- [neon.ts](../backend/src/config/neon.ts): Comprueba el host, la base, la cuenta y el cifrado de las conexiones remotas.

### backend/src/middlewares

- [auth.middleware.ts](../backend/src/middlewares/auth.middleware.ts): Identifica la cuenta de una petición protegida o responde que la sesión no es válida.
- [cors.middleware.ts](../backend/src/middlewares/cors.middleware.ts): Permite solicitudes del navegador solo desde los sitios configurados para esta API.
- [error.middleware.ts](../backend/src/middlewares/error.middleware.ts): Convierte fallos de entrada, permisos o base de datos en mensajes seguros para la interfaz.
- [roles.middleware.ts](../backend/src/middlewares/roles.middleware.ts): Comprueba un rol después de autenticar y distingue falta de sesión de falta de permiso.

### backend/src/modules/auth

- [auth.controller.ts](../backend/src/modules/auth/auth.controller.ts): Responde al inicio de sesión y a la consulta del perfil de la cuenta autenticada.
- [auth.mapper.ts](../backend/src/modules/auth/auth.mapper.ts): Selecciona los datos del perfil que puede recibir el navegador, sin incluir la contraseña guardada.
- [auth.repository.ts](../backend/src/modules/auth/auth.repository.ts): Busca las cuentas necesarias para autenticar; entrega datos internos solo al servicio de acceso.
- [auth.routes.ts](../backend/src/modules/auth/auth.routes.ts): Publica login y perfil y limita los intentos de acceso repetidos desde una dirección IP.
- [auth.schema.ts](../backend/src/modules/auth/auth.schema.ts): Define qué campos acepta el login y rechaza valores incompletos o adicionales.
- [auth.service.ts](../backend/src/modules/auth/auth.service.ts): Comprueba contraseñas y vuelve a validar la cuenta al recibir un identificador de sesión.
- [auth.types.ts](../backend/src/modules/auth/auth.types.ts): Distingue los datos internos de una cuenta del perfil y la sesión enviados a la interfaz.

### backend/src/modules/dashboard

- [dashboard.documental.ts](../backend/src/modules/dashboard/dashboard.documental.ts): Calcula cifras y series mensuales únicamente sobre cuentas y documentos que el perfil puede consultar.

### backend/src/modules/documentos-pdf

- [pdf.documental.ts](../backend/src/modules/documentos-pdf/pdf.documental.ts): Gestiona preparación, confirmación, lectura y retirada de PDF; comprueba permisos y revisión del documento.
- [pdf.limpieza.ts](../backend/src/modules/documentos-pdf/pdf.limpieza.ts): Retira de R2 los archivos sin vínculo vigente y conserva una tarea para reintentar los fallos.
- [pdf.maintenance.ts](../backend/src/modules/documentos-pdf/pdf.maintenance.ts): Programa la limpieza de PDF al arrancar y cada cinco minutos; evita ejecuciones simultáneas.
- [pdf.retencion.ts](../backend/src/modules/documentos-pdf/pdf.retencion.ts): Retira PDF de documentos anulados cuando vence su conservación y confirma la eliminación en PostgreSQL.
- [pdf.routes.ts](../backend/src/modules/documentos-pdf/pdf.routes.ts): Publica las solicitudes de metadatos, carga, confirmación, eliminación y lectura de PDF.
- [pdf.schema.ts](../backend/src/modules/documentos-pdf/pdf.schema.ts): Valida nombre, tamaño, tipo y revisión del PDF antes de preparar una carga.
- [pdf.storage.ts](../backend/src/modules/documentos-pdf/pdf.storage.ts): Conecta con el almacenamiento privado R2, verifica archivos y crea enlaces de duración limitada.

### backend/src/modules/documentos

- [auditoria.documental.ts](../backend/src/modules/documentos/auditoria.documental.ts): Selecciona cambios comprensibles del historial sin mostrar claves de archivos ni datos internos.
- [documental.schema.ts](../backend/src/modules/documentos/documental.schema.ts): Define entradas válidas para registrar, buscar, corregir, delegar, ubicar y anular documentos.
- [documentos.consultas.ts](../backend/src/modules/documentos/documentos.consultas.ts): Consulta documentos, destinos e historia dentro del alcance permitido a la cuenta.
- [documentos.escrituras.ts](../backend/src/modules/documentos/documentos.escrituras.ts): Registra y modifica documentos con permiso, revisión y transacciones que deshacen cualquier operación incompleta.
- [documentos.operaciones.ts](../backend/src/modules/documentos/documentos.operaciones.ts): Conserva el punto de acceso público a las consultas, escrituras y validaciones documentales.
- [documentos.routes.ts](../backend/src/modules/documentos/documentos.routes.ts): Recibe solicitudes documentales, valida sus datos y llama a la operación correspondiente.
- [exportacion.controller.ts](../backend/src/modules/documentos/exportacion.controller.ts): Entrega el Excel solicitado y limpia el archivo temporal al terminar o cancelar la descarga.
- [exportacion.excel.ts](../backend/src/modules/documentos/exportacion.excel.ts): Construye el Excel con fechas de Perú, texto seguro y control de exportaciones simultáneas.
- [exportacion.repository.ts](../backend/src/modules/documentos/exportacion.repository.ts): Consulta los documentos exportables del mes, respetando permisos y límites de tamaño.
- [fecha-registro.ts](../backend/src/modules/documentos/fecha-registro.ts): Valida fechas de búsqueda y obtiene el intervalo correspondiente en el calendario de Perú.
- [ubicacion.reglas.ts](../backend/src/modules/documentos/ubicacion.reglas.ts): Comparte el criterio SQL de pertenencia y actividad de una ubicación.

### backend/src/modules/usuarios

- [administracion.operaciones.ts](../backend/src/modules/usuarios/administracion.operaciones.ts): Administra cuentas, roles y contraseñas y conserva la historia al cambiar su actividad o pertenencia.
- [administracion.routes.ts](../backend/src/modules/usuarios/administracion.routes.ts): Recibe solicitudes de configuración, valida sus campos y llama a las operaciones autorizadas.
- [administracion.schema.ts](../backend/src/modules/usuarios/administracion.schema.ts): Define los campos admitidos al administrar cuentas, oficinas, tipos y ubicaciones.
- [configuracion.operaciones.ts](../backend/src/modules/usuarios/configuracion.operaciones.ts): Gestiona roles visibles, oficinas, tipos documentales y ubicaciones dentro de los permisos de cada cuenta.
- [relevo.operaciones.ts](../backend/src/modules/usuarios/relevo.operaciones.ts): Cambia al responsable de una oficina sin trasladar documentos y conserva el origen de los tipos heredados.

### backend/src/shared/admin

- [admin.schema.ts](../backend/src/shared/admin/admin.schema.ts): Valida identificadores y normaliza nombres de catálogos sin cambiar su significado.

### backend/src/shared/documental

- [nucleo.ts](../backend/src/shared/documental/nucleo.ts): Reúne la cuenta actual, las operaciones indivisibles y los permisos de lectura y escritura documental.
- [presentacion.ts](../backend/src/shared/documental/presentacion.ts): Asocia cada situación documental con la etiqueta que se muestra a la persona usuaria.

### backend/src/shared/http

- [HttpError.ts](../backend/src/shared/http/HttpError.ts): Representa un rechazo previsto con su estado HTTP y un mensaje apto para mostrar en pantalla.
- [validar.ts](../backend/src/shared/http/validar.ts): Comprueba una entrada con su esquema y comunica qué campo no cumple las reglas.

### backend/src/shared/security

- [jwt.ts](../backend/src/shared/security/jwt.ts): Firma y verifica el comprobante de sesión, con cuenta, versión y vencimiento.
- [password.ts](../backend/src/shared/security/password.ts): Genera y comprueba una huella de contraseña; nunca necesita guardar la contraseña original.
- [roles.ts](../backend/src/shared/security/roles.ts): Relaciona los códigos fijos de autorización con sus nombres visibles para las consultas SQL.

### backend/tests

- [administracion-local.test.mjs](../backend/tests/administracion-local.test.mjs): Comprueba altas, permisos administrativos, cambios de contraseña y conservación de la historia.
- [aislamiento-real.test.mjs](../backend/tests/aislamiento-real.test.mjs): Comprueba la identidad de la instancia temporal y el rechazo de bases o ejecuciones ajenas.
- [alta-delegada.local.test.mjs](../backend/tests/alta-delegada.local.test.mjs): Comprueba registro con delegación inicial, destinos compatibles y sugerencias de cuentas.
- [autenticacion-documentos.test.mjs](../backend/tests/autenticacion-documentos.test.mjs): Comprueba una autenticación SQL por petición y las barreras de consulta y escritura del destinatario.
- [auth.test.mjs](../backend/tests/auth.test.mjs): Comprueba contraseña, sesión, errores y límites de acceso con consultas simuladas.
- [catalogo-pruebas.mjs](../backend/tests/catalogo-pruebas.mjs): Enumera las pruebas disponibles y las suites a las que pertenece cada una.
- [concurrencia-aislada.test.mjs](../backend/tests/concurrencia-aislada.test.mjs): Comprueba que registros simultáneos reciben códigos distintos y que una revisión no se sobrescribe.
- [contratos-rutas.test.mjs](../backend/tests/contratos-rutas.test.mjs): Compara las rutas publicadas con el contrato HTTP y verifica la posición de la exportación Excel.
- [cuerpos-comprimidos.test.mjs](../backend/tests/cuerpos-comprimidos.test.mjs): Comprueba que los cuerpos comprimidos alterados no interrumpen el servidor HTTP de prueba.
- [dashboard-api.local.test.mjs](../backend/tests/dashboard-api.local.test.mjs): Comprueba por HTTP que cada perfil recibe únicamente su resumen permitido.
- [dashboard-estadisticas.local.test.mjs](../backend/tests/dashboard-estadisticas.local.test.mjs): Contrasta cifras y series del panel con documentos sintéticos de cada ámbito.
- [delegacion-local.test.mjs](../backend/tests/delegacion-local.test.mjs): Comprueba destinos de delegación por HTTP y conserva los datos iniciales mediante reversión.
- [delegacion-ubicacion-politica.local.test.mjs](../backend/tests/delegacion-ubicacion-politica.local.test.mjs): Comprueba delegación desde una ubicación y las reglas de conservación de PDF.
- [despliegue.test.mjs](../backend/tests/despliegue.test.mjs): Comprueba orígenes del navegador, rutas protegidas y límite por IP en un servidor temporal.
- [documental-nuevo.test.mjs](../backend/tests/documental-nuevo.test.mjs): Comprueba contratos, permisos, PDF y esquema del circuito documental vigente.
- [entorno-prueba.test.mjs](../backend/tests/entorno-prueba.test.mjs): Comprueba que una configuración o identidad incorrecta impide llegar a las escrituras de prueba.
- [exportacion-excel.local.test.mjs](../backend/tests/exportacion-excel.local.test.mjs): Comprueba alcance, filtros mensuales y contenido de Excel con PostgreSQL temporal.
- [exportacion-excel.test.mjs](../backend/tests/exportacion-excel.test.mjs): Comprueba formato, fechas y texto seguro de las celdas del Excel.
- [exportacion-limite.test.mjs](../backend/tests/exportacion-limite.test.mjs): Comprueba el rechazo de exportaciones que exceden el límite y la liberación del turno.
- [grupos.local.test.mjs](../backend/tests/grupos.local.test.mjs): Comprueba relaciones entre documentos, filtros del grupo y privacidad de los registros no visibles.
- [mejoras-local.test.mjs](../backend/tests/mejoras-local.test.mjs): Comprueba concurrencia, ubicaciones, administración y PDF con datos de ensayo.
- [pdf-retencion.local.test.mjs](../backend/tests/pdf-retencion.local.test.mjs): Comprueba vencimiento, reintentos y retirada de metadatos de PDF anulados sin usar R2 real.
- [pdf-storage.test.mjs](../backend/tests/pdf-storage.test.mjs): Comprueba claves, firmas y validación de PDF con almacenamiento simulado.
- [relevo.local.test.mjs](../backend/tests/relevo.local.test.mjs): Comprueba cambio de responsable, periodos históricos y tipos heredados de oficina.
- [revision-integral-local.test.mjs](../backend/tests/revision-integral-local.test.mjs): Recorre reglas documentales y administrativas en transacciones que revierten los datos de ensayo.
- [ubicaciones-documento.local.test.mjs](../backend/tests/ubicaciones-documento.local.test.mjs): Comprueba búsqueda, pertenencia, jerarquía activa y revisión al ubicar documentos.

### backend/tests/fixtures

- [base.mjs](../backend/tests/fixtures/base.mjs): Crea cuentas y documentos sintéticos en la instancia temporal comprobada.
- [rutas-vigentes.json](../backend/tests/fixtures/rutas-vigentes.json): Enumera las rutas y métodos HTTP que deben seguir disponibles.

### backend/tests/helpers

- [entorno-prueba.mjs](../backend/tests/helpers/entorno-prueba.mjs): Comprueba destino, cuenta y marca del PostgreSQL temporal antes de permitir las pruebas.
- [exigir-aislamiento.mjs](../backend/tests/helpers/exigir-aislamiento.mjs): Detiene una prueba SQL si no se ha comprobado su entorno temporal.
- [lectura-sintetica.mjs](../backend/tests/helpers/lectura-sintetica.mjs): Adapta únicamente consultas de calendario y volumen a tablas temporales con datos inventados.
- [suites.mjs](../backend/tests/helpers/suites.mjs): Agrupa las pruebas que el ejecutor aislado puede seleccionar por su finalidad.

### database

- [CUENTAS_MANUALES.md](../database/CUENTAS_MANUALES.md): Guía de creación de la primera cuenta.
- [README.md](../database/README.md): Guía de propósito, preparación y comandos del directorio.
- [instalar.sql](../database/instalar.sql): Ejecuta en orden funciones, tablas, restricciones, relaciones y catálogos en una sola transacción.
- [sistema_documental_instalacion.sql](../database/sistema_documental_instalacion.sql): Las mismas definiciones en un instalador único; se usa como alternativa al dividido.

### database/schema

- [INVENTARIO.md](../database/schema/INVENTARIO.md): Referencia de tablas, columnas, funciones, disparadores y restricciones.
- [identidad.schema.sql](../database/schema/identidad.schema.sql): Cuentas, roles, oficinas y pertenencia a ámbitos.
- [configuracion.schema.sql](../database/schema/configuracion.schema.sql): Tipos documentales y unidades de ubicación.
- [documentos.schema.sql](../database/schema/documentos.schema.sql): Registro, numeración, constancias, relaciones y vistas documentales.
- [pdf.schema.sql](../database/schema/pdf.schema.sql): Referencias de archivos, cargas, eventos y limpieza pendiente.
- [auditoria.schema.sql](../database/schema/auditoria.schema.sql): Constancias de cambios de documentos y configuración.
- [integridad.schema.sql](../database/schema/integridad.schema.sql): Permisos, protección histórica, relevo y retención de PDF.

Estos archivos permiten consultar las definiciones; no se ejecutan como pasos de instalación.
`database/changes/` contiene los scripts numerados 001 a 015 para adaptar bases existentes.
La [guía SQL](../database/README.md) explica cómo distinguirlos del instalador vigente.

### database/instalacion

- [catalogos.sql](../database/instalacion/catalogos.sql): Inserta únicamente cinco roles, dos oficinas institucionales y el ámbito compartido. No crea cuentas.
- [claves.sql](../database/instalacion/claves.sql): Identifica cada fila y evita códigos, cuentas, vínculos y ubicaciones duplicados.
- [indices.sql](../database/instalacion/indices.sql): Facilita las búsquedas y garantiza un único responsable activo y una única ubicación vigente.
- [relaciones.sql](../database/instalacion/relaciones.sql): Impide referencias a cuentas, documentos, oficinas, tipos o lugares inexistentes o incompatibles.
- [sesion.sql](../database/instalacion/sesion.sql): Fija UTF-8 y las opciones de creación; las funciones se comprueban al ejecutarlas, cuando ya existen sus tablas.
- [triggers.sql](../database/instalacion/triggers.sql): Conecta cada cambio de tabla con sus validaciones e historia; BEFORE valida y AFTER registra sus efectos.
- [vistas.sql](../database/instalacion/vistas.sql): Presenta documentos ordinarios o anulados. Estas vistas no sustituyen los permisos de cada cuenta.

### database/instalacion/funciones

- [aplicar_delegacion.sql](../database/instalacion/funciones/aplicar_delegacion.sql): Tras insertar la constancia, cierra ubicación vigente, cambia situación y registra auditoría dentro de la misma transacción.
- [aplicar_ubicacion.sql](../database/instalacion/funciones/aplicar_ubicacion.sql): Tras ubicar, actualiza la situación documental y registra la ruta histórica; no transfiere autoría.
- [asignar_codigo_documental.sql](../database/instalacion/funciones/asignar_codigo_documental.sql): Antes del alta, valida tipo y ámbito y reserva correlativo por año bajo bloqueo; devuelve NEW con código visible.
- [auditar_documento.sql](../database/instalacion/funciones/auditar_documento.sql): Registra alta o cambios de contenido/situación con actor y motivo de la transacción, preservando antes y después.
- [auditar_pdf.sql](../database/instalacion/funciones/auditar_pdf.sql): Registra eventos y auditoría PDF y encola objetos sustituidos para limpieza; no almacena binarios.
- [documento_consultable.sql](../database/instalacion/funciones/documento_consultable.sql): Recibe actor y documento; devuelve lectura ordinaria por perfil, ámbito y periodos de oficina. Secretaría no tiene consulta personal general.
- [documento_consultable_con_delegacion.sql](../database/instalacion/funciones/documento_consultable_con_delegacion.sql): Amplía la lectura ordinaria con el destinatario registrado. El resultado booleano no concede escritura.
- [documento_delegado_por.sql](../database/instalacion/funciones/documento_delegado_por.sql): Devuelve el nombre del emisor para una cuenta destinataria elegible; NULL significa que no hay acceso por esta delegación.
- [documento_periodo_cerrado.sql](../database/instalacion/funciones/documento_periodo_cerrado.sql): Indica si el documento pertenece a un periodo institucional cerrado, utilizado para impedir mutaciones históricas.
- [documento_tiene_relacion_consultable.sql](../database/instalacion/funciones/documento_tiene_relacion_consultable.sql): Indica si existe otro documento consultable en el grupo, incluida lectura por delegación. Lo usan filtros de listado y exportación.
- [documento_tiene_relacion_visible.sql](../database/instalacion/funciones/documento_tiene_relacion_visible.sql): Versión anterior del filtro de relaciones, basada en lectura ordinaria. Se conserva en el catálogo; no amplía permisos por delegación.
- [documentos_grupo.sql](../database/instalacion/funciones/documentos_grupo.sql): Recorre relaciones en ambos sentidos desde un documento y devuelve IDs del grupo. El llamador filtra cada ID por actor.
- [es_finalizacion_retencion.sql](../database/instalacion/funciones/es_finalizacion_retencion.sql): Reconoce el contexto interno de finalización de una revisión PDF; evita confundir mantenimiento con edición documental.
- [exigir_oficina_autor.sql](../database/instalacion/funciones/exigir_oficina_autor.sql): Valida al insertar que el autor documental cumple la oficina exigida para su rol.
- [finalizar_retencion_pdf.sql](../database/instalacion/funciones/finalizar_retencion_pdf.sql): Finaliza una retención identificada por documento y revisión después de la eliminación externa; registra su evento técnico.
- [impedir_borrado_documento.sql](../database/instalacion/funciones/impedir_borrado_documento.sql): Rechaza DELETE de documentos: la operación de negocio es anular y conservar historial.
- [impedir_cambio_historico.sql](../database/instalacion/funciones/impedir_cambio_historico.sql): Rechaza UPDATE/DELETE de hechos y auditorías inmutables.
- [impedir_truncado.sql](../database/instalacion/funciones/impedir_truncado.sql): Rechaza TRUNCATE de tablas documentales e históricas protegidas.
- [programar_retencion_pdf_anulado.sql](../database/instalacion/funciones/programar_retencion_pdf_anulado.sql): Al anular, registra revisión y clave con su vencimiento de retención; no borra inmediatamente R2.
- [proteger_anulacion_decidida_por_direccion.sql](../database/instalacion/funciones/proteger_anulacion_decidida_por_direccion.sql): Impide anulación por Secretaría después de decisión de Dirección; valida actor transaccional y situación previa.
- [proteger_documento_historico.sql](../database/instalacion/funciones/proteger_documento_historico.sql): Rechaza cambios documentales/PDF sobre periodos cerrados, salvo la finalización interna de retención autorizada.
- [registrar_oficina_documento.sql](../database/instalacion/funciones/registrar_oficina_documento.sql): Vincula el alta al periodo de oficina vigente del autor para permitir consulta histórica tras relevo.
- [registrar_oficina_tipo.sql](../database/instalacion/funciones/registrar_oficina_tipo.sql): Conserva la oficina de origen de un tipo documental para mapear tipos en relevos posteriores.
- [sincronizar_periodo_oficina.sql](../database/instalacion/funciones/sincronizar_periodo_oficina.sql): Al cambiar actividad u oficina, cierra el periodo anterior y abre el vigente; conserva trazabilidad de titularidad.
- [validar_delegacion.sql](../database/instalacion/funciones/validar_delegacion.sql): Antes de insertar, verifica actor, situación y destino compatible. No permite delegaciones sucesivas ni cambio de ámbito.
- [validar_documento_actualizacion.sql](../database/instalacion/funciones/validar_documento_actualizacion.sql): Protege identidad y clasificación; exige permiso, motivo y transición válida y actualiza revisión/fecha.
- [validar_estado_final.sql](../database/instalacion/funciones/validar_estado_final.sql): Trigger diferido: comprueba al confirmar que situación y hechos de delegación/ubicación sean coherentes.
- [validar_mapeo_tipo_relevo.sql](../database/instalacion/funciones/validar_mapeo_tipo_relevo.sql): Valida que origen, destino y ámbito del tipo correspondan al relevo; evita asociaciones ajenas.
- [validar_miembro_ambito.sql](../database/instalacion/funciones/validar_miembro_ambito.sql): Impide pertenencias incompatibles con rol y titularidad: ámbito compartido institucional o personal del usuario.
- [validar_pdf_permiso.sql](../database/instalacion/funciones/validar_pdf_permiso.sql): Comprueba actor, alcance y situación en INSERT/UPDATE/DELETE de metadatos PDF, incluida la excepción de mantenimiento.
- [validar_relacion.sql](../database/instalacion/funciones/validar_relacion.sql): Valida origen y nuevo documento, acceso y ausencia de autorreferencias/ciclos antes de crear la relación.
- [validar_tipo_documental.sql](../database/instalacion/funciones/validar_tipo_documental.sql): Comprueba que el creador del tipo pertenece al ámbito indicado antes de guardar el catálogo.
- [validar_ubicacion.sql](../database/instalacion/funciones/validar_ubicacion.sql): Verifica propietario, oficina, estado y jerarquía elegibles antes de registrar una ubicación histórica.
- [validar_unidad_ubicacion.sql](../database/instalacion/funciones/validar_unidad_ubicacion.sql): Valida dueño y padre de una unidad; rechaza padres ajenos y ciclos en el árbol.
- [validar_usuario_oficina.sql](../database/instalacion/funciones/validar_usuario_oficina.sql): Exige oficina compatible con rol y actividad; permite conservar asignación anterior a una oficina inactiva.

### database/instalacion/tablas

- [auditoria.sql](../database/instalacion/tablas/auditoria.sql): Historia de cambios de documentos y configuración, con actor y motivo.
- [documentos.sql](../database/instalacion/tablas/documentos.sql): Registro, numeración y constancias de delegación y relación documental.
- [identidad.sql](../database/instalacion/tablas/identidad.sql): Cuentas, roles, oficinas y pertenencia al ámbito compartido o personal.
- [pdf.sql](../database/instalacion/tablas/pdf.sql): Metadatos de PDF, cargas temporales, eventos y tareas de limpieza y retención.
- [relevo.sql](../database/instalacion/tablas/relevo.sql): Periodos de oficina y procedencia de documentos y tipos tras un relevo.
- [ubicaciones.sql](../database/instalacion/tablas/ubicaciones.sql): Tipos documentales y lugares propios, con sus ubicaciones históricas.

### documentacion-publica

- [BASE_DE_DATOS.md](../documentacion-publica/BASE_DE_DATOS.md): Guía de preparación de PostgreSQL vacío.
- [DESPLIEGUE_MANUAL.md](../documentacion-publica/DESPLIEGUE_MANUAL.md): Guía de configuración manual de los servicios.
- [ESTRUCTURA.md](../documentacion-publica/ESTRUCTURA.md): Guía de carpetas y archivos del sistema.
- [FUNCIONAMIENTO.md](../documentacion-publica/FUNCIONAMIENTO.md): Guía de flujos y reglas de acceso.
- [README.md](../documentacion-publica/README.md): Guía de propósito, preparación y comandos del directorio.

### frontend

- [.env.example](../frontend/.env.example): Plantilla de variables con marcadores, sin credenciales reales.
- [README.md](../frontend/README.md): Guía de propósito, preparación y comandos del directorio.
- [eslint.config.js](../frontend/eslint.config.js): Define las comprobaciones de código de React, Vite y herramientas JavaScript.
- [index.html](../frontend/index.html): Proporciona el punto de montaje de React, iconos y apariencia inicial antes de cargar la aplicación.
- [package-lock.json](../frontend/package-lock.json): Versiones e integridad de dependencias; npm ci instala este conjunto reproducible.
- [package.json](../frontend/package.json): Declara dependencias de la interfaz y comandos de Vite, tipos, lint y pruebas.
- [tsconfig.app.json](../frontend/tsconfig.app.json): Comprueba tipos de React y del navegador sin generar archivos JavaScript intermedios.
- [tsconfig.json](../frontend/tsconfig.json): Conecta las comprobaciones de tipos de la aplicación y de Vite.
- [tsconfig.node.json](../frontend/tsconfig.node.json): Comprueba la configuración de Vite con los tipos y reglas de Node.
- [vite.config.ts](../frontend/vite.config.ts): Compila React y estilos y reenvía /api al servidor local durante el desarrollo.

### frontend/public

- [favicon-16.png](../frontend/public/favicon-16.png): Recurso institucional utilizado por la interfaz o el navegador.
- [favicon-32.png](../frontend/public/favicon-32.png): Recurso institucional utilizado por la interfaz o el navegador.
- [icono-institucion.png](../frontend/public/icono-institucion.png): Recurso institucional utilizado por la interfaz o el navegador.
- [tema-inicial.js](../frontend/public/tema-inicial.js): Aplica la apariencia guardada antes de mostrar la página para evitar un cambio de color al arrancar.

### frontend/public/fuentes/ibm-plex-sans

- [METADATA.pb](../frontend/public/fuentes/ibm-plex-sans/METADATA.pb): Origen y metadatos de los archivos de fuente.
- [OFL.txt](../frontend/public/fuentes/ibm-plex-sans/OFL.txt): Licencia de redistribución de IBM Plex Sans.
- [manifest.json](../frontend/public/fuentes/ibm-plex-sans/manifest.json): Identifica el archivo tipográfico, su origen, licencia y huella de integridad.
- [normal.ttf](../frontend/public/fuentes/ibm-plex-sans/normal.ttf): Tipografía IBM Plex Sans utilizada por los estilos globales.

### frontend/src

- [App.tsx](../frontend/src/App.tsx): Muestra el estado de conexión y las rutas principales de la aplicación.
- [index.css](../frontend/src/index.css): Define tipografía local, colores de ambos temas, controles básicos y ajustes de accesibilidad.
- [main.tsx](../frontend/src/main.tsx): Inicia React y proporciona navegación y sesión al resto de la interfaz.

### frontend/src/api

- [client.ts](../frontend/src/api/client.ts): Envía solicitudes autenticadas, comprueba respuestas y presenta mensajes de error seguros.
- [conectividad.ts](../frontend/src/api/conectividad.ts): Detecta solicitudes lentas y reintenta lecturas permitidas sin repetir escrituras.
- [documental.schemas.ts](../frontend/src/api/documental.schemas.ts): Define los campos y tipos de las respuestas documentales, administrativas y estadísticas.
- [documental.ts](../frontend/src/api/documental.ts): Agrupa las llamadas a la API y construye rutas de ubicaciones sin ciclos.

### frontend/src/assets

- [logo-institucion.jpg](../frontend/src/assets/logo-institucion.jpg): Recurso institucional utilizado por la interfaz o el navegador.

### frontend/src/components/icons

- [Icono.tsx](../frontend/src/components/icons/Icono.tsx): Dibuja los iconos decorativos del sistema a partir de trazos SVG propios.

### frontend/src/components/layout

- [AdminLayout.module.css](../frontend/src/components/layout/AdminLayout.module.css): Organiza barra lateral, cabecera de cuenta y menú móvil; conserva la prioridad de las reglas adaptables.
- [AdminLayout.tsx](../frontend/src/components/layout/AdminLayout.tsx): Compone menú, cuenta y contenido de la página para escritorio y móvil.

### frontend/src/components/ui

- [Admin.module.css](../frontend/src/components/ui/Admin.module.css): Reúne estilos compartidos de páginas, tablas, formularios, historial y selectores documentales.
- [CargaRuta.tsx](../frontend/src/components/ui/CargaRuta.tsx): Muestra una espera accesible mientras se descarga el código de una pantalla.
- [Confirmacion.module.css](../frontend/src/components/ui/Confirmacion.module.css): Presenta el diálogo de confirmación y el fondo que separa el contenido de la página.
- [ErrorRuta.tsx](../frontend/src/components/ui/ErrorRuta.tsx): Presenta recuperación cuando falla una pantalla y permite intentar otra ruta.
- [Esqueleto.module.css](../frontend/src/components/ui/Esqueleto.module.css): Dibuja marcadores de espera para listas, detalles, gráficos y PDF.
- [Esqueleto.tsx](../frontend/src/components/ui/Esqueleto.tsx): Dibuja marcadores de carga y anuncia la espera sin inventar cantidades de registros.
- [EstadoCarga.tsx](../frontend/src/components/ui/EstadoCarga.tsx): Distingue primera carga, actualización y error con una acción para reintentar.
- [EstadoConectividad.tsx](../frontend/src/components/ui/EstadoConectividad.tsx): Avisa cuando una solicitud tarda más de lo habitual sin atribuirle una causa no comprobada.
- [SelectorTema.module.css](../frontend/src/components/ui/SelectorTema.module.css): Distingue la apariencia seleccionada y ajusta los botones a pantallas y controles táctiles.
- [SelectorTema.tsx](../frontend/src/components/ui/SelectorTema.tsx): Cambia entre apariencia clara y oscura y sincroniza la preferencia entre pestañas.
- [TextoExpandible.tsx](../frontend/src/components/ui/TextoExpandible.tsx): Permite expandir textos largos sin retirar su contenido del documento de la página.

### frontend/src/features/auth/api

- [auth.api.ts](../frontend/src/features/auth/api/auth.api.ts): Solicita inicio de sesión y perfil y valida las respuestas antes de mostrarlas.

### frontend/src/features/auth/context

- [AuthContext.ts](../frontend/src/features/auth/context/AuthContext.ts): Comparte una única sesión entre formularios, navegación y páginas protegidas.
- [AuthProvider.tsx](../frontend/src/features/auth/context/AuthProvider.tsx): Crea la sesión y comprueba su validez al regresar a la pestaña.

### frontend/src/features/auth/hooks

- [useAuth.ts](../frontend/src/features/auth/hooks/useAuth.ts): Permite a los componentes leer la sesión y ejecutar acceso, recuperación y cierre.

### frontend/src/features/auth/pages

- [LoginPage.tsx](../frontend/src/features/auth/pages/LoginPage.tsx): Presenta el formulario de acceso, muestra errores por campo y permite ver u ocultar la contraseña.

### frontend/src/features/auth/schemas

- [auth.schema.ts](../frontend/src/features/auth/schemas/auth.schema.ts): Define los campos válidos del acceso, perfil y respuesta de sesión.

### frontend/src/features/auth/services

- [AuthSession.ts](../frontend/src/features/auth/services/AuthSession.ts): Controla acceso, vencimiento y recuperación de sesión y descarta respuestas de operaciones anteriores.
- [sessionStorage.ts](../frontend/src/features/auth/services/sessionStorage.ts): Guarda solo el comprobante de sesión en la pestaña y lee su vencimiento para programar el cierre.

### frontend/src/features/auth/styles

- [Login.module.css](../frontend/src/features/auth/styles/Login.module.css): Da forma al acceso institucional, campos, mensajes y presentación en pantallas pequeñas.

### frontend/src/features/dashboard/components

- [GraficosDashboard.module.css](../frontend/src/features/dashboard/components/GraficosDashboard.module.css): Distribuye gráficos, leyendas y tablas con ajustes para pantallas pequeñas.
- [GraficosDashboard.tsx](../frontend/src/features/dashboard/components/GraficosDashboard.tsx): Selecciona los gráficos correspondientes al alcance autorizado de la cuenta.
- [GraficosDistribucion.tsx](../frontend/src/features/dashboard/components/GraficosDistribucion.tsx): Presenta distribuciones y barras con etiquetas, colores estables y tablas accesibles.
- [SerieMensual.tsx](../frontend/src/features/dashboard/components/SerieMensual.tsx): Muestra registros y decisiones por mes, con selector de serie y tabla de los mismos datos.

### frontend/src/features/dashboard/pages

- [DashboardPage.tsx](../frontend/src/features/dashboard/pages/DashboardPage.tsx): Consulta el resumen autorizado del perfil y presenta cifras, gráficos y documentos recientes.

### frontend/src/features/dashboard/styles

- [Resumen.module.css](../frontend/src/features/dashboard/styles/Resumen.module.css): Distribuye las tarjetas de cifras del panel y ajusta su tamaño en móvil.

### frontend/src/features/documentos/api

- [pdf.api.ts](../frontend/src/features/documentos/api/pdf.api.ts): Prepara, sube y confirma PDF y comprueba que la cuenta y el documento siguen vigentes.

### frontend/src/features/documentos/components

- [AccionesDocumento.tsx](../frontend/src/features/documentos/components/AccionesDocumento.tsx): Permite delegar, ubicar o anular con los permisos y la revisión recibidos del servidor.
- [ArchivoPdf.module.css](../frontend/src/features/documentos/components/ArchivoPdf.module.css): Presenta controles, metadatos, paginación y lienzo de los PDF.
- [ArchivoPdf.tsx](../frontend/src/features/documentos/components/ArchivoPdf.tsx): Consulta el adjunto y coordina previsualización, carga, descarga y eliminación confirmada.
- [AuditoriaDocumento.tsx](../frontend/src/features/documentos/components/AuditoriaDocumento.tsx): Consulta detalles adicionales de auditoría solo cuando se abre su sección.
- [ControlesPdf.tsx](../frontend/src/features/documentos/components/ControlesPdf.tsx): Muestra el resumen del adjunto y los botones permitidos para consultarlo o modificarlo.
- [DestinoDocumental.tsx](../frontend/src/features/documentos/components/DestinoDocumental.tsx): Busca destinatarios registrados o recoge un nombre manual y entrega los datos de delegación.
- [ExportarDocumentos.module.css](../frontend/src/features/documentos/components/ExportarDocumentos.module.css): Ajusta el diálogo de exportación, sus campos de periodo y el estado de descarga.
- [ExportarDocumentos.tsx](../frontend/src/features/documentos/components/ExportarDocumentos.tsx): Solicita confirmación del mes y descarga el Excel; cancelar invalida la descarga en curso.
- [FormularioDocumento.tsx](../frontend/src/features/documentos/components/FormularioDocumento.tsx): Guarda el registro o su corrección y después carga el PDF opcional sin duplicar documentos ante un fallo.
- [GrupoDocumental.tsx](../frontend/src/features/documentos/components/GrupoDocumental.tsx): Muestra los documentos relacionados visibles sin revelar el inicio del grupo si no está autorizado.
- [HistorialDocumento.tsx](../frontend/src/features/documentos/components/HistorialDocumento.tsx): Presenta fechas, autores, motivos y cambios legibles del historial recibido.
- [PrevisualizacionRegistroPdf.tsx](../frontend/src/features/documentos/components/PrevisualizacionRegistroPdf.tsx): Muestra nombre, tamaño y vista previa del PDF seleccionado antes de enviarlo.
- [SelectorDocumentoOrigen.tsx](../frontend/src/features/documentos/components/SelectorDocumentoOrigen.tsx): Busca documentos autorizados para relacionarlos con un nuevo registro.
- [SelectorUbicacion.tsx](../frontend/src/features/documentos/components/SelectorUbicacion.tsx): Busca un estante y su contenido entre las ubicaciones propias disponibles.
- [VisorPdf.tsx](../frontend/src/features/documentos/components/VisorPdf.tsx): Dibuja una página del PDF en un lienzo y cancela la tarea al cambiar de archivo o página.

### frontend/src/features/documentos/pages

- [DocumentoDetallePage.tsx](../frontend/src/features/documentos/pages/DocumentoDetallePage.tsx): Muestra un documento, sus acciones autorizadas, PDF y relaciones; conserva la revisión confirmada más reciente.
- [DocumentoFormularioPage.tsx](../frontend/src/features/documentos/pages/DocumentoFormularioPage.tsx): Obtiene opciones para registrar o corregir y comprueba si puede vincularse un documento de origen.
- [DocumentosListaPage.tsx](../frontend/src/features/documentos/pages/DocumentosListaPage.tsx): Presenta documentos autorizados con filtros en la URL, paginación y exportación mensual.

### frontend/src/features/ubicaciones/pages

- [UbicacionesPage.tsx](../frontend/src/features/ubicaciones/pages/UbicacionesPage.tsx): Organiza lugares y contenido de una cuenta y muestra grupos de cinco elementos expandibles.

### frontend/src/features/usuarios/components

- [RelevoOficina.tsx](../frontend/src/features/usuarios/components/RelevoOficina.tsx): Confirma el responsable saliente y su reemplazo con las versiones de cuenta consultadas.
- [TipoDocumentalForm.tsx](../frontend/src/features/usuarios/components/TipoDocumentalForm.tsx): Edita nombre, prefijo y actividad de un tipo y protege el prefijo que ya tiene documentos.

### frontend/src/features/usuarios/pages

- [OficinaDetallePage.tsx](../frontend/src/features/usuarios/pages/OficinaDetallePage.tsx): Presenta actividad y responsable de una oficina y permite un relevo o cambio de actividad autorizado.
- [OficinaFormularioPage.tsx](../frontend/src/features/usuarios/pages/OficinaFormularioPage.tsx): Crea una oficina o cambia su nombre con motivo; conserva los nombres institucionales.
- [OficinasListaPage.tsx](../frontend/src/features/usuarios/pages/OficinasListaPage.tsx): Presenta oficinas activas e inactivas y enlaza sus detalles.
- [RolesActualesPage.tsx](../frontend/src/features/usuarios/pages/RolesActualesPage.tsx): Permite cambiar el nombre visible de un rol sin modificar sus permisos.
- [TiposActualesPage.tsx](../frontend/src/features/usuarios/pages/TiposActualesPage.tsx): Gestiona tipos propios y muestra los compartidos; exige motivo al editar o eliminar.
- [UsuarioDetallePage.tsx](../frontend/src/features/usuarios/pages/UsuarioDetallePage.tsx): Muestra una cuenta y exige confirmación al cambiar su contraseña o actividad.
- [UsuarioFormularioPage.tsx](../frontend/src/features/usuarios/pages/UsuarioFormularioPage.tsx): Crea o edita cuentas y ofrece oficinas compatibles con el rol elegido.
- [UsuariosListaPage.tsx](../frontend/src/features/usuarios/pages/UsuariosListaPage.tsx): Lista las cuentas visibles para administración y enlaza su consulta y creación.

### frontend/src/hooks

- [consulta.ts](../frontend/src/hooks/consulta.ts): Guarda el resultado de una consulta mientras su cuenta y filtros sigan vigentes.
- [useConsulta.ts](../frontend/src/hooks/useConsulta.ts): Conecta las consultas con React y descarta resultados de una cuenta, permiso o filtro anterior.
- [useMenuMovil.ts](../frontend/src/hooks/useMenuMovil.ts): Abre y cierra el menú móvil y libera el diálogo al pasar a una pantalla amplia.

### frontend/src/lib

- [fechas.ts](../frontend/src/lib/fechas.ts): Presenta fechas con formato peruano y la zona horaria del navegador.
- [historialDocumental.ts](../frontend/src/lib/historialDocumental.ts): Convierte los cambios permitidos del historial en campos y etiquetas legibles.
- [perfiles.ts](../frontend/src/lib/perfiles.ts): Define los perfiles que ven cada enlace de navegación; los permisos efectivos se validan en el servidor.
- [regresoVisible.ts](../frontend/src/lib/regresoVisible.ts): Agrupa eventos de regreso a una pestaña para evitar comprobaciones repetidas en el mismo segundo.
- [tema.ts](../frontend/src/lib/tema.ts): Lee y guarda la preferencia de apariencia; usa la del sistema si no hay elección válida.

### frontend/src/routes

- [AppRoutes.tsx](../frontend/src/routes/AppRoutes.tsx): Relaciona direcciones con pantallas y exige sesión y perfil antes de mostrarlas.

### frontend/tests

- [consulta.test.mjs](../frontend/tests/consulta.test.mjs): Comprueba actualización de consultas, regreso a la pestaña y reintentos de lectura sin repetir escrituras.
- [contracts.test.mjs](../frontend/tests/contracts.test.mjs): Comprueba login, perfil y errores HTTP con respuestas simuladas, sin servidor ni cuentas reales.
- [dashboard-graficos.test.mjs](../frontend/tests/dashboard-graficos.test.mjs): Comprueba cifras, colores, tablas accesibles y estados sin datos de los gráficos.
- [detalle-documental.test.mjs](../frontend/tests/detalle-documental.test.mjs): Comprueba el HTML de pantallas documentales y administrativas con respuestas sintéticas.
- [documental.test.mjs](../frontend/tests/documental.test.mjs): Comprueba contratos, permisos y rutas de ubicaciones a partir de los módulos reales.
- [exportacion-excel.test.mjs](../frontend/tests/exportacion-excel.test.mjs): Comprueba solicitud, filtros, cancelación y mensajes de descarga de Excel.
- [pdf.test.mjs](../frontend/tests/pdf.test.mjs): Comprueba carga y lectura de PDF, revisión de acceso y descarte de respuestas antiguas.
- [routes.test.mjs](../frontend/tests/routes.test.mjs): Comprueba el resultado real de Vite: pantallas diferidas y ausencia de circuitos retirados.
- [session.test.mjs](../frontend/tests/session.test.mjs): Comprueba inicio, recuperación, vencimiento y cierre de sesión con reloj controlado.
- [tema.test.mjs](../frontend/tests/tema.test.mjs): Comprueba elección y persistencia de apariencia sin depender de un navegador.

### frontend/tests/fixtures

- [detalle-render.mjs](../frontend/tests/fixtures/detalle-render.mjs): Construye pantallas reales con datos simulados y permite inspeccionar su HTML y claves de listas.

### frontend/tests/helpers

- [session.mjs](../frontend/tests/helpers/session.mjs): Carga módulos reales y proporciona sesión, reloj y almacenamiento controlados para las pruebas.
