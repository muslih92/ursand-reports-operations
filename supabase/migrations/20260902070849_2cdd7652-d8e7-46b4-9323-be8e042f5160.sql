DO $$
DECLARE
  r RECORD;
  pos INT;
  rotated TEXT[];
BEGIN
  FOR r IN SELECT id, time_slots FROM public.reading_templates LOOP
    pos := array_position(r.time_slots, '04:00');
    IF pos IS NOT NULL AND pos > 1 THEN
      rotated := r.time_slots[pos:array_length(r.time_slots,1)] || r.time_slots[1:pos-1];
      UPDATE public.reading_templates SET time_slots = rotated WHERE id = r.id;
    END IF;
  END LOOP;
END $$;