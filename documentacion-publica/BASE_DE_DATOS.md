# Preparar PostgreSQL desde cero

[Inicio](../README.md) · [SQL y orden de ejecución](../database/README.md)

1. Instalar PostgreSQL 18 con cliente psql y herramientas de servidor.
2. Seguir [creación de base vacía](../database/README.md), ejecutando únicamente
   `database/instalar.sql`. Cada bloque incluido forma parte de la misma transacción.
3. Verificar tablas y catálogos con las consultas de esa guía. Deben existir cero
   usuarios y cero documentos antes de la configuración inicial.
4. Crear la primera cuenta con [Cuentas iniciales](../database/CUENTAS_MANUALES.md).
5. Configurar la conexión del [backend](../backend/README.md). Al arrancar comprueba
   base, cuenta, esquema e identidad; nunca ejecuta migraciones automáticamente.

Para Neon, el [procedimiento manual](DESPLIEGUE_MANUAL.md) explica cómo crear la base,
el rol SQL de aplicación, sus permisos y la conexión cifrada.
Las contraseñas y los registros de una instalación no forman parte de los archivos SQL.

La [organización SQL](../database/README.md#organización-y-orden) distingue los bloques de
`instalacion/`, el instalador único, la referencia `schema/` y las migraciones de `changes/`.
Los instaladores repiten las mismas definiciones en dos formatos alternativos; los archivos
de referencia permiten estudiarlas, pero no completan ni sustituyen la instalación.
