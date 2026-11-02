# Creación manual de cuentas iniciales

No se ejecutó ningún INSERT de usuarios, ni se generó una cuenta de bootstrap.
No se usa `.env.bootstrap-local`. Todo lo siguiente es una guía para el propietario.

## Hash compatible, sin guardar la contraseña

En una terminal PowerShell interactiva:

```powershell
Set-Location C:\Users\David\Sistema_Web_Final\backend
npm run hash:local
```

El comando pide la contraseña con entrada oculta; no la recibe por argumentos,
no la guarda en un archivo y no crea usuarios. Copia únicamente el hash que
devuelve para el INSERT manual. El formato es `scrypt$16384$8$1$sal$derivado`.
El login existente verifica ese formato con comparación de tiempo constante.
No pegues la contraseña ni el hash en el chat. No uses el comando con redirecciones
de entrada, grabación de terminal ni argumentos que contengan la contraseña.

## Columnas de usuarios

Obligatorias: `rol_id`, `nombre`, `apellido`, `nombre_usuario`, `contrasena_hash`.
El ID es identidad. `activo` empieza true y `version_autenticacion` empieza 0.
`email`, `telefono` y `oficina_id` admiten NULL. Usa nombre_usuario en minúsculas,
único, de 3–80 caracteres alfanuméricos, punto, guion o guion bajo para coincidir
con la validación del backend. La contraseña debe tener 8–128 caracteres.

| Código de rol | ID sembrado | Oficina | Pertenencia |
|---|---|---|---|
| SUPERADMINISTRADOR | 1 | NULL | Ninguna; lectura global por rol |
| ADMINISTRADOR | 2 | NULL | Ninguna |
| DIRECTOR | 3 | ID de Dirección | Ámbito COMPARTIDO_DIRECCION |
| SECRETARIA_DIRECCION | 4 | ID de Mesa de Partes | Ámbito COMPARTIDO_DIRECCION |
| USUARIO | 5 | NULL o una oficina existente | Ámbito PERSONAL cuyo titular sea esa misma cuenta |

Consulta los IDs reales antes de insertar:

```sql
SELECT current_database(), inet_server_addr(), inet_server_port();
SELECT id,codigo FROM roles ORDER BY id;
SELECT id,nombre FROM oficinas ORDER BY id;
SELECT id,clase,titular_id FROM ambitos_registro ORDER BY id;
```

La base debe ser `sistema_web_documental_final` local. No ejecutar en la anterior
ni en producción. No uses un ID manual de usuario; usa el ID de `RETURNING id`.
Un solo Superadministrador: el índice parcial rechazará una segunda cuenta.

## Plantilla SQL manual

Esta plantilla contiene marcadores que debes sustituir en tu editor privado;
no es un archivo ejecutable ni se ejecutó como parte de la adaptación:

```sql
BEGIN;
INSERT INTO usuarios(rol_id,oficina_id,nombre,apellido,nombre_usuario,contrasena_hash)
VALUES (<ID_ROL>, <ID_OFICINA_O_NULL>, '<NOMBRE>', '<APELLIDO>',
        '<USUARIO_MINUSCULAS>', '<HASH_SCRYPT_GENERADO>')
RETURNING id;
-- Completar la pertenencia correspondiente debajo antes de confirmar.
COMMIT;
```

Para Superadministrador y Administrador no insertes miembros_ambito.
Para Dirección y Secretaría, dentro de la misma transacción y usando el ID devuelto:

```sql
INSERT INTO miembros_ambito(usuario_id,ambito_id)
SELECT <ID_USUARIO>,id FROM ambitos_registro WHERE clase='COMPARTIDO_DIRECCION';
```

Para cada Usuario, crea su ámbito personal y vincúlalo **en la misma transacción**:

```sql
WITH ambito AS (
  INSERT INTO ambitos_registro(clase,titular_id)
  VALUES('PERSONAL',<ID_USUARIO>) RETURNING id
)
INSERT INTO miembros_ambito(usuario_id,ambito_id)
SELECT <ID_USUARIO>,id FROM ambito;
```

Dos Usuarios de la misma oficina necesitan ámbitos personales distintos. No
insertes al destinatario de una delegación como miembro del ámbito del autor.
Los triggers rechazan Dirección fuera de Dirección, Secretaría fuera de Mesa
de Partes y cuentas administrativas con oficina documental.

Verifica sin consultar hashes:

```sql
SELECT u.id,u.nombre_usuario,r.codigo,o.nombre oficina,m.ambito_id,a.clase,a.titular_id
FROM usuarios u JOIN roles r ON r.id=u.rol_id
LEFT JOIN oficinas o ON o.id=u.oficina_id
LEFT JOIN miembros_ambito m ON m.usuario_id=u.id
LEFT JOIN ambitos_registro a ON a.id=m.ambito_id ORDER BY u.id;
```

Después avisa que las cuentas están registradas. Las comprobaciones autenticadas
se realizarán sobre esas cuentas y con las restricciones de datos que indiques.
