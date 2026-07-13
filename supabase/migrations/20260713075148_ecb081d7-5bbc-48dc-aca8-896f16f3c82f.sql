
DO $$
DECLARE tid uuid; sid uuid;
BEGIN
  SELECT id INTO tid FROM public.reading_templates WHERE name_en='HPT-AB';
  DELETE FROM public.reading_fields WHERE section_id IN (SELECT id FROM public.reading_sections WHERE template_id=tid AND sort_order=0);
  DELETE FROM public.reading_sections WHERE template_id=tid AND sort_order=0;
  UPDATE public.reading_sections SET sort_order=sort_order+7 WHERE template_id=tid;

  INSERT INTO public.reading_sections (template_id,sort_order,name_en,name_ar) VALUES (tid,0,'Station - Line A','المحطة - خط A') RETURNING id INTO sid;
  INSERT INTO public.reading_fields (template_id,section_id,sort_order,label_en,label_ar,unit) VALUES
    (tid,sid,0,'Inlet Flow','التدفق الداخل','mᵌ/hr'),
    (tid,sid,1,'Totalizer','العدّاد','mᵌ'),
    (tid,sid,2,'Inlet Pressure','ضغط الدخول','Bar'),
    (tid,sid,3,'Station Pressure','ضغط المحطة','Bar');

  INSERT INTO public.reading_sections (template_id,sort_order,name_en,name_ar) VALUES (tid,1,'Station - Line B','المحطة - خط B') RETURNING id INTO sid;
  INSERT INTO public.reading_fields (template_id,section_id,sort_order,label_en,label_ar,unit) VALUES
    (tid,sid,0,'Inlet Flow','التدفق الداخل','mᵌ/hr'),
    (tid,sid,1,'Totalizer','العدّاد','mᵌ'),
    (tid,sid,2,'Inlet Pressure','ضغط الدخول','Bar'),
    (tid,sid,3,'Station Pressure','ضغط المحطة','Bar');

  INSERT INTO public.reading_sections (template_id,sort_order,name_en,name_ar) VALUES (tid,2,'Station - Hunnai','المحطة - هنائي') RETURNING id INTO sid;
  INSERT INTO public.reading_fields (template_id,section_id,sort_order,label_en,label_ar,unit) VALUES
    (tid,sid,0,'Inlet Flow','التدفق الداخل','mᵌ/hr'),
    (tid,sid,1,'Totalizer','العدّاد','mᵌ'),
    (tid,sid,2,'BPT Level','مستوى BPT','m');

  INSERT INTO public.reading_sections (template_id,sort_order,name_en,name_ar) VALUES (tid,3,'Station - Saad 2','المحطة - سعد 2') RETURNING id INTO sid;
  INSERT INTO public.reading_fields (template_id,section_id,sort_order,label_en,label_ar,unit) VALUES
    (tid,sid,0,'Inlet Flow','التدفق الداخل','mᵌ/hr'),
    (tid,sid,1,'Totalizer','العدّاد','mᵌ'),
    (tid,sid,2,'BPT Level','مستوى BPT','m');

  INSERT INTO public.reading_sections (template_id,sort_order,name_en,name_ar) VALUES (tid,4,'Station - Line C','المحطة - خط C') RETURNING id INTO sid;
  INSERT INTO public.reading_fields (template_id,section_id,sort_order,label_en,label_ar,unit) VALUES
    (tid,sid,0,'Inlet Flow','التدفق الداخل','mᵌ/hr');

  INSERT INTO public.reading_sections (template_id,sort_order,name_en,name_ar) VALUES (tid,5,'City Feeders','مغذيات المدينة') RETURNING id INTO sid;
  INSERT INTO public.reading_fields (template_id,section_id,sort_order,label_en,label_ar,unit) VALUES
    (tid,sid,0,'Feeder 1 - Outlet Flow','مغذي 1 - التدفق الخارج','mᵌ/hr'),
    (tid,sid,1,'Feeder 1 - Totalizer','مغذي 1 - العدّاد','mᵌ'),
    (tid,sid,2,'Feeder 2 - Outlet Flow','مغذي 2 - التدفق الخارج','mᵌ/hr'),
    (tid,sid,3,'Feeder 2 - Totalizer','مغذي 2 - العدّاد','mᵌ'),
    (tid,sid,4,'Feeder 3 - Outlet Flow','مغذي 3 - التدفق الخارج','mᵌ/hr'),
    (tid,sid,5,'Feeder 3 - Totalizer','مغذي 3 - العدّاد','mᵌ'),
    (tid,sid,6,'Feeder 4 - Outlet Flow','مغذي 4 - التدفق الخارج','mᵌ/hr'),
    (tid,sid,7,'Feeder 4 - Totalizer','مغذي 4 - العدّاد','mᵌ'),
    (tid,sid,8,'Feeder 5 - Outlet Flow','مغذي 5 - التدفق الخارج','mᵌ/hr'),
    (tid,sid,9,'Feeder 5 - Totalizer','مغذي 5 - العدّاد','mᵌ'),
    (tid,sid,10,'Feeder 6 - Outlet Flow','مغذي 6 - التدفق الخارج','mᵌ/hr'),
    (tid,sid,11,'Feeder 6 - Totalizer','مغذي 6 - العدّاد','mᵌ'),
    (tid,sid,12,'Feeder 12 - Outlet Flow','مغذي 12 - التدفق الخارج','mᵌ/hr'),
    (tid,sid,13,'Feeder 12 - Totalizer','مغذي 12 - العدّاد','mᵌ');

  INSERT INTO public.reading_sections (template_id,sort_order,name_en,name_ar) VALUES (tid,6,'Reservoir 1 - Hunnai + Saad 2','الخزان 1 - هنائي + سعد 2') RETURNING id INTO sid;
  INSERT INTO public.reading_fields (template_id,section_id,sort_order,label_en,label_ar,unit) VALUES
    (tid,sid,0,'Inlet Flow','تدفق الداخل','mᵌ/hr'),
    (tid,sid,1,'Inlet Totalizer','عدّاد الداخل','mᵌ'),
    (tid,sid,2,'Outlet Flow','تدفق الخارج','mᵌ/hr'),
    (tid,sid,3,'Outlet Totalizer','عدّاد الخارج','mᵌ');

  INSERT INTO public.reading_sections (template_id,sort_order,name_en,name_ar) VALUES (tid,7,'Reservoir 2 - Hunnai + Saad 2','الخزان 2 - هنائي + سعد 2') RETURNING id INTO sid;
  INSERT INTO public.reading_fields (template_id,section_id,sort_order,label_en,label_ar,unit) VALUES
    (tid,sid,0,'Inlet Flow','تدفق الداخل','mᵌ/hr'),
    (tid,sid,1,'Inlet Totalizer','عدّاد الداخل','mᵌ'),
    (tid,sid,2,'Outlet Flow','تدفق الخارج','mᵌ/hr'),
    (tid,sid,3,'Outlet Totalizer','عدّاد الخارج','mᵌ');
END $$;
