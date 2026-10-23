# PostgreSQL local y Neon

Ejecutar desde `backend/`. Se reutilizan el pool de `pg` y los repositorios.

- Local: `npm run dev` o `npm start` después de compilar. Usa `.env` (o el
  `DOTENV_CONFIG_PATH` existente) y exige la base `sistema_web_final`.
- Neon: `npm run dev:neon` o `npm run start:neon` después de compilar.
  `--neon` carga exclusivamente `.env.neon`, con precedencia sobre variables
  heredadas para las claves definidas en ese archivo. No carga `.env`.

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
login ni operaciones documentales sobre `neondb` durante esta verificación.
El login y los flujos de negocio pueden escribir auditoría. Cualquier prueba de
escritura requiere una rama separada de Neon y autorización previa.

No cambian autenticación, transacciones, auditoría, permisos o validaciones.
No se configuran servicios Cloudflare.

Referencias: [TLS de pg](https://node-postgres.com/features/ssl) y
[conexión segura de Neon](https://neon.com/docs/connect/connect-securely).
TLS se configura en la URL; no se mezcla con un objeto `ssl` adicional que
pueda ser reemplazado al analizar la cadena.
