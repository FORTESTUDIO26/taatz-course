-- עדכון 2026-10-13 (ב): משוב בחלקים — הנחיה לכל חלק, טקסט רמז בתשובות פתוחות, בדיקת שאלות חובה בשרת.
-- בטוח להרצה חוזרת. אינו מוחק נתונים.
-- חלקי המשוב: [{ "title": "...", "intro": "..." }] — כותרת והנחיה לכל חלק, לפי הסדר
alter table public.feedback_forms add column if not exists sections jsonb not null default '[]'::jsonb;
-- טקסט רמז בתיבת תשובה פתוחה
alter table public.feedback_questions add column if not exists placeholder text;

create or replace function public.submit_feedback(p_form uuid, p_name text, p_answers jsonb) returns json
language plpgsql security definer set search_path = public as $$
declare f public.feedback_forms; v_name text := nullif(btrim(coalesce(p_name,'')), '');
begin
  select * into f from public.feedback_forms where id = p_form;
  if f.id is null or f.mode <> 'internal' or not f.is_open or not public.is_active_cohort(f.cohort_id) then raise exception 'feedback_closed'; end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' or length(p_answers::text) > 60000 then raise exception 'bad_answers'; end if;
  -- שאלות חובה נבדקות גם בשרת
  if exists (select 1 from public.feedback_questions q where q.form_id = f.id and q.required and (
       p_answers -> (q.id::text) is null or jsonb_typeof(p_answers -> (q.id::text)) = 'null'
       or (jsonb_typeof(p_answers -> (q.id::text)) = 'string' and btrim(p_answers ->> (q.id::text)) = '')
       or (jsonb_typeof(p_answers -> (q.id::text)) = 'array' and jsonb_array_length(p_answers -> (q.id::text)) = 0))) then
    raise exception 'missing_required';
  end if;
  if f.anonymous then
    insert into public.feedback_responses (form_id, cohort_id, answers) values (f.id, f.cohort_id, p_answers);
  else
    insert into public.feedback_responses (form_id, cohort_id, full_name, answers, submitted_at)
    values (f.id, f.cohort_id, left(v_name, 80), p_answers, now());
  end if;
  return json_build_object('submitted', true);
end $$;

notify pgrst, 'reload schema';
