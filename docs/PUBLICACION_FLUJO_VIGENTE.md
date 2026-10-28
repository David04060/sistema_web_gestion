# Publicación del flujo documental vigente

Alcance autorizado el 28/10/2026: clasificación recibido/emitido independiente; privacidad por autor
con consulta recíproca Dirección–Secretaría; delegar/guardar en la oficina; confirmación de entrega
por Secretaría; relaciones explícitas entre documentos; delegaciones personales; dashboards,
listados y presentación de auditoría; correcciones H1, H2 y H3.
No incluye archivos institucionales, ingresos, relevos ni sustituciones.

## Destinos y credenciales

Backend: Render `sistema-documental`, rama Git `main`, root `backend`.
Frontend: Pages `sistema-documental-p`, rama de producción `main`, subida del build estático.
Base: rama Neon `production`. La herramienta verifica host directo, Branch ID, base `neondb`,
TLS autenticado y rol. Express usa `sistema_web_app`; DDL utiliza la credencial separada de
mantenimiento del respaldo. Nunca se carga `.env` local en Render ni se copian datos locales.

## Orden de operación

1. Revisar diff y excluir secretos, respaldos, evidencia, herramientas temporales y cambios ajenos.
2. Ejecutar tipos/lint/pruebas unitarias y build. Las integraciones históricas QA no se ejecutan
   en producción. Las pruebas locales con fixtures tampoco se apuntan a Neon.
3. `node scripts/backup-production.mjs`: respaldo cifrado recuperable, integridad GCM y
   decodificación completa con pg_restore. Conservar clave separada y manifest privado.
4. `node scripts/migrar-produccion-vigente.mjs`: ensayo transaccional con ROLLBACK.
5. `node scripts/migrar-produccion-vigente.mjs --aplicar`: migraciones 001–003 en una transacción.
   Compara datos completos anteriores y secuencias. El arranque no aplica migraciones.
6. Commit/push de archivos explícitos; Render Manual Deploy del nuevo commit. Verificar Live,
   configuración efectiva, salud y APIs. Las estructuras aditivas permiten seguir leyendo con la
   aplicación anterior; el trigger de INSERT obligatorio se activa al completar el cambio.
7. Compilar frontend con `VITE_API_URL=https://sistema-documental-hw7t.onrender.com`, usando
   `npm run build`. Publicar `frontend/dist` en el proyecto Pages existente y rama main.
8. Verificar versiones reales. Registrar privadamente `.private/publicacion-20261028/publicado.json`
   con commit completo, backendVerificado y frontendVerificado, después de comprobar ambos.
9. `node scripts/migrar-produccion-vigente.mjs --activar --aplicar`: migración 004, que exige
   clasificación en todo INSERT nuevo y conserva la inmutabilidad de clasificaciones anteriores.
10. Comprobar perfiles, permisos, rutas, datos y correlativos. Toda escritura de comprobación debe
    identificarse como PRUEBA DE DESPLIEGUE y reportarse. No alterar registros reales.

## Migraciones

- 001: columna nullable para conservar antecedentes sin inventar clasificación; restricción e
  inmutabilidad. Durante el cambio no bloquea INSERT de la versión anterior.
- 002: estructura final de decisiones, ubicación, entrega e historial. Antecedentes ordinarios de
  Secretaría/Dirección comienzan sin decisión, sin destino, ubicación nueva o entrega inventados.
  No interpreta movimientos anteriores ni crea eventos ficticios.
- 003: relaciones con FK e historial, y delegaciones personales inmutables con coherencia de
  oficina/usuario. Privilegios mínimos para el rol de aplicación.
- 004: activación final del trigger de clasificación obligatoria para nuevos registros.

`migraciones_aplicacion` registra checksum y fecha; una migración aplicada no se edita.
No se ejecutan los SQL restringidos a localhost ni se modifican las migraciones locales aplicadas.

## Recuperación

Conservar IDs/commits anteriores de Render y Pages y el respaldo cifrado. Ante un fallo se detienen
las etapas siguientes. Si solo se aplicaron 001–003, el backend anterior conserva compatibilidad
con sus columnas previas; no se eliminan las tablas nuevas ni los datos generados.
Después de activar 004, un retorno al backend anterior requiere evaluar expresamente su registro
sin clasificación; no ejecutar un rollback ciego. Recuperar primero una combinación compatible
de aplicación/esquema, manteniendo los datos nuevos. Nunca restaurar un dump antiguo sobre
operaciones posteriores. No efectuar restauración destructiva para probar el respaldo.
