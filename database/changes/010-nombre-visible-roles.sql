BEGIN;
ALTER TABLE public.roles
  ADD COLUMN nombre_visible text
  CHECK (nombre_visible IS NULL OR char_length(btrim(nombre_visible)) BETWEEN 1 AND 250);
COMMIT;
