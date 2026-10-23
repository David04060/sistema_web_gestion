> Actualización: la autorización posterior permitió aplicar permanentemente el mismo SHA-256. Véase [MIGRACION_DOCUMENTAL_APLICADA.json](MIGRACION_DOCUMENTAL_APLICADA.json) y [DOCUMENTOS_MOVIMIENTOS.md](DOCUMENTOS_MOVIMIENTOS.md). Este informe conserva la validación previa al COMMIT.

# Validación de la migración documental — opción A

Fecha: 21 de octubre de 2026. **Validación superada; aplicación permanente pendiente
de autorización expresa. Documentos y Movimientos todavía no están terminados.**

## Artefacto validado

- SQL: backend/scripts/sql/20261021-flujo-documental-cinco-estados.sql.
- SHA-256: `5f5ab7e176ff5ea74a8cd9d78c880eb69035fb45726c4f536be033f3d36b0422`.
- Resultado detallado: RESULTADOS_VALIDACION_MIGRACION.json.
- Verificador: backend/tests/flujo-migration.integration.mjs y flujo-migration-sandbox.mjs.

## Dos verificaciones distintas

1. En sistema_web_final se tomó una instantánea de columnas, funciones, restricciones,
   índices, triggers y huellas/conteos de todas las tablas públicas. Se ejecutó el cuerpo
   exacto del SQL, retirando solo BEGIN/COMMIT en memoria para controlar la transacción
   exterior, y se terminó siempre en ROLLBACK. La instantánea posterior coincidió.
   **No se confirmó ningún cambio de esquema ni se insertaron fixtures institucionales.**
2. Se creó una base QA efímera con nombre aleatorio protegido y copia solo del esquema,
   mediante pg_dump --schema-only. Se copiaron roles, oficinas y los siete tipos reales;
   no se copiaron cuentas, contraseñas ni documentos institucionales. Se crearon cuentas
   QA con scrypt real. La única adaptación del SQL en QA fue la guarda de current_database()
   para aceptar exclusivamente el nombre de la base recién creada.

En QA sí se confirmaron operaciones temporales para probar transacciones concurrentes
entre sesiones independientes. Al finalizar se eliminó exclusivamente la base creada,
comprobando nombre y OID, y se volvió a comparar la base institucional. La copia del
esquema permite esta validación, pero no constituye una prueba de restauración de datos.

## Resultados finales

| Verificación | Resultado |
|---|---|
| Migración y flujo SQL | 31 casos aprobados; 32 resultados contando el grupo principal |
| Concurrencia de correlativos | 12 sesiones PostgreSQL con PID distintos; códigos únicos y consecutivos |
| Salidas concurrentes | Una confirmada y otra rechazada; sin movimiento abierto duplicado |
| Bloqueo de oficina del destinatario | Cambio concurrente rechazado por timeout de bloqueo mientras se autorizaba |
| Atomicidad diferida | Rechazadas salida parcial y recepción sin actualizar documento/custodia |
| Backend typecheck, lint, build | Correctos |
| Backend npm test | 25 resultados aprobados |
| Frontend typecheck, lint, build | Correctos |
| Frontend npm test | 34 resultados aprobados |
| Login real y /me en QA | Correctos con scrypt y JWT existentes |
| Consultas documentales y contratos Zod de React | Compatibles con el esquema migrado de QA |
| Catálogos administrativos y ubicaciones | Consultas autorizadas correctas en QA |
| Confidencialidad | Listas, conteos, detalles, historial y movimientos generales ocultan tipos restringidos |
| ROLLBACK institucional y limpieza QA | Comprobados |

La prueba de confidencialidad marcó Informe como restringido únicamente en la copia
QA y restauró la marca al terminar el caso; no creó tipos ficticios ni modificó el
catálogo institucional. Se comprobó también que SíseVe sin prefijo no entra por el
generador ordinario. No se implementó ni se verificó el mecanismo específico de SíseVe.

## Problemas encontrados y corregidos antes de solicitar aprobación

1. La propuesta anterior validaba la oficina al autorizar/salir, pero permitía recibir
   si la cuenta había cambiado de oficina después de salir. Un caso negativo real
   demostró el problema. El trigger ahora exige que el destinatario activo pertenezca
   a la oficina de destino también al recibir. Se conserva la oficina histórica.
2. Una salida podía registrar un instante anterior a la autorización, aunque posterior
   al registro. Se reprodujo conservando microsegundos de PostgreSQL para evitar el
   redondeo de Date de JavaScript. Ahora se exige que la salida no anteceda a la última
   modificación del documento, incluida su autorización.
3. Una fixture anterior de catálogos registraba un documento de una cuenta QA usando
   como actor al administrador. Se corrigió el actor de esa fixture para respetar la
   identidad del registrador que exige el nuevo trigger. No se alteró autenticación.

Se corrigieron además el nombre de la función scrypt reutilizada y la importación
explícita de URL del verificador. Los resultados de la tabla corresponden a la
versión final, después de las correcciones; no a los primeros intentos fallidos.

## Repetir la validación de forma explícita

Desde backend, con la configuración privada existente y PostgreSQL 18 instalado:

```powershell
$env:VALIDAR_FLUJO_DOCUMENTAL='ROLLBACK_Y_QA_AISLADA'
npm run test:migracion-documental
Remove-Item Env:VALIDAR_FLUJO_DOCUMENTAL
```

Este comando crea y elimina únicamente su base QA, y ejecuta DDL institucional solo
con ROLLBACK. Requiere permisos de creación de base y pg_dump/psql disponibles.
`npm test` normal no ejecuta esta migración ni crea bases de prueba.
No se agregaron dependencias ni se guardaron credenciales en los artefactos.

## Límite de esta entrega

Las pruebas ejercitan el SQL y los endpoints de consulta actuales con PostgreSQL real.
No acreditan formularios de escritura React terminados ni endpoints de operaciones
que todavía faltan implementar. La recepción, rechazo, recuperación y autorización
se verificaron mediante operaciones SQL transaccionales equivalentes al flujo aprobado.
La revisión de interfaz móvil y el recorrido completo desde formularios quedan para
la fase posterior a la autorización y aplicación permanente.

Se solicita autorización para aplicar permanentemente exactamente el SQL identificado
por el hash anterior en sistema_web_final. Antes de hacerlo se volverán a comprobar
la base y los datos. Después se verificará la estructura y se completarán los módulos,
sus endpoints, formularios y pruebas de extremo a extremo. Hasta esa autorización
no se ejecutará COMMIT de cambios de esquema en la base institucional.
