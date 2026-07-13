-- Enum for equipment status
CREATE TYPE public.equipment_status AS ENUM ('in_service', 'standby', 'out_of_service', 'fixed_speed');

-- Fixed equipment list per station
CREATE TABLE public.station_equipment (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  station_id UUID NOT NULL REFERENCES public.stations(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name_en TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (station_id, code)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.station_equipment TO authenticated;
GRANT ALL ON public.station_equipment TO service_role;
ALTER TABLE public.station_equipment ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view station equipment" ON public.station_equipment
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins & supervisors manage station equipment" ON public.station_equipment
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supervisor'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supervisor'));

CREATE TRIGGER trg_station_equipment_updated
BEFORE UPDATE ON public.station_equipment
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Daily availability entries (one per station+date)
CREATE TABLE public.equipment_availability_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  station_id UUID NOT NULL REFERENCES public.stations(id) ON DELETE CASCADE,
  entry_date DATE NOT NULL,
  notes TEXT,
  operator_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  operator_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (station_id, entry_date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.equipment_availability_entries TO authenticated;
GRANT ALL ON public.equipment_availability_entries TO service_role;
ALTER TABLE public.equipment_availability_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated view availability entries" ON public.equipment_availability_entries
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Operators & up manage availability entries" ON public.equipment_availability_entries
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'supervisor')
    OR public.has_role(auth.uid(), 'operator')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'supervisor')
    OR public.has_role(auth.uid(), 'operator')
  );

CREATE TRIGGER trg_availability_entries_updated
BEFORE UPDATE ON public.equipment_availability_entries
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Per-equipment status values for each entry
CREATE TABLE public.equipment_availability_values (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entry_id UUID NOT NULL REFERENCES public.equipment_availability_entries(id) ON DELETE CASCADE,
  equipment_id UUID NOT NULL REFERENCES public.station_equipment(id) ON DELETE CASCADE,
  status public.equipment_status NOT NULL,
  remark TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entry_id, equipment_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.equipment_availability_values TO authenticated;
GRANT ALL ON public.equipment_availability_values TO service_role;
ALTER TABLE public.equipment_availability_values ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated view availability values" ON public.equipment_availability_values
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Operators & up manage availability values" ON public.equipment_availability_values
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'supervisor')
    OR public.has_role(auth.uid(), 'operator')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'supervisor')
    OR public.has_role(auth.uid(), 'operator')
  );

CREATE TRIGGER trg_availability_values_updated
BEFORE UPDATE ON public.equipment_availability_values
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
