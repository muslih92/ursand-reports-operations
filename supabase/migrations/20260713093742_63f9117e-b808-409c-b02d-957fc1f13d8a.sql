ALTER TABLE public.equipment_availability_values
  ADD COLUMN IF NOT EXISTS problem_description text,
  ADD COLUMN IF NOT EXISTS work_notification text,
  ADD COLUMN IF NOT EXISTS work_center text,
  ADD COLUMN IF NOT EXISTS notification_date date,
  ADD COLUMN IF NOT EXISTS ets text;