# Corrección de delegación del documento de prueba 4

Base verificada: `sistema_web_documental_final`, OID 98367, PostgreSQL local.
No se crearon bases ni cuentas. No hubo commit, push ni despliegue.

## Error original reproducido

Con la cuenta Directora existente, el proxy real `http://localhost:5173` respondió:

- `GET /api/auth/me`: 200, rol `Director(a)`.
- `POST /api/documentos/4/delegar`, revisión `1`, `usuario_id="5"`,
  `oficina_id=null`, `nombre=null`, `observaciones=null`: 500,
  `{"error":"Error interno del servidor"}`.
- PostgreSQL: **42702**, «la referencia a la columna “nombre” es ambigua»;
  función `validar_delegacion()`, línea 15. El detalle original señala que puede
  ser una variable PL/pgSQL o una columna de tabla. Se comprobó rollback y cero
  delegaciones del documento después del fallo.

La variable local `nombre` colisionaba con `usuarios.nombre` en el SELECT del
trigger. No era un fallo de autenticación. No se reprodujo el texto visual
«autenticación requerida»: el servidor real devolvió el error interno indicado.
No se cambió el manejo de 401/403 ni se convirtió el 500 en un éxito o autorización.

## Corrección aplicada

Se aplicó transaccionalmente solo
`database/changes/002-corregir-ambiguedad-delegacion-local.sql`. Verifica nombre,
OID y host local, renombra la variable a `nombre_persona` y usa alias explícitos
`u.oficina_id`, `u.nombre`, `u.apellido`. Conserva las reglas del trigger y todas
las protecciones. Se guardó su definición previa en la carpeta privada ignorada.
Los seis registros existentes coincidieron antes y después del DDL.

El servicio comprueba la revisión antes del permiso dependiente del estado, de
modo que repetir la solicitud obsoleta devuelve 409. Una operación sin autorización
vigente sigue devolviendo su 403/404 correspondiente; no se amplió el acceso.

El instalador documental y el archivo `database/schema/documentos.schema.sql`
recibieron únicamente la definición real corregida, leída desde PostgreSQL.
No se volvió a ejecutar el instalador. La herramienta general de exportación no
reconoció el formato actual del SQL de Downloads; por ello se actualizó la función
puntualmente desde el catálogo sin cambiar otros objetos.

## Frontend

- El PDF y las acciones compartían la clave hermana `4-1`. Ahora usan `pdf-ID-revisión`
  y `acciones-ID-revisión`. Los eventos del historial conservan su ID único real.
- El resultado confirmado del POST actualiza inmediatamente situación y persona
  indicada; se recargan detalle e historial automáticamente, sin F5. Una revisión
  posterior del backend prevalece sobre el resultado local anterior.
- La confirmación visible se muestra en el detalle. El envío tiene bloqueo inmediato
  mediante ref y controles deshabilitados durante la operación. Un fallo conserva
  los valores del destinatario y muestra el mensaje y estado HTTP para reintentar.
- Se retiró la explicación «La delegación deja constancia del destino…».
- «Volver al listado» tiene estilo de botón secundario. Buscar tiene dimensiones
  propias y deja de estirarse con los campos del grid.
- El historial separa acción, actor, fecha, motivo y cambios, con lista semántica,
  tarjetas y distribución adaptada a móvil.

## Comprobaciones ejecutadas

**Caso exacto, proxy real localhost:5173:** 200, documento 4, `DELEGADO`, revisión 2,
persona «oficinista oficinista». Repetir la revisión 1 devolvió 409 con
«El documento cambió; vuelva a consultar».

PostgreSQL confirmó una delegación del documento 4, usuario indicado 5 y actor 3.
Su historial contiene exactamente el registro ID 4 y la delegación ID 7; la API
devuelve esos mismos IDs, sin duplicados ni omisiones. Se mantuvo autoría y ámbito;
la delegación no transfiere el registro. Esta es la única modificación documental
persistente de esta corrección.

`backend/tests/delegacion-local.test.mjs` comprueba por HTTP y SQL reales:

- Usuario registrado sin oficina.
- Oficina y usuario compatibles. Se usó otra cuenta existente con oficina, porque
  oficinista no tiene oficina asignada; no se alteró ninguna asignación para probar.
- Nombre manual.
- Rechazo de oficina incompatible y destino vacío (400), acceso no autorizado (404)
  y repetición de revisión anterior (409).
- Una sola delegación persistida en el documento 4 e igualdad del historial API/SQL.

Las variantes se probaron sobre el documento propio de prueba 3 mediante
transacciones reales con savepoints y rollback final. Su fila quedó intacta y no
se persistieron delegaciones ni eventos de esas variantes. Las secuencias pueden
presentar saltos normales por los rollback; no se reiniciaron.

`frontend/tests/detalle-documental.test.mjs` renderiza los componentes reales en
Node con respuestas de consulta en memoria: verifica claves hermanas únicas,
eventos completos, actor/fecha/cambios, botón de regreso y Buscar. Es una prueba
de render, no una prueba de navegador ni una sesión real.

Resultados finales: typecheck, lint y compilación de ambos proyectos aprobados;
50 pruebas frontend, 30 pruebas de la suite backend y 6 comprobaciones de la suite
local específica de delegación aprobadas. `git diff --check` no encontró errores.

## Límite comprobado de navegador

La herramienta de navegador volvió a fallar antes de iniciar con
`failed to write kernel assets: ... ruta especificada (os error 3)`.
No se verificaron clics, estado visual de los envíos ni anchos de escritorio/móvil
en el navegador. El CSS responsivo y los componentes quedaron implementados y
su render/compilación se comprobaron por separado. No se presentan esas pruebas
como una verificación visual completada.
