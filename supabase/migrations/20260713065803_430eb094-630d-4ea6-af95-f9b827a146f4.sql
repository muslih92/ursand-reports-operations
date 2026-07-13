
CREATE TYPE public.app_role AS ENUM ('admin', 'supervisor', 'operator', 'viewer');
CREATE TYPE public.reading_frequency AS ENUM ('hourly', 'every_2h', 'every_6h');
CREATE TYPE public.incident_status AS ENUM ('open', 'in_progress', 'closed');
CREATE TYPE public.incident_severity AS ENUM ('low', 'medium', 'high', 'critical');

CREATE TABLE public.stations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name_en TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  location TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stations TO authenticated;
GRANT ALL ON public.stations TO service_role;
ALTER TABLE public.stations ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_no TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  station_id UUID REFERENCES public.stations(id) ON DELETE SET NULL,
  phone TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.get_user_station(_user_id UUID)
RETURNS UUID LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT station_id FROM public.profiles WHERE id = _user_id
$$;

CREATE TABLE public.reading_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name_en TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  station_id UUID REFERENCES public.stations(id) ON DELETE SET NULL,
  frequency public.reading_frequency NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reading_templates TO authenticated;
GRANT ALL ON public.reading_templates TO service_role;
ALTER TABLE public.reading_templates ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.reading_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.reading_templates(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  label_en TEXT NOT NULL,
  label_ar TEXT,
  unit TEXT,
  min_value NUMERIC,
  max_value NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reading_fields TO authenticated;
GRANT ALL ON public.reading_fields TO service_role;
ALTER TABLE public.reading_fields ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.reading_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.reading_templates(id) ON DELETE CASCADE,
  station_id UUID NOT NULL REFERENCES public.stations(id) ON DELETE CASCADE,
  entry_date DATE NOT NULL,
  operator_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  operator_name TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (template_id, entry_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reading_entries TO authenticated;
GRANT ALL ON public.reading_entries TO service_role;
ALTER TABLE public.reading_entries ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.reading_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES public.reading_entries(id) ON DELETE CASCADE,
  field_id UUID NOT NULL REFERENCES public.reading_fields(id) ON DELETE CASCADE,
  time_slot TEXT NOT NULL,
  value NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entry_id, field_id, time_slot)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reading_values TO authenticated;
GRANT ALL ON public.reading_values TO service_role;
ALTER TABLE public.reading_values ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id UUID NOT NULL REFERENCES public.stations(id) ON DELETE CASCADE,
  equipment TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  root_cause TEXT,
  action_taken TEXT,
  severity public.incident_severity NOT NULL DEFAULT 'medium',
  status public.incident_status NOT NULL DEFAULT 'open',
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reported_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reporter_name TEXT,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.incidents TO authenticated;
GRANT ALL ON public.incidents TO service_role;
ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.incident_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  content_type TEXT,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.incident_attachments TO authenticated;
GRANT ALL ON public.incident_attachments TO service_role;
ALTER TABLE public.incident_attachments ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "profiles_read" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supervisor') OR public.has_role(auth.uid(),'viewer'));
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "profiles_delete" ON public.profiles FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

CREATE POLICY "user_roles_read" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "stations_read" ON public.stations FOR SELECT TO authenticated USING (true);
CREATE POLICY "stations_admin" ON public.stations FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "templates_read" ON public.reading_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "templates_admin" ON public.reading_templates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "fields_read" ON public.reading_fields FOR SELECT TO authenticated USING (true);
CREATE POLICY "fields_admin" ON public.reading_fields FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "entries_read" ON public.reading_entries FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supervisor') OR public.has_role(auth.uid(),'viewer') OR station_id = public.get_user_station(auth.uid()));
CREATE POLICY "entries_insert" ON public.reading_entries FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supervisor') OR (public.has_role(auth.uid(),'operator') AND station_id = public.get_user_station(auth.uid())));
CREATE POLICY "entries_update" ON public.reading_entries FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supervisor') OR (public.has_role(auth.uid(),'operator') AND station_id = public.get_user_station(auth.uid())))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supervisor') OR (public.has_role(auth.uid(),'operator') AND station_id = public.get_user_station(auth.uid())));
CREATE POLICY "entries_delete" ON public.reading_entries FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

CREATE POLICY "values_read" ON public.reading_values FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.reading_entries e WHERE e.id = entry_id AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supervisor') OR public.has_role(auth.uid(),'viewer') OR e.station_id = public.get_user_station(auth.uid()))));
CREATE POLICY "values_write" ON public.reading_values FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.reading_entries e WHERE e.id = entry_id AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supervisor') OR (public.has_role(auth.uid(),'operator') AND e.station_id = public.get_user_station(auth.uid())))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.reading_entries e WHERE e.id = entry_id AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supervisor') OR (public.has_role(auth.uid(),'operator') AND e.station_id = public.get_user_station(auth.uid())))));

CREATE POLICY "incidents_read" ON public.incidents FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supervisor') OR public.has_role(auth.uid(),'viewer') OR station_id = public.get_user_station(auth.uid()));
CREATE POLICY "incidents_insert" ON public.incidents FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supervisor') OR (public.has_role(auth.uid(),'operator') AND station_id = public.get_user_station(auth.uid())));
CREATE POLICY "incidents_update" ON public.incidents FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supervisor') OR (public.has_role(auth.uid(),'operator') AND reported_by = auth.uid()))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supervisor') OR (public.has_role(auth.uid(),'operator') AND reported_by = auth.uid()));
CREATE POLICY "incidents_delete" ON public.incidents FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

CREATE POLICY "att_read" ON public.incident_attachments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.incidents i WHERE i.id = incident_id AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supervisor') OR public.has_role(auth.uid(),'viewer') OR i.station_id = public.get_user_station(auth.uid()))));
CREATE POLICY "att_write" ON public.incident_attachments FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.incidents i WHERE i.id = incident_id AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supervisor') OR (public.has_role(auth.uid(),'operator') AND i.station_id = public.get_user_station(auth.uid())))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.incidents i WHERE i.id = incident_id AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supervisor') OR (public.has_role(auth.uid(),'operator') AND i.station_id = public.get_user_station(auth.uid())))));

CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_profiles_touch BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_entries_touch BEFORE UPDATE ON public.reading_entries FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_values_touch BEFORE UPDATE ON public.reading_values FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_incidents_touch BEFORE UPDATE ON public.incidents FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
