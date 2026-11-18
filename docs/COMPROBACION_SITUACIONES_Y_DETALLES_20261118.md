# Situaciones por cuenta y pantallas de detalle

## Estado de partida

- `main` local y GitHub: `395beed1f5d297a1862c31ebedbe403c3b235702`, sin commits pendientes en ninguna dirección. Se conservaron los archivos no rastreados que ya estaban en el proyecto.
- Render: despliegue activo `dep-dbuf59ec6qcc73dj34jg`, commit `395beed`; el endpoint público de salud respondió OK.
- Pages: despliegue de producción `c5388c55-f39e-4d4f-8493-975eb9d8c5f3`, rama `main`, origen `395beed`; el HTML público apuntaba al mismo JS y CSS de entrada que el build de referencia.
- Entorno local: Vite en el puerto 5173, API habitual en el 3000 y PostgreSQL 18 en `::1:5432`, base `sistema_web_documental_final`, sin identificador de rama Neon.

## Causa y solución

El documento productivo `CER2026001` (ID 142) conserva `PERSONAL` desde el evento `REGISTRO`, tiene clasificación `RECIBIDO`, oficina registrada y ninguna delegación. Dirección veía «Personal» en listado y detalle; el XLSX de noviembre obtenido con esa sesión también lo tenía en la columna Situación. La consulta original solo sustituía `PERSONAL` para el autor y devolvía el valor original para las demás cuentas autorizadas.

Se reutiliza la misma expresión SQL de presentación en listado, detalle, filtro actual, Inicio y Excel. El registro personal del titular o del archivo de su oficina vigente se muestra como «En mi oficina»; para otra cuenta autorizada se muestra «De otra cuenta». La delegación conserva «Delegado por mí» y «Delegado a mí» para sus participantes y «Con delegación» para los demás perfiles con lectura autorizada, incluidas las delegaciones manuales sin receptor registrado. Los filtros API históricos `PERSONAL` y `DELEGADO` se mantienen para compatibilidad, fuera del selector. La clasificación, la situación original y los eventos de auditoría permanecen intactos. No hay migración.

En oficina, el formulario de relevo ocupa su propio bloque y los enlaces quedan debajo. En documentos, Asunto, Remitente, Observaciones y Ubicación tienen filas completas; la ubicación mantiene por separado la oficina y la ruta histórica. Los metadatos breves admiten columnas amplias con ajuste automático a una sola columna en móvil.

## Verificación local

| Evidencia | Resultado |
| --- | --- |
| PostgreSQL y servicios documentales | `VRU2026001` (ID 5): `PERSONAL` original, «De otra cuenta» para Dirección y «En mi oficina» para Usuario. Filtro, detalle, contador del Inicio y XLSX coherentes. |
| PostgreSQL y servicios documentales | `FUT2026003` (ID 3): Dirección «Delegado por mí» y Usuario «Delegado a mí» en detalle, filtro, contador y XLSX. El receptor conserva las restricciones; Administrador no obtiene listado ni detalle del documento histórico. |
| Navegador local | Dirección, Secretaría, Usuario y Administrador con sesiones reales. El emisor y el receptor vieron etiquetas diferentes; Secretaría vio «Con delegación» en `RVINT2026002` (ID 41). Se comprobó el Inicio de Dirección, los filtros del ID 5 para ambos perfiles y el visor real del PDF del ID 69. Superadministrador quedó fuera de la comprobación visual por instrucción del usuario. |
| Relevo real | Oficina Oficinista (ID 27): saliente ID 5, reemplazo «Reemplazo QA Relevo» ID 36. El navegador de Administrador confirmó el relevo; el saliente quedó inactivo, se cerró su periodo 3 y se abrió el periodo 4. El ID 141 siguió ligado al periodo 3; el reemplazo y Dirección lo vieron de solo lectura. En la oficina institucional (ID 1), Administrador vio Volver al listado y no Editar nombre. |
| Presentación adaptable | Documento local temporal ID 142, `FUT2026005`: al no existir registros visibles con ubicación/remitente, se usaron el tipo y la ubicación ya existentes para una prueba reversible. Se revisaron relación, observaciones, remitente y ruta completa en escritorio y 390 px, en claro y oscuro. Se cubrieron campos ausentes y asunto largo con los registros anteriores. El ID 142 local es independiente del ID 142 productivo. |
| Limpieza | Se verificó un respaldo cifrado antes del relevo. Se retiraron la cuenta y el documento temporales y se restauraron las filas previas, con comparación de conteo y huella de las 26 tablas públicas. Las secuencias retuvieron su avance normal; no se reasignaron identificadores. |
| Automatización | Frontend: 78 pruebas. Backend: 31 pruebas sin crear una base y comprobaciones dirigidas con los registros de la base habitual. Ambos: lint, verificación de tipos y compilación. Las suites del runner que inicializan otro clúster PostgreSQL no se ejecutan bajo la restricción de no crear bases. |

El lint del backend detectó además un uso de `Buffer` sin importar en la prueba de alta delegada; se añadió el import de Node.
