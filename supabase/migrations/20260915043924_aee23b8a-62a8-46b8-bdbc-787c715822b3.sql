CREATE TYPE public.station_note_category AS ENUM ('isolation', 'warning', 'note');

CREATE TABLE public.station_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id uuid NOT NULL REFERENCES public.stations(id) ON DELETE CASCADE,
  category public.station_note_category NOT NULL DEFAULT 'note',
  title text NOT NULL,
  body text,
  status text NOT NULL DEFAULT 'open',
  author_id uuid REFERENCES auth.users(id),
  author_name text,
  author_role text,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT station_notes_status_chk CHECK (status IN ('open', 'closed'))
);

CREATE INDEX station_notes_station_created_idx ON public.station_notes (station_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.station_notes TO authenticated;
GRANT ALL ON public.station_notes TO service_role;

ALTER TABLE public.station_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY station_notes_select_scoped ON public.station_notes
  FOR SELECT TO authenticated
  USING (public.can_access_station(auth.uid(), station_id));

CREATE POLICY station_notes_insert_scoped ON public.station_notes
  FOR INSERT TO authenticated
  WITH CHECK (public.can_access_station(auth.uid(), station_id) AND author_id = auth.uid());

CREATE POLICY station_notes_update_scoped ON public.station_notes
  FOR UPDATE TO authenticated
  USING (
    public.can_access_station(auth.uid(), station_id)
    AND (author_id = auth.uid() OR public.has_role(auth.uid(), 'supervisor') OR public.has_role(auth.uid(), 'admin'))
  )
  WITH CHECK (
    public.can_access_station(auth.uid(), station_id)
    AND (author_id = auth.uid() OR public.has_role(auth.uid(), 'supervisor') OR public.has_role(auth.uid(), 'admin'))
  );

CREATE POLICY station_notes_delete_admin ON public.station_notes
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER station_notes_touch_updated_at
  BEFORE UPDATE ON public.station_notes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();