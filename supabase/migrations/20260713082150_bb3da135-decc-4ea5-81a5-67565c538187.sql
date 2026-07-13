
ALTER TABLE public.shift_reports
  DROP COLUMN line1_label, DROP COLUMN line1_mp1, DROP COLUMN line1_mp2, DROP COLUMN line1_mp3, DROP COLUMN line1_mp4,
  DROP COLUMN line1_inlet, DROP COLUMN line1_outlet, DROP COLUMN line1_flow, DROP COLUMN line1_svs,
  DROP COLUMN line2_label, DROP COLUMN line2_mp1, DROP COLUMN line2_mp2, DROP COLUMN line2_mp3, DROP COLUMN line2_mp4,
  DROP COLUMN line2_inlet, DROP COLUMN line2_outlet, DROP COLUMN line2_flow, DROP COLUMN line2_svs,
  ADD COLUMN lines jsonb NOT NULL DEFAULT '[]'::jsonb;
