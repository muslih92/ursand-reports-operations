DO $$
DECLARE t RECORD; h RECORD; new_sec uuid; next_order int; old_sec uuid;
BEGIN
  FOR t IN
    SELECT tpl.id, tpl.code
    FROM public.reading_templates tpl
    WHERE (SELECT count(*) FROM public.reading_sections s WHERE s.template_id = tpl.id) = 1
      AND EXISTS (SELECT 1 FROM public.reading_fields f WHERE f.template_id = tpl.id AND f.unit IS NULL)
  LOOP
    SELECT id INTO old_sec FROM public.reading_sections WHERE template_id = t.id LIMIT 1;
    FOR h IN
      SELECT id, sort_order, label_en, label_ar
      FROM public.reading_fields
      WHERE template_id = t.id AND unit IS NULL
      ORDER BY sort_order
    LOOP
      SELECT COALESCE(MIN(sort_order), 2147483647) INTO next_order
      FROM public.reading_fields
      WHERE template_id = t.id AND unit IS NULL AND sort_order > h.sort_order;

      INSERT INTO public.reading_sections (template_id, sort_order, name_en, name_ar)
      VALUES (t.id, h.sort_order, h.label_en, COALESCE(h.label_ar, h.label_en))
      RETURNING id INTO new_sec;

      UPDATE public.reading_fields
      SET section_id = new_sec
      WHERE template_id = t.id
        AND unit IS NOT NULL
        AND sort_order > h.sort_order
        AND sort_order < next_order;
    END LOOP;

    DELETE FROM public.reading_values v
    USING public.reading_fields f
    WHERE v.field_id = f.id AND f.template_id = t.id AND f.unit IS NULL;

    DELETE FROM public.reading_fields WHERE template_id = t.id AND unit IS NULL;

    DELETE FROM public.reading_sections s
    WHERE s.id = old_sec
      AND NOT EXISTS (SELECT 1 FROM public.reading_fields f WHERE f.section_id = s.id);
  END LOOP;
END $$;