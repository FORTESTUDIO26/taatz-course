-- עדכון 2026-10-14 (ב): מגבלת זמן למבחן.
-- לכל ניסיון נקבע מועד סיום בעת ההתחלה (התחלה + מגבלת הזמן של המבחן). שינוי המגבלה חל על התחלות חדשות בלבד.
-- אחרי מועד הסיום (ועוד דקה לעיכובי רשת) אי אפשר לשנות תשובות; הגשה מאוחרת נקלטת עם התשובות שנשמרו עד אז, ומסומנת.
-- בטוח להרצה חוזרת. אינו מוחק נתונים.

alter table public.exams add column if not exists time_limit_minutes int;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'exams_time_limit_ok') then
    alter table public.exams add constraint exams_time_limit_ok check (time_limit_minutes is null or time_limit_minutes between 1 and 600);
  end if;
end $$;
alter table public.exam_starts add column if not exists deadline timestamptz;

-- האם עבר הזמן של הניסיון (כולל דקה לעיכובי רשת)
create or replace function public._start_time_over(s public.exam_starts) returns boolean
language sql stable as $$
  select s.deadline is not null and now() > s.deadline + interval '60 seconds';
$$;

create or replace function public.start_exam(p_exam uuid, p_name text, p_unit text, p_id text) returns json
language plpgsql security definer set search_path = public as $$
declare e public.exams; v_token text; v_deadline timestamptz;
  v_name text := btrim(regexp_replace(coalesce(p_name,''), '\s+', ' ', 'g'));
  v_unit text := btrim(regexp_replace(coalesce(p_unit,''), '\s+', ' ', 'g'));
  v_id text := public.norm_il_id(p_id);
begin
  select * into e from public.exams where id = p_exam;
  if e.id is null or e.mode <> 'internal' or not e.is_open or not e.rules_approved or not public.is_active_cohort(e.cohort_id) then
    raise exception 'exam_closed';
  end if;
  if length(v_name) < 2 or length(v_name) > 80 then raise exception 'bad_name'; end if;
  if length(v_unit) < 1 or length(v_unit) > 80 then raise exception 'bad_unit'; end if;
  if v_id is null then raise exception 'bad_id'; end if;
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  if e.time_limit_minutes is not null then v_deadline := now() + make_interval(mins => e.time_limit_minutes); end if;
  insert into public.exam_starts (exam_id, cohort_id, token, full_name, unit, id_number, deadline)
  values (e.id, e.cohort_id, v_token, v_name, v_unit, v_id, v_deadline);
  return json_build_object('token', v_token, 'started', true, 'deadline', v_deadline, 'server_now', now());
end $$;

create or replace function public.save_exam_draft(p_token text, p_answers jsonb) returns json
language plpgsql security definer set search_path = public as $$
declare s public.exam_starts; e public.exams;
begin
  select * into s from public.exam_starts where token = p_token;
  if s.id is null then raise exception 'bad_token'; end if;
  select * into e from public.exams where id = s.exam_id;
  if not public._start_can_submit(s, e) then raise exception 'exam_closed'; end if;
  if public._start_time_over(s) then raise exception 'time_over'; end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' or length(p_answers::text) > 60000 then raise exception 'bad_answers'; end if;
  update public.exam_starts set draft_answers = p_answers, draft_saved_at = now() where id = s.id;
  return json_build_object('saved_at', now(), 'grace_until', e.grace_until, 'is_open', e.is_open, 'deadline', s.deadline, 'server_now', now());
end $$;

create or replace function public.get_exam_draft(p_token text) returns json
language plpgsql security definer set search_path = public as $$
declare s public.exam_starts; e public.exams; v_q json; v_over boolean;
begin
  select * into s from public.exam_starts where token = p_token;
  if s.id is null then raise exception 'bad_token'; end if;
  select * into e from public.exams where id = s.exam_id;
  v_over := public._start_time_over(s);
  -- שאלות מוחזרות רק למי שעדיין רשאי להגיש ושהזמן שלו לא נגמר
  if public._start_can_submit(s, e) and not v_over then
    select coalesce(json_agg(json_build_object('id', q.id, 'sort', q.sort, 'qtype', q.qtype, 'prompt', q.prompt, 'options', q.options, 'points', q.points) order by q.sort), '[]'::json)
      into v_q from public.exam_questions q where q.exam_id = e.id;
  end if;
  return json_build_object('exam_id', s.exam_id, 'status', s.status, 'can_submit', public._start_can_submit(s, e),
    'answers', case when s.status = 'started' then s.draft_answers end, 'saved_at', s.draft_saved_at,
    'grace_until', e.grace_until, 'questions', v_q, 'deadline', s.deadline, 'server_now', now(), 'time_over', v_over);
end $$;

create or replace function public.submit_exam(p_token text, p_answers jsonb) returns json
language plpgsql security definer set search_path = public as $$
declare
  st public.exam_starts; e public.exams; q record; f record;
  v_status text; v_auto numeric := 0; v_total numeric := 0; v_manual boolean := false;
  v_ans jsonb; v_key jsonb; v_ok boolean; v_pct numeric; v_passed boolean; v_receipt text; v_no int; v_sub uuid; v_late boolean;
begin
  select * into st from public.exam_starts where token = p_token for update;
  if st.id is null then raise exception 'bad_token'; end if;
  select * into e from public.exams where id = st.exam_id;
  if not public._start_can_submit(st, e) then
    -- שמירת התשובות האחרונות כטיוטה גם כשההגשה נחסמה (רק אם ההתחלה עדיין פתוחה לעדכון)
    raise exception 'exam_closed';
  end if;
  -- אחרי תום הזמן (ועוד דקה): נספרות רק התשובות שנשמרו עד אז, לא תשובות שנשלחו מאוחר יותר
  v_late := public._start_time_over(st);
  if v_late then p_answers := coalesce(st.draft_answers, '{}'::jsonb); end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' or length(p_answers::text) > 60000 then raise exception 'bad_answers'; end if;

  -- נעילה לפי מבחן+ת"ז כדי ששתי הגשות במקביל לא יעקפו את מגבלת הניסיונות
  perform pg_advisory_xact_lock(hashtext(e.id::text || st.id_number));
  select * into f from public._person_final(e.id, st.id_number);
  v_status := case when f.attempts < f.allowed then 'counted' else 'over_limit' end;
  select count(*)::int + 1 into v_no from public.exam_submissions where exam_id = e.id and id_number = st.id_number;

  for q in select qq.*, k.correct from public.exam_questions qq left join public.exam_keys k on k.question_id = qq.id
           where qq.exam_id = e.id loop
    v_total := v_total + q.points;
    v_ans := p_answers -> (q.id::text);
    v_key := q.correct;
    if q.qtype = 'open' or v_key is null then v_manual := true; continue; end if;
    v_ok := case q.qtype
      when 'single'    then v_ans is not null and v_ans #>> '{}' = v_key #>> '{}'
      when 'truefalse' then v_ans is not null and v_ans #>> '{}' = v_key #>> '{}'
      when 'multi'     then jsonb_typeof(v_ans) = 'array'
                            and (select coalesce(array_agg(x order by x), '{}') from jsonb_array_elements_text(v_ans) x)
                              = (select coalesce(array_agg(x order by x), '{}') from jsonb_array_elements_text(v_key) x)
      when 'short'     then v_ans is not null and jsonb_typeof(v_ans) = 'string' and exists (select 1 from jsonb_array_elements_text(v_key) a
                              where public.norm_text(a) = public.norm_text(v_ans #>> '{}'))
      else false end;
    if v_ok then v_auto := v_auto + q.points; end if;
  end loop;
  if not v_manual and v_total > 0 then
    v_pct := round(v_auto / v_total * 100, 1);
    v_passed := v_pct >= e.pass_score;
  end if;
  v_receipt := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));

  insert into public.exam_submissions (exam_id, cohort_id, full_name, unit, id_number, receipt, attempt_no, status, status_note, answers,
    auto_points, total_points, needs_manual, score_pct, passed)
  values (e.id, e.cohort_id, st.full_name, st.unit, st.id_number, v_receipt, v_no, v_status,
    case when v_late then 'הוגש אחרי תום הזמן — נספרו התשובות שנשמרו עד תום הזמן' end, p_answers, v_auto, v_total, v_manual, v_pct, v_passed)
  returning id into v_sub;
  update public.exam_starts set status = 'submitted', submission_id = v_sub, draft_answers = p_answers, draft_saved_at = now() where id = st.id;

  return json_build_object('submitted', true, 'receipt', v_receipt, 'show_results', e.show_results, 'late', v_late,
    'pending_manual', v_manual,
    'score_pct', case when v_status = 'counted' and e.show_results = 'immediately' then v_pct end,
    'passed',    case when v_status = 'counted' and e.show_results = 'immediately' then v_passed end);
end $$;

revoke all on function public._start_time_over(public.exam_starts) from public, anon, authenticated;
notify pgrst, 'reload schema';
