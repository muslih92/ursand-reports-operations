ALTER TYPE public.equipment_status ADD VALUE IF NOT EXISTS 'emergency_standby';
ALTER TYPE public.equipment_status ADD VALUE IF NOT EXISTS 'standby_fixed_speed';
ALTER TYPE public.equipment_status ADD VALUE IF NOT EXISTS 'in_service_fixed_speed';
ALTER TYPE public.equipment_status ADD VALUE IF NOT EXISTS 'running_on_emergency';