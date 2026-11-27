# Base de datos documental

[Inicio](../README.md) · [Cuentas iniciales](CUENTAS_MANUALES.md) · [Despliegue manual](../documentacion-publica/DESPLIEGUE_MANUAL.md)

## Organización y orden

| Ruta | Finalidad |
|---|---|
| `instalar.sql` | Instalador completo y transaccional para PostgreSQL 18, exclusivamente en una base vacía |
| `instalacion/funciones/` | Una función por archivo; reglas de acceso, validación e historial |
| `instalacion/tablas/` | Tablas y secuencias agrupadas por finalidad |
| `instalacion/{claves,indices,triggers,relaciones,vistas,catalogos}.sql` | Restricciones, índices, disparadores, relaciones, vistas y catálogos mínimos |
| `sistema_documental_instalacion.sql` | Instalador completo en un solo archivo, como alternativa al dividido |
| `schema/*.schema.sql` | Definiciones agrupadas para consultar el modelo; no son scripts de instalación |
| `schema/INVENTARIO.md` | Lista de tablas, columnas, funciones, restricciones e índices |
| `changes/001-*.sql` a `016-*.sql` | Cambios de estructura para instalaciones anteriores; no se añaden a una instalación vacía actual |
| `CUENTAS_MANUALES.md` | Preparación de la primera cuenta y explicación de sus pertenencias |

El instalador incluye **25 tablas, 37 funciones y 45 triggers**, dos vistas, secuencias, claves,
restricciones e índices. Un trigger o disparador es una regla que PostgreSQL ejecuta al insertar,
actualizar o eliminar datos. El punto de entrada recomendado es `instalar.sql`; sus instrucciones
`\ir` cargan cada bloque en el orden necesario. No ejecutar fragmentos por separado.

En este repositorio no existen las carpetas `chunks/` ni `esquema/`. Los fragmentos ejecutables
están en `instalacion/` y la referencia de estructura está en `schema/` (esquema en inglés).

Solo inserta catálogos técnicos: cinco códigos de rol, Dirección, Mesa de Partes y el ámbito compartido. No contiene filas de usuarios, documentos, auditorías, contraseñas, hashes de cuentas ni objetos R2 reales. Las sentencias de escritura dentro de funciones son definiciones de comportamiento, no datos iniciales.

## Crear una base local vacía

Instalar PostgreSQL 18 con sus herramientas de cliente. Desde la raíz del repositorio, usando una cuenta de mantenimiento con permiso de creación:

```sh
createdb -h localhost -p 5432 -U postgres -W -E UTF8 sistema_web_documental_final
psql -X -h localhost -p 5432 -U postgres -W -d sistema_web_documental_final -v ON_ERROR_STOP=1 -f database/instalar.sql
```

`-W` solicita la contraseña sin incluirla en el comando; `-X` evita configuración personal de psql y `ON_ERROR_STOP=1` detiene la instalación ante errores. El archivo ya contiene `BEGIN` y `COMMIT`. Sus directivas `\ir` se ejecutan con psql, no pegando el contenido en un editor web. Se requiere PostgreSQL 18.

El backend local exige el nombre `sistema_web_documental_final`, host loopback, puerto coincidente y esquema `public`. Si esa base ya existe, no ejecutar el instalador encima ni eliminarla para probar. `npm test` desde backend crea otra instancia PostgreSQL temporal con ese mismo nombre y puerto independiente.

Después, crear la primera cuenta según [Cuentas iniciales](CUENTAS_MANUALES.md). Para Render, crear la base en Neon e instalar con el propietario; configurar el rol de conexión `sistema_web_app` como indica [Despliegue manual](../documentacion-publica/DESPLIEGUE_MANUAL.md).

## Modelo por dominio

| Dominio | Tablas y propósito |
|---|---|
| Identidad | `roles`, `usuarios`, `oficinas`, `ambitos_registro`, `miembros_ambito`: cuenta, perfil, oficina y alcance |
| Catálogos | `tipos_documentales`, `unidades_ubicacion`: tipos por ámbito y árbol personal sin ciclos |
| Registro | `documentos`, `correlativos_documentales`: identidad, clasificación, situación y numeración transaccional |
| Hechos | `delegaciones_documento`, `ubicaciones_documento`, `documentos_relaciones`: destino, ubicación y grupos |
| Relevo | `oficina_periodos`, `documentos_oficina`, `tipos_oficina`, `tipos_relevo`: periodos y trazabilidad institucional |
| PDF | `documentos_pdf`, `pdf_cargas`, `pdf_objetos_pendientes`, `pdf_eventos`, `pdf_retenciones_anulacion`: metadatos, cargas y limpieza durable |
| Auditoría | `auditoria_documental`, `auditoria_configuracion`: cambios y motivos inmutables |

`documentos_ordinarios` y `documentos_anulados` son vistas de situación. No sustituyen la autorización por actor. Las funciones `documento_consultable*` y `documento_delegado_por` implementan el alcance; `documentos_grupo` recorre relaciones. Los triggers validan autor, pertenencia, oficina, clasificación, revisión, ubicación, delegación, PDF y estado final, y bloquean cambios de historia y truncado.

Las operaciones backend fijan `app.actor_id` y `app.motivo` dentro de la transacción. El bloqueo asesor de configuración coordina cambios de cuentas y operaciones documentales. `FOR UPDATE` y `revision` protegen de escrituras concurrentes. Las secuencias se crean vacías: no se exportan valores de cuentas o documentos de trabajo.

## Verificación después de instalar

Conectar a la base recién creada y ejecutar:

```sql
SELECT current_database(), current_user, current_schema();
SELECT count(*) AS tablas FROM pg_tables WHERE schemaname = 'public';
SELECT count(*) AS funciones FROM pg_proc WHERE pronamespace = 'public'::regnamespace;
SELECT count(*) AS triggers FROM pg_trigger
WHERE NOT tgisinternal AND tgrelid IN
  (SELECT oid FROM pg_class WHERE relnamespace = 'public'::regnamespace);
SELECT count(*) AS usuarios FROM public.usuarios;
SELECT count(*) AS documentos FROM public.documentos;
SELECT id, codigo FROM public.roles ORDER BY id;
```

Antes de crear cuentas deben resultar 23 tablas, 35 funciones, 41 triggers, cero usuarios, cero documentos y cinco roles. La [estructura pública](../documentacion-publica/ESTRUCTURA.md) describe cada archivo SQL.

## Orden y diferencias entre los archivos SQL

`instalar.sql` abre una transacción, configura la sesión y define las funciones.
Después crea tablas y secuencias, vistas, claves, índices, triggers y relaciones.
Termina con los tres catálogos mínimos y confirma la transacción. Las funciones
se crean con `check_function_bodies=false` porque algunas utilizan tablas y funciones
que se definen después; al ejecutar la aplicación ya existen todos sus objetos.

El archivo único `sistema_documental_instalacion.sql` y el conjunto que carga `instalar.sql`
contienen las mismas definiciones de funciones, tablas, vistas, secuencias, restricciones,
índices y disparadores, además de los mismos catálogos mínimos. Cambian la presentación
y las instrucciones de sesión: el archivo único incluye controles propios de una exportación
de PostgreSQL; el dividido usa inclusiones relativas. Son alternativas: ejecutar **solo uno**.
El orden recomendado para una base vacía es crear la base, ejecutar `instalar.sql`, comprobar
los catálogos, crear la primera cuenta y configurar el backend.

Los seis archivos de `schema/` repiten las definiciones para facilitar su lectura por temas:
identidad, configuración, documentos, PDF, auditoría e integridad. Su encabezado indica que
son documentación. No incluyen el proceso completo de instalación ni los catálogos iniciales;
no se ejecutan después del instalador. Por ejemplo, el relevo se consulta en
`integridad.schema.sql` y `documentos.schema.sql`, mientras el instalador lo agrupa en
`instalacion/tablas/relevo.sql`. Los nombres de carpeta no representan bases distintas.

`changes/` contiene migraciones: scripts que adaptan estructuras existentes y que pueden
actualizar datos además de definir objetos. La instalación actual ya incorpora sus reglas
hasta `015-retirar-consulta-general-secretaria.sql`. No ejecutar la serie 001–015 después
de instalar desde cero. No aplicar el instalador sobre una base con registros.

Para verificar automáticamente la instalación vacía, ejecutar `npm test` desde backend.
El ejecutor crea una instancia PostgreSQL independiente, comprueba su identidad,
instala estos mismos archivos y carga únicamente datos sintéticos de prueba.

## Atención documental — 26/11/2026

En bases existentes se aplica una sola vez `changes/016-atencion-seguimiento.sql`, previa copia de seguridad. Conserva filas, relaciones y referencias PDF. No ejecutar el instalador sobre una base existente.

La instalación vacía incluye las acciones, las intenciones PDF y delegaciones sucesivas. El instalador modular y el monolítico se comprobaron en PostgreSQL temporal. `schema/atencion.schema.sql` es referencia, no otro paso de migración.

Antes de aplicar la 016, confirmar la identidad de la base y comprobar que no existen `acciones_documento`, `acciones_pdf_cargas` ni la columna `delegaciones_documento.id`. La clave primaria anterior debe ser `documento_id` y no debe tener claves foráneas entrantes que dependan de ella. Si hay una instalación parcial, detener la actualización y revisar el catálogo. Usar un respaldo reciente y legible; ejecutar exclusivamente esta migración incremental, que incluye su transacción.

Si el propietario de mantenimiento crea las tablas, el rol existente de aplicación necesita `SELECT, INSERT, UPDATE, DELETE` sobre las dos tablas nuevas y `USAGE, SELECT` sobre `delegaciones_documento_id_seq` y `acciones_documento_id_seq`. Conceder permisos solo sobre esos objetos nuevos. Comparar los datos existentes antes y después, comprobar el esquema con el rol de aplicación y desplegar la API compatible. Una instalación que ya tiene la 016 no debe volver a ejecutarla. Véase [Despliegue manual](../documentacion-publica/DESPLIEGUE_MANUAL.md).
