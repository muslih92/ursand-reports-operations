
ALTER TABLE public.reading_values ADD COLUMN IF NOT EXISTS status text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'equipment_status' AND e.enumlabel = 'maintenance'
  ) THEN
    ALTER TYPE public.equipment_status ADD VALUE 'maintenance';
  END IF;
END$$;
