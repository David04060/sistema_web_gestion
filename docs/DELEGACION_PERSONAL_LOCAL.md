# Delegaciones personales del rol Usuario

Se conserva el registro recibido/emitido, remitente, asunto, observaciones y ubicación
física opcional. La casilla Registrar delegación permite registrar el destino junto con
el documento en una misma transacción; también puede registrarse desde su detalle.

Destino admite oficina registrada, usuario registrado coherente con la oficina, persona
manual y destino manual fuera del catálogo. Oficina y persona no son obligatorias a la
vez; al delegar se exige al menos un destinatario. No se aceptan simultáneamente una
oficina registrada y un destino manual ni usuario y persona manual contradictorios.

La delegación conserva los nombres de destino y actor y la fecha en una tabla propia,
delegaciones_personales. El original conserva código, autor, custodia y ubicación.
Una delegación ya registrada es inmutable y no requiere confirmación de terceros.
La presentación reutiliza la situación Delegado sin crear filas en entregas_secretaria
ni movimientos del procedimiento anterior. Los antecedentes anteriores se conservan.

POST /api/documentos/:id/delegar-personal valida autoría, rol Usuario y tipo ordinario.
Al registrar puede enviarse delegacion_personal con los mismos campos: oficina_id,
usuario_id, nombre y destino_manual. El backend consulta los catálogos y no acepta
actor ni fecha enviados por el navegador. Bloqueo documental y clave única impiden
duplicados concurrentes. La tabla conserva la relación al anular lógicamente el original.

GET /api/movimientos para Usuario devuelve delegaciones personales paginadas y su total,
con filtro opcional documento_id. Filtra en SQL por autor antes de devolver datos y contar.
La vista Mis delegaciones no ofrece recorridos, recepciones o traslados antiguos.
Las operaciones antiguas de movimiento se bloquean para Usuario ordinario; el contexto
protegido SíseVe y las operaciones de Dirección y Secretaría mantienen su flujo.

La migración 20261027-delegacion-personal-local.sql se aplicó mediante migrate:local
exclusivamente en sistema_web_final (::1:5432, esquema public). Conservó los 54
documentos previos, 13 tablas y las secuencias existentes. No se dedujeron delegaciones.

## Verificación de esta entrega

- npm run test:usuario-delegacion:local: 74 solicitudes HTTP desde localhost:5173 y dos
  delegaciones simultáneas (200 y 409). Recibido/emitido sin delegación, delegación inicial
  y posterior, destino de catálogo y manual, ubicación opcional, detalle/historial/listado,
  conteos de movimientos, rechazo de documentos ajenos, destinatario sin acceso y rollback.
  Cuatro documentos de prueba: INF2026038 a INF2026041. Comparación exacta de antecedentes.
- npm run test:secretaria:local: 26 solicitudes correctas; guardado/delegación/entrega
  institucionales siguen funcionando. Se conservaron los registros anteriores.
- Backend 36 pruebas y frontend 53 pruebas correctas, lint y compilación correctos.
- Sesión real Usuario: registro emitido INF2026042 con oficina y persona manuales;
  consulta en detalle y Mis delegaciones, sin pasos de recepción ni filtros antiguos.
  También se delegó posteriormente INF2026048 desde su detalle en vista móvil,
  seleccionando Mesa de Partes y su usuaria; se comprobó el filtro de personas por
  oficina y la situación Delegado con el destinatario y el evento del historial.

Las pruebas escriben únicamente registros de comprobación local identificados como tales.
No se crean usuarios, bases ni copias. No se borra historial ni se publica producción.

Arranque sin cambios: npm run dev en backend y npm run dev en frontend, en dos terminales.
La migración ya está aplicada; el arranque comprueba el esquema y no migra automáticamente.
