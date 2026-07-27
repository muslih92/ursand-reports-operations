
ALTER TYPE public.equipment_status ADD VALUE IF NOT EXISTS 'not_available';
ALTER TYPE public.equipment_status ADD VALUE IF NOT EXISTS 'shutdown';
ALTER TYPE public.equipment_status ADD VALUE IF NOT EXISTS 'testing';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'management';

ALTER TABLE public.equipment_availability_entries
  ADD COLUMN IF NOT EXISTS shift text,
  ADD COLUMN IF NOT EXISTS supervisor_name text,
  ADD COLUMN IF NOT EXISTS supervisor_id uuid,
  ADD COLUMN IF NOT EXISTS report_status text NOT NULL DEFAULT 'draft';
