/** Proyección pública de los cinco roles fijos; las consultas consumidoras usan el alias r. */
export const nombresRolSQL = `CASE r.codigo WHEN 'SUPERADMINISTRADOR' THEN 'Superadministrador' WHEN 'ADMINISTRADOR' THEN
  'Administrador' WHEN 'DIRECTOR' THEN 'Director(a)' WHEN 'SECRETARIA_DIRECCION' THEN 'Secretaria de Dirección'
  ELSE 'Usuario' END`;
