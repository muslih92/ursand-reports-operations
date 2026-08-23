insert into public.scada_parameters
  (station_id, equipment_type, equipment_no, group_key, param_key, name_en, name_ar, unit, reference_value, limit_mode, min_value, max_value, sort_order, active)
select
  t.station_id,
  'STATION',
  1,
  case
    when sec.name_en ilike '%chill%' then 'chiller'
    when sec.name_en ilike '%surge%' then 'surge'
    else 'cooling'
  end as group_key,
  'rf_' || left(md5(f.id::text), 12) as param_key,
  f.label_en,
  f.label_ar,
  f.unit,
  null,
  'fixed',
  f.min_value,
  f.max_value,
  f.sort_order,
  true
from public.reading_fields f
join public.reading_sections sec on sec.id = f.section_id
join public.reading_templates t on t.id = sec.template_id
where t.station_id is not null
  and (sec.name_en ilike '%cool%' or sec.name_en ilike '%surge%' or sec.name_en ilike '%chill%')
on conflict (station_id, equipment_type, equipment_no, param_key) do nothing;