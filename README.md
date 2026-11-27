# Sistema Web Documental

Sistema de registro y consulta documental de la I.E. Enrique Paillardelle. Organiza documentos recibidos y emitidos, identifica autor y destinatario, registra ubicación física y conserva historial. React consume una API Express; PostgreSQL conserva los registros y sus reglas de integridad y Cloudflare R2 almacena PDF privados.

## Funciones

- Autenticación por usuario o correo y contraseña, JWT y revalidación de cuenta activa.
- Registro con tipo, correlativo por ámbito/tipo/año y clasificación **Recibido** o **Emitido**, independiente de la situación.
- Delegación con constancia de destino y acceso de **solo lectura** para la cuenta destinataria, conservando autor y ámbito.
- Estantes y archivadores propios, ubicación actual y ruta histórica.
- Carga, reemplazo, visualización y descarga de PDF con permisos, limpieza y retención.
- Historial, auditoría, documentos relacionados y consulta histórica tras relevo de oficina.
- Dashboard por perfil y exportación Excel por periodo.
- Administración de cuentas, oficinas, nombres visibles de roles, tipos y relevos.

Las reglas se explican en [Funcionamiento](documentacion-publica/FUNCIONAMIENTO.md).

## Tecnologías y requisitos

| Área | Tecnologías |
|---|---|
| API | Node.js 24, TypeScript 6, Express 5, Zod, pg, JWT y scrypt |
| Interfaz | React 19, React Router 7, Vite 8, React Hook Form, CSS Modules y Tailwind CSS 4 |
| Datos | PostgreSQL 18; Neon en remoto |
| PDF e informes | SDK S3 para R2, pdf-lib, PDF.js y ExcelJS |
| Verificación | ESLint, TypeScript y `node:test` |
| Publicación | Render y Cloudflare Pages |

Se necesitan Git, Node.js **24.x**, npm y PostgreSQL **18**. Para pruebas aisladas, `initdb`, `postgres`, `pg_ctl` y `psql` deben estar en `PATH` o `POSTGRES_TEST_BIN`. Los `package-lock.json` fijan las versiones que instala `npm ci`.

## Estructura resumida

El [mapa en la raíz](ESTRUCTURA.md) muestra las carpetas principales con sangrías y enlaza las guías de backend, frontend y base de datos.

La [estructura explicada](documentacion-publica/ESTRUCTURA.md) describe las carpetas y los archivos
principales, y la conexión entre pantallas, API y base de datos. La
[documentación pública](documentacion-publica/README.md) reúne las guías para lectores e instructores.
`docs/` conserva informes y evidencias internos; no es la guía de instalación.

## Inicio rápido local

Los comandos parten de la raíz del repositorio. En PowerShell se necesita PostgreSQL en `PATH`.

1. Crear una base **nueva y vacía**. Si existe una base de trabajo, conservarla y consultar la [guía SQL](database/README.md).

   ```sh
   createdb -h localhost -p 5432 -U postgres -W -E UTF8 sistema_web_documental_final
   psql -X -h localhost -p 5432 -U postgres -W -d sistema_web_documental_final -v ON_ERROR_STOP=1 -f database/instalar.sql
   ```

2. Preparar la API:

   ```sh
   cd backend
   npm ci
   ```

   Copiar `.env.example` como `.env`, completar `DATABASE_URL` y `JWT_SECRET` y crear la primera cuenta mediante [Cuentas iniciales](database/CUENTAS_MANUALES.md). Arrancar:

   ```sh
   npm run dev
   ```

3. En otra terminal, desde la raíz:

   ```sh
   cd frontend
   npm ci
   npm run dev
   ```

   Abrir [la interfaz local](http://localhost:5173). Vite reenvía `/api` al puerto 3000; `VITE_API_URL` puede quedar vacío. La API ofrece [salud local](http://localhost:3000/api/health). El instalador no crea cuentas ni contraseñas. Configurar R2 por separado para habilitar PDF.

## Documentación y comprobaciones

- [Backend: instalación, configuración, comandos y pruebas](backend/README.md).
- [Frontend: instalación, configuración, comandos y pruebas](frontend/README.md).
- [Estructura y recorrido del código](documentacion-publica/ESTRUCTURA.md).
- [Funcionamiento y reglas de acceso](documentacion-publica/FUNCIONAMIENTO.md).
- [Base de datos desde cero](database/README.md).
- [Despliegue manual en Neon, Render y Cloudflare Pages](documentacion-publica/DESPLIEGUE_MANUAL.md).

En **cada** proyecto están disponibles `npm run lint`, `npm run typecheck`, `npm test` y `npm run build`.
El backend también ofrece `npm run test:revision:local`. Las suites predeterminadas usan datos
sintéticos (datos inventados para las pruebas); no requieren cuentas reales, Neon, R2 ni navegador.
Los comandos de prueba del backend crean una instancia PostgreSQL temporal. No son necesarios
para leer la documentación ni para arrancar la aplicación con una base ya preparada.
