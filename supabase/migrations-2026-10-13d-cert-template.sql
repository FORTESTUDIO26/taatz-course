-- עדכון 2026-10-13 (ד): תעודת גמר לפי תבנית המנהלת — ת״ז מודפסת תמיד, והתבנית (מהאזור המוגן) מוחזרת עם נתוני התעודה.
-- בטוח להרצה חוזרת. אינו מוחק נתונים. התבנית עצמה נשמרת במסך הניהול בטבלה private_assets (מפתח cert_template), לא בקוד.
create or replace function public._cert_payload(c public.certificates) returns json
language sql stable security definer set search_path = public as $$
  -- תעודת גמר לפי תבנית המנהלת: ת״ז מודפסת תמיד (החלטת המנהלת, 13.10.2026). התבנית נשמרת באזור המוגן (private_assets).
  select json_build_object('id', c.id, 'cert_no', c.cert_no, 'full_name', c.full_name, 'final_score', c.final_score,
    'id_number', c.id_number, 'version', c.version, 'issued_at', c.issued_at,
    'cohort_name', co.name, 'start_date', co.start_date, 'end_date', co.end_date,
    'course_title', coalesce(st.value->>'course_title', 'קורס קציני משא״ן ע״צ'),
    'signer_name', st.value->>'signer_name', 'signer_title', st.value->>'signer_title',
    'signature', sg.value->>'data_uri', 'template', tp.value->>'data_uri')
  from public.cohorts co
  left join public.private_assets st on st.key = 'cert_settings'
  left join public.private_assets sg on sg.key = 'signature'
  left join public.private_assets tp on tp.key = 'cert_template'
  where co.id = c.cohort_id;
$$;
notify pgrst, 'reload schema';
