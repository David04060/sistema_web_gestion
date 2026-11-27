# Cuentas iniciales

[Base de datos](README.md) · [Inicio](../README.md)

El instalador crea roles técnicos y oficinas, pero ninguna cuenta. La primera cuenta debe ser Superadministrador; las restantes se crean desde la administración del sistema para aplicar validación, pertenencia y auditoría.

## Generar un hash

Desde `backend/`, después de `npm ci`, ejecutar en una terminal interactiva:

```sh
npm run hash:local
```

El comando solicita la contraseña con entrada oculta, genera un hash `scrypt$16384$8$1$sal$derivado` y no crea usuarios. La contraseña debe tener entre 8 y 128 caracteres. Guardar el hash solo para el alta inicial en una sesión privada; no incluirlo en código, informes ni argumentos de consola.

## Crear la primera cuenta con psql

Conectar a la base recién instalada como propietario o cuenta de mantenimiento. Verificar el destino y los catálogos:

```sql
SELECT current_database(), current_user, current_schema();
SELECT id, codigo FROM public.roles ORDER BY id;
SELECT count(*) FROM public.usuarios;
```

En una sesión **interactiva de psql**, solicitar los valores y ejecutar el alta. `\prompt` evita incrustar datos personales en el archivo SQL del repositorio. El hash se trata como secreto aunque no sea la contraseña original.

```sql
\prompt 'Nombre: ' nombre
\prompt 'Apellido: ' apellido
\prompt 'Usuario en minusculas: ' usuario
\prompt 'Hash scrypt generado: ' hash
BEGIN;
INSERT INTO public.usuarios
  (rol_id, nombre, apellido, nombre_usuario, contrasena_hash)
SELECT id, :'nombre', :'apellido', :'usuario', :'hash'
FROM public.roles WHERE codigo = 'SUPERADMINISTRADOR'
RETURNING id, nombre_usuario;
COMMIT;
\unset hash
```

No asignar oficina ni pertenencia al Superadministrador. El índice parcial limita este rol a una cuenta. El nombre de usuario utiliza entre 3 y 80 caracteres alfanuméricos, punto, guion o guion bajo, en minúsculas. Ante un error dentro de la transacción, ejecutar `ROLLBACK` y corregir la entrada.

## Pertenencias de las cuentas posteriores

| Código estable | Oficina | Ámbito |
|---|---|---|
| `SUPERADMINISTRADOR` | Ninguna | Ninguno; lectura global por rol |
| `ADMINISTRADOR` | Ninguna | Ninguno |
| `DIRECTOR` | Dirección | Compartido con Secretaría |
| `SECRETARIA_DIRECCION` | Mesa de Partes | Compartido con Dirección |
| `USUARIO` | Opcional, según asignación | Personal, propio de esa cuenta |

La API crea estas relaciones transaccionalmente. Dos usuarios de una oficina tienen ámbitos personales distintos. Una delegación no agrega al destinatario al ámbito del autor. Para comprobar las cuentas sin exponer hashes:

```sql
SELECT u.id, u.nombre_usuario, r.codigo, o.nombre AS oficina, a.clase
FROM public.usuarios u
JOIN public.roles r ON r.id = u.rol_id
LEFT JOIN public.oficinas o ON o.id = u.oficina_id
LEFT JOIN public.miembros_ambito m ON m.usuario_id = u.id
LEFT JOIN public.ambitos_registro a ON a.id = m.ambito_id
ORDER BY u.id;
```
