# Verificación local de permisos PDF — Dirección y Mesa de Partes

Se verificó sistema_web_final en PostgreSQL local. No se aplicaron migraciones,
no se crearon bases QA y no se modificó producción, GitHub ni alojamientos.

## Resultado del caso informado

El documento 90 está anulado: se comprobó HTTP 200 con modificar=false para
Secretaría y Dirección. No se habilitó escritura ni se alteró ese registro.
El registro previo activo 88 (REVFUNC, guardado en Dirección, registrado por
Dirección) permitió a Secretaría seleccionar y adjuntar qa-uno.pdf desde Chrome.
El navegador confirmó Nuevo PDF confirmado. Antes de cargar, ambos actores
recibieron archivo=null y modificar=true también en el registro previo 86.

## Matriz ejecutada mediante HTTP local y R2 real

Se crearon mediante POST /api/documentos nueve registros ficticios identificados
QA-PDF-PERMISOS, IDs 97–105. Las decisiones y confirmaciones usaron los endpoints
existentes; no se desactivaron triggers ni se fabricaron transiciones SQL.

| Situación | Secretaría | Dirección | Registro |
| --- | --- | --- | --- |
| Pendiente | Adjuntar y reemplazar permitido | Permitido | 97 |
| Guardado en Dirección | Permitido | Permitido | 98 |
| Guardado en Mesa de Partes | Permitido | Escritura 403; consulta 200 | 99 |
| Delegado a usuario registrado | Escritura 403 | Escritura 403 | 100 |
| Entregado a usuario registrado | Escritura 403 | Escritura 403 | 101 |
| Delegado a oficina | Escritura 403 | Escritura 403 | 102 |
| Entregado a oficina | Escritura 403 | Escritura 403 | 103 |
| Delegado a nombre manual | Permitido | Permitido | 104 |
| Entregado a nombre manual | Permitido | Permitido | 105 |

Administrador recibió 404 tanto en lectura como en inicio de carga en los nueve
registros. La comprobación de autorización de escritura usó una revisión obsoleta:
409 demuestra que superó autorización, pero no es una carga completa. Por eso se
hicieron además nueve cargas/reemplazos reales para todos los casos permitidos,
alternando actor 32 (Secretaría) y 33 (Dirección).

En esas nueve operaciones la descarga autorizada por Dirección respondió 200 y su
SHA-256 coincidió con los bytes del archivo enviado. La auditoría identificó al
actor real con fecha, CARGA o REEMPLAZO. La fila de documentos permaneció idéntica
antes/después de cada operación. Dos confirmaciones simultáneas sobre el registro
97 respondieron 200 y 409; no se aceptaron dos sustituciones de la misma revisión.

La verificación visual se hizo con Secretaría sobre el documento 88, en escritorio
y a 390 px de ancho. No hubo desborde horizontal. La segunda identidad se verificó
por HTTP autenticado; no se afirma haber iniciado sesión visual como Dirección.

## Alcance y límites

La aclaración posterior del usuario sustituye la matriz original relativa a una
recepción por el destinatario: no se añadió esa recepción ni se modificó el módulo
de usuarios. La pérdida de permiso institucional ocurre ya en DELEGADO para
USUARIO/OFICINA; PERSONA manual conserva el permiso aun en ENTREGADO.

No había documentos protegidos en la consulta local destinada al ensayo HTTP;
la regresión SíseVe se ejecutó con almacenamiento y repositorio simulados. No se
presenta como un recorrido real de SíseVe en navegador.

El ensayo inicial de creación por SQL fue rechazado por los triggers y se revirtió.
Luego se utilizó exclusivamente el flujo HTTP para crear los casos. La secuencia
puede conservar el salto del intento revertido, comportamiento normal de PostgreSQL.
Los registros ficticios y sus adjuntos vigentes se conservaron para revisión local.

## Comprobaciones

Backend: 62 pruebas aprobadas y compilación correcta. Frontend: 59 pruebas aprobadas
y compilación correcta. Typecheck del frontend y lint de ambos proyectos aprobados
en esta corrección. Las evidencias técnicas privadas permanecen en
backend/.private/pdf-rollout/; no contienen tokens en los informes de resultados.
