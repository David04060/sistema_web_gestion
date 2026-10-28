# Decisiones de Secretaría

Ampliación local de delegar y guardar a Secretaría, en el formulario recibido/emitido
y en el detalle pendiente. Guarda en estantes y archivadores de su oficina; conserva
el registro bajo su autoría cuando registra un documento emitido por Dirección.
Puede decidir también sobre los registros consultables de Dirección. Esto no concede
edición ni anulación ajena. La entrega mantiene sus permisos y su confirmación única.

Se reutilizan los controles y endpoints actuales, incluido guardar-direccion como ruta
compatible. El backend selecciona GUARDADO_SECRETARIA o GUARDADO_DIRECCION según el
actor autorizado, sin confiar en una situación enviada por el navegador. La presentación
muestra Guardado en Secretaría, incluido el historial. No se reinterpretan datos anteriores.

La migración 20261027-decision-secretaria-local.sql fue aplicada con migrate:local a
sistema_web_final en ::1:5432, esquema public. Conservó 46 documentos y las 13 tablas
previas y sus secuencias. Amplía restricciones y trigger, sin modificar datos existentes.

Los usuarios ordinarios conservan el registro normal de recibido y emitido, con códigos
independientes y privacidad propia; no reciben opciones de decisión institucional.

Prueba: npm run test:secretaria:local desde backend. Primera ejecución detenida sin
crear documentos por falta de ubicación de Secretaría. Segunda ejecución correcta:
29 solicitudes HTTP a través de localhost:5173; siete documentos locales, validación
de privacidad, ubicación ajena, confirmación repetida y conservación de antecedentes.
Se creó por el módulo habitual el estante SECRETARIA y su archivador 1, de Secretaría.
Interfaz: registro emitido OFI2026001, remitente Dirección, Guardado en Secretaría.

Arranque sin cambios: npm run dev en backend y npm run dev en frontend, en terminales
separadas. La migración ya está aplicada. No hay bases nuevas, QA ni publicación.
