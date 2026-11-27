-- Inserta únicamente cinco roles, dos oficinas institucionales y el ámbito compartido. No crea cuentas.
-- Se ejecuta desde database/instalar.sql, dentro de una sola transacción.
SET search_path = public;

INSERT INTO roles (id, codigo)
VALUES
  (1, 'SUPERADMINISTRADOR'),
  (2, 'ADMINISTRADOR'),
  (3, 'DIRECTOR'),
  (4, 'SECRETARIA_DIRECCION'),
  (5, 'USUARIO');

INSERT INTO oficinas (nombre)
VALUES
  ('Dirección'),
  ('Mesa de Partes');

INSERT INTO ambitos_registro (clase)
  VALUES ('COMPARTIDO_DIRECCION');
