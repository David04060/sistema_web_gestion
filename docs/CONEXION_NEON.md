# PostgreSQL local y Neon

El despliegue vigente usa Express en Render y frontend en Pages; consultar
[DESPLIEGUE_RENDER_PAGES.md](DESPLIEGUE_RENDER_PAGES.md). Esta guía describe las
conexiones directas y los perfiles privados del equipo.

Ejecutar desde `backend/`. Se reutilizan el pool de `pg` y los repositorios.

- Local: `npm run dev` o `npm start` después de compilar. Usa `.env` (o el
  `DOTENV_CONFIG_PATH` existente) y exige la base `sistema_web_final`.
- Neon: `npm run dev:neon` o `npm run start:neon` después de compilar.
  `--neon` carga exclusivamente `.env.neon`, con precedencia sobre variables
  heredadas para las claves definidas en ese archivo. No carga `.env`.
- Neon QA: `npm run dev:neon:qa` o `npm run start:neon:qa`, mediante
  `.env.neon.qa`. `npm run check:neon:qa` contrasta el host y el Branch ID.
  QA y principal comparten el nombre `neondb`; el nombre de la base no basta
  para distinguirlas. Las suites `test:neon:qa:*` solo escriben en la rama QA validada.

Preparar `.env.neon` con todas las variables de `.env.neon.example`. Completar
la URL directa del usuario `sistema_web_app`, base `neondb`, host sin `-pooler`
y `sslmode=verify-full`. Codificar caracteres reservados de la contraseña en la
URL. Nunca usar `neondb_owner` ni desactivar la validación del certificado.
Guardar el secreto JWT privado; no incluir credenciales en comandos o mensajes.
El puerto de la plantilla es 3001 para evitar colisiones con el backend local.

`.env` y `.env.neon` están excluidos por `.gitignore`; las dos plantillas sin
secretos están permitidas. Conservar estas reglas al inicializar Git.

## Verificación autorizada

```powershell
npm run build
npm run check:neon
npm run start:neon
```

En otra terminal:

```powershell
Invoke-RestMethod http://127.0.0.1:3001/api/health
```

`check:neon` reutiliza `verificarBaseDatos()` y el pool real. Consulta solamente
identidad, versión y TLS de la sesión; no imprime URL, host o contraseña.
Express ejecuta la misma consulta antes de escuchar. Salud responde `status: ok`
sin consultar datos institucionales. Detener con Ctrl+C al terminar.

No ejecutar suites de integración, `check:db`, bootstrap, migraciones, limpieza,
login ni operaciones documentales sobre Neon principal durante esta verificación.
El login y los flujos de negocio pueden escribir auditoría. Cualquier prueba de
escritura requiere una rama separada de Neon y autorización previa.

No cambian autenticación, transacciones, auditoría, permisos o validaciones.
La conexión PostgreSQL no utiliza Workers ni Hyperdrive. Pages es únicamente el frontend.

Referencias: [TLS de pg](https://node-postgres.com/features/ssl) y
[conexión segura de Neon](https://neon.com/docs/connect/connect-securely).
TLS se configura en la URL; no se mezcla con un objeto `ssl` adicional que
pueda ser reemplazado al analizar la cadena.
