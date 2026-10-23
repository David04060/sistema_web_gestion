-- Cambio autorizado: oficina institucional independiente de la cuenta responsable.
-- Ejecutar dentro de una transacción; rechazar un backfill implícito si aparecen filas.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='estantes' AND column_name='oficina_id') THEN
    IF EXISTS (SELECT 1 FROM public.estantes) THEN
      RAISE EXCEPTION 'Hay estantes existentes: se requiere una asignacion de oficina revisada';
    END IF;
    ALTER TABLE public.estantes ADD COLUMN oficina_id bigint NOT NULL REFERENCES public.oficinas(id) ON DELETE RESTRICT;
    CREATE INDEX ix_estantes_oficina ON public.estantes(oficina_id);
  END IF;
END $$;
