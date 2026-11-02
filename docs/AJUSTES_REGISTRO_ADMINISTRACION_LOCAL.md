# Ajustes locales de registro, administración e Inicio

Destino comprobado: `sistema_web_documental_final`, OID 98367, PostgreSQL local.
Se conservaron los cambios anteriores del repositorio. No hubo migración, recreación,
copia QA, cambios productivos, commit, push ni despliegue.

## Cambios

- Documentos, Inicio y el componente reutilizable de accesos muestran un solo
  «Registrar documento». El formulario conserva el selector Recibido/Emitido,
  campos, permisos y PDF opcional; no modifica clasificaciones existentes.
- El backend filtra la cuenta de rol 1 antes de listar, buscar o contar para rol 2.
  `/api/usuarios` acepta `q`, `rol_id` y `activo` y devuelve el total visible.
  El dashboard aplica la misma exclusión. El detalle y las escrituras sobre esa
  cuenta devuelven 404 genérico al Administrador, también en consultas auxiliares.
- Crear otro Superadministrador o convertir una cuenta existente a ese rol se
  rechaza con 409. El índice parcial único existente se conserva. No se cambió
  la cuenta protegida ni su contraseña. Puede editar sus propios datos y consultar
  las demás cuentas con su perfil.
- El listado de usuarios ofrece «Editar», con tabla adaptada a tarjetas en móvil.
  No se ofrece el rol Superadministrador al crear o convertir otras cuentas.
- Oficinas muestra «Editar oficina», carga el formulario y lleva el foco al nombre.
  Conserva validación, motivo, asignaciones y protección de oficinas institucionales.
- Inicio tiene indicadores recibidos del backend, accesos por rol, estados vacíos
  y documentos recientes. Administrador solo recibe el resumen administrativo.
- Estilos moderados: tarjetas, espacios, acciones, foco y distribución responsiva.
  La contraseña conserva mínimo 8, máximo 128 y formato scrypt.

## Pruebas reales ejecutadas

`backend/tests/administracion-local.test.mjs` se ejecuta manualmente desde backend
con `node --test tests/administracion-local.test.mjs` después de compilar.
Requiere las cuentas locales existentes, verifica identidad antes de operar y no
crea cuentas. Usa tokens efímeros emitidos por la función del propio backend;
no utiliza ni guarda contraseñas, ni acredita un login interactivo.

Se comprobaron por HTTP y PostgreSQL:

- Exclusión del Superadministrador en listado, búsqueda, filtros y total de rol 2.
- Denegación de detalle, edición, actividad, contraseña y consultas auxiliares.
- Rechazo de segunda cuenta y conversión al rol 1 desde ambos roles administrativos.
- Consulta propia y demás cuentas desde Superadministrador; dashboard de cinco roles.
- Servicios de edición propia y de oficina contra SQL real con ROLLBACK final:
  se ejecutó la actualización, pero no se persistió ni revocó una sesión existente.
- Conservación íntegra de las filas de usuarios y sus credenciales al finalizar.

Además se registraron por HTTP real seis documentos sin PDF y se volvió a consultar
PostgreSQL para comprobar clasificación y autoría. Se identifican con asunto
`[PRUEBA LOCAL REGISTRO ÚNICO]`; no corresponden a documentos institucionales:

| ID | Cuenta por rol | Clasificación | Código |
|---|---|---|---|
| 1 | Secretaría | RECIBIDO | FUT2026001 |
| 2 | Secretaría | EMITIDO | FUT2026002 |
| 3 | Dirección | RECIBIDO | FUT2026003 |
| 4 | Dirección | EMITIDO | FUT2026004 |
| 5 | Usuario | RECIBIDO | VRU2026001 |
| 6 | Usuario | EMITIDO | VRU2026002 |

Se creó únicamente el tipo personal de prueba ID 2, «Prueba local de registro único»,
prefijo VRU. Dirección y Secretaría utilizaron el tipo compartido existente. Antes
de esa prueba no había documentos en la base nueva. No se crearon cuentas ni PDF.
Las secuencias documentales avanzaron por estas altas normales; no se reiniciaron.

Controles: tipos, lint y build de ambos proyectos; 48 pruebas frontend, 30 pruebas
de la suite backend y 6 comprobaciones en la suite específica de administración
local. El build comprueba que no contiene las dos entradas antiguas de registro.

## Pendiente visual, sin presentarlo como aprobado

Se intentó conectar tanto Chrome como el navegador integrado, incluido el dashboard
con sesión abierta aportado por el usuario. Ambas herramientas fallan antes de
ejecutar JavaScript con `failed to write kernel assets: ... ruta especificada
(os error 3)`, incluso después de reiniciar la sesión de automatización.

Por ese impedimento no se ejecutaron los registros mediante clics del navegador,
la edición visual ni las comprobaciones de escritorio/tableta/móvil. El CSS
responsivo está implementado y compilado; la revisión visual queda pendiente de
recuperar la herramienta. No se pidió ni restableció ninguna contraseña.
