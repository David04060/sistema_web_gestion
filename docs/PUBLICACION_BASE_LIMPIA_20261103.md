# Publicación con base limpia — 3 de noviembre de 2026

Este informe actualiza el destino indicado en PUBLICACION_BASE_NUEVA_20261103.md por instrucción posterior del propietario: excluir todos los documentos locales de prueba.

## Base final

- Neon: sistema_documental_produccion, dentro del proyecto y rama production existentes.
- Restauración selectiva desde una instantánea local de solo lectura: 21 tablas, 21 funciones y 36 triggers de usuario. No se desactivaron triggers ni se forzaron borrados.
- Cinco usuarios existentes conservados íntegramente, incluidas contraseñas cifradas, roles y oficinas. No se crearon cuentas de prueba.
- Conservados como configuración: roles, oficinas, usuarios, ámbitos de registro, miembros de ámbito, tipos documentales, campos opcionales y unidades de ubicación. Sus huellas coinciden con el origen.
- Vacías desde la restauración: documentos, documentos_pdf, valores_documento, ubicaciones_documento, documentos_relaciones, delegaciones_documento, correlativos_documentales, auditoria_documental, auditoria_configuracion, cambios_nombre_campo, pdf_cargas, pdf_eventos y pdf_objetos_pendientes.
- La base local, neondb y la copia inicial sistema_web_documental_final permanecen intactas; se compararon sus huellas durante la preparación.

## Configuración

Render utiliza NEON_DATABASE=sistema_documental_produccion y DATABASE_URL privada dirigida a esa base. El frontend utiliza el API de Render. R2 utiliza produccion/pdf/ para archivos definitivos y tmp/produccion/ para temporales; no existe expiración automática de produccion/pdf/. QA y los objetos anteriores se conservan.

El intento anterior de truncar documentos en la copia inicial fue rechazado por un trigger y revertido. Se resolvió creando la base limpia con exclusión de datos operativos durante pg_dump, preservando todas las protecciones.

## Verificaciones de preparación

- Inventario y huellas: cinco cuentas idénticas, cero documentos y cero referencias PDF; estructura y configuración coincidentes.
- Backend compilado con configuración productiva contra la base limpia: identidad, rama y TLS verificados; 15 solicitudes de lectura satisfactorias para las cinco cuentas existentes (auth/me, dashboard y documentos), sin escrituras SQL.
- El código de aplicación corresponde a f38ed200b00455e5ac395bd7c15b7be1b983ef0d. Las comprobaciones remotas definitivas se registran al finalizar la publicación.

Credenciales, respaldos y evidencias con datos privados permanecen en .private/despliegue-20261103, excluidos de Git.

## Resultado remoto final

- Render: despliegue de f38ed20 confirmado Live; configuración efectiva dirigida a sistema_documental_produccion. Se conservó JWT_SECRET existente de Render.
- API remoto: 25 solicitudes para cinco roles. auth/me, dashboard y listado responden 200; los listados tienen total cero. Opciones de registro rechaza con 403 a ambos roles administrativos y permite los tres documentales. Excel responde 200 para superadministrador y roles documentales; administrador recibe 403. Los cuatro XLSX descargados se abrieron correctamente con ExcelJS. CORS coincide con el origen Pages.
- Health 200 y listado sin autenticación 401.
- Pages: publicación confirmada por Cloudflare; los 54 recursos públicos coinciden byte por byte con frontend/dist y la ruta SPA /documentos/nuevo responde 200. Pantalla de acceso abierta en Chrome sin errores de consola.
- R2_PDF_PREFIX efectivo confirmado como produccion/. No se subieron PDF ni se registraron documentos ficticios para verificar el despliegue limpio.
- Pendiente de recorrido productivo con datos reales: registro completo de un documento, carga y apertura PDF. No se ejecutó ese recorrido porque produciría registros de prueba en la base que debe iniciar vacía. La comprobación HTTP por roles utilizó sesiones firmadas en memoria para las cuentas existentes; no equivale a cinco inicios de sesión manuales con contraseña en navegador.

Evidencias privadas: base-limpia-verificada.json, backend-base-limpia.json, verificacion-remota.json, frontend-publicado.json y capturas de Render, Pages y la pantalla publicada.
