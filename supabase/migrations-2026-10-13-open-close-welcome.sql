-- שדרוג 2026-10-13: פתיחה/סגירה של מבחן ומשוב, תיעוד התחלות וטיוטות, "דבר מדור ההדרכה".
-- בטוח להרצה חוזרת. (schema.sql כבר כולל את כל השינויים)
-- התחלות ניסיון מבחן: נרשמות בשרת בלחיצה על "התחלת המבחן", כולל טיוטת תשובות שנשמרת אוטומטית.
-- מאפשר להבחין בסגירה בין מי שכבר התחיל (ויכול לסיים בזמן שנקבע) לבין התחלה חדשה (חסומה).
create table if not exists public.exam_starts (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  cohort_id uuid not null references public.cohorts(id) on delete cascade,
  token text not null unique,              -- קוד התחלה אקראי, נשמר רק בדפדפן של הנבחן/ת
  full_name text not null,
  unit text not null,
  id_number text not null check (id_number ~ '^[0-9]{9}$'),
  started_at timestamptz not null default now(),
  draft_answers jsonb,
  draft_saved_at timestamptz,
  status text not null default 'started' check (status in ('started','submitted','closed_unsubmitted')),
  submission_id uuid references public.exam_submissions(id) on delete set null
);
create index if not exists exam_starts_exam on public.exam_starts (exam_id, status);

-- מצב פתיחה/סגירה: closed_at = מועד הסגירה; grace_until = עד מתי מי שכבר התחיל יכול להגיש (סגירה "מתונה")
alter table public.exams add column if not exists closed_at timestamptz;
alter table public.exams add column if not exists grace_until timestamptz;
-- הצגת "דבר מדור ההדרכה" בעמוד הבית — לכל מחזור
alter table public.cohorts add column if not exists show_welcome boolean not null default true;


alter table public.exam_starts enable row level security;
drop policy if exists admin_all on public.exam_starts;
create policy admin_all on public.exam_starts for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select on public.exam_starts to anon;
grant select, insert, update, delete on public.exam_starts to authenticated;

-- ---------- פתיחה וסגירה ----------
-- אין לפתוח מבחן פנימי לפני שיש שאלות, תשובה נכונה לכל שאלה שאינה פתוחה, וכללים מאושרים
create or replace function public.check_exam_ready() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.is_open and new.mode = 'internal' and (tg_op = 'INSERT' or not old.is_open or old.mode <> 'internal') then
    if not exists (select 1 from public.exam_questions where exam_id = new.id) then raise exception 'exam_incomplete: no_questions'; end if;
    if exists (select 1 from public.exam_questions q left join public.exam_keys k on k.question_id = q.id
               where q.exam_id = new.id and q.qtype <> 'open' and k.question_id is null) then raise exception 'exam_incomplete: missing_keys'; end if;
  end if;
  return new;
end $$;
drop trigger if exists exams_ready on public.exams;
create trigger exams_ready before insert or update on public.exams for each row execute function public.check_exam_ready();

create or replace function public.check_feedback_ready() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.is_open and new.mode = 'internal' and (tg_op = 'INSERT' or not old.is_open or old.mode <> 'internal')
     and not exists (select 1 from public.feedback_questions where form_id = new.id) then
    raise exception 'feedback_incomplete';
  end if;
  return new;
end $$;
drop trigger if exists feedback_ready on public.feedback_forms;
create trigger feedback_ready before insert or update on public.feedback_forms for each row execute function public.check_feedback_ready();

-- פתיחה/סגירה של מבחן (מנהלת). סגירה לא מוחקת דבר.
--   p_mode = 'graceful'  : חוסם התחלות חדשות; מי שכבר התחיל יכול להגיש עד p_grace_minutes דקות
--   p_mode = 'immediate' : חוסם גם הגשות פעילות; טיוטות שכבר נשמרו נשארות (סטטוס closed_unsubmitted)
create or replace function public.set_exam_open(p_exam uuid, p_open boolean, p_mode text default 'immediate', p_grace_minutes int default null) returns json
language plpgsql security definer set search_path = public as $$
declare e public.exams; v_closed int := 0;
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  if p_open then
    update public.exams set is_open = true, closed_at = null, grace_until = null where id = p_exam returning * into e;
  else
    if p_mode not in ('graceful','immediate') then raise exception 'bad_mode'; end if;
    if p_mode = 'graceful' and (p_grace_minutes is null or p_grace_minutes < 1 or p_grace_minutes > 600) then raise exception 'bad_grace'; end if;
    update public.exams set is_open = false, closed_at = now(),
      grace_until = case when p_mode = 'graceful' then now() + make_interval(mins => p_grace_minutes) end
     where id = p_exam returning * into e;
    if p_mode = 'immediate' then
      update public.exam_starts set status = 'closed_unsubmitted' where exam_id = p_exam and status = 'started';
      get diagnostics v_closed = row_count;
    end if;
  end if;
  if e.id is null then raise exception 'not_found'; end if;
  return json_build_object('is_open', e.is_open, 'closed_at', e.closed_at, 'grace_until', e.grace_until, 'closed_starts', v_closed);
end $$;

-- האם התחלה מסוימת עדיין יכולה לשמור/להגיש
create or replace function public._start_can_submit(s public.exam_starts, e public.exams) returns boolean
language sql stable as $$
  select s.status = 'started' and e.mode = 'internal' and e.rules_approved and public.is_active_cohort(e.cohort_id)
     and (e.is_open or (e.grace_until is not null and now() <= e.grace_until and s.started_at <= e.closed_at));
$$;

-- התחלת ניסיון (ללא התחברות). אין כאן בדיקת מספר ניסיונות — כדי לא לחשוף אם ת"ז קיימת במערכת.
create or replace function public.start_exam(p_exam uuid, p_name text, p_unit text, p_id text) returns json
language plpgsql security definer set search_path = public as $$
declare e public.exams; v_token text;
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
  insert into public.exam_starts (exam_id, cohort_id, token, full_name, unit, id_number) values (e.id, e.cohort_id, v_token, v_name, v_unit, v_id);
  return json_build_object('token', v_token, 'started', true);
end $$;

-- שמירת טיוטה אוטומטית
create or replace function public.save_exam_draft(p_token text, p_answers jsonb) returns json
language plpgsql security definer set search_path = public as $$
declare s public.exam_starts; e public.exams;
begin
  select * into s from public.exam_starts where token = p_token;
  if s.id is null then raise exception 'bad_token'; end if;
  select * into e from public.exams where id = s.exam_id;
  if not public._start_can_submit(s, e) then raise exception 'exam_closed'; end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' or length(p_answers::text) > 60000 then raise exception 'bad_answers'; end if;
  update public.exam_starts set draft_answers = p_answers, draft_saved_at = now() where id = s.id;
  return json_build_object('saved_at', now(), 'grace_until', e.grace_until, 'is_open', e.is_open);
end $$;

-- חזרה לניסיון אחרי רענון הדף (רק עם קוד ההתחלה). מחזיר את הטיוטה ואת המצב.
create or replace function public.get_exam_draft(p_token text) returns json
language plpgsql security definer set search_path = public as $$
declare s public.exam_starts; e public.exams; v_q json;
begin
  select * into s from public.exam_starts where token = p_token;
  if s.id is null then raise exception 'bad_token'; end if;
  select * into e from public.exams where id = s.exam_id;
  -- שאלות מוחזרות רק למי שעדיין רשאי להגיש (גם בזמן ארכה אחרי סגירה מתונה)
  if public._start_can_submit(s, e) then
    select coalesce(json_agg(json_build_object('id', q.id, 'sort', q.sort, 'qtype', q.qtype, 'prompt', q.prompt, 'options', q.options, 'points', q.points) order by q.sort), '[]'::json)
      into v_q from public.exam_questions q where q.exam_id = e.id;
  end if;
  return json_build_object('exam_id', s.exam_id, 'status', s.status, 'can_submit', public._start_can_submit(s, e),
    'answers', case when s.status = 'started' then s.draft_answers end, 'saved_at', s.draft_saved_at,
    'grace_until', e.grace_until, 'questions', v_q);
end $$;

-- הגשת מבחן לפי קוד התחלה.
-- אין בדיקה מוקדמת של זכאות ואין הודעת שגיאה שמגלה אם ת"ז קיימת במערכת:
-- הגשה מעבר למספר הניסיונות נשמרת בסטטוס over_limit, אינה נספרת, והתשובה לנבחן/ת זהה למצב "התוצאה תפורסם בהמשך".
create or replace function public.submit_exam(p_token text, p_answers jsonb) returns json
language plpgsql security definer set search_path = public as $$
declare
  st public.exam_starts; e public.exams; q record; f record;
  v_status text; v_auto numeric := 0; v_total numeric := 0; v_manual boolean := false;
  v_ans jsonb; v_key jsonb; v_ok boolean; v_pct numeric; v_passed boolean; v_receipt text; v_no int; v_sub uuid;
begin
  select * into st from public.exam_starts where token = p_token for update;
  if st.id is null then raise exception 'bad_token'; end if;
  select * into e from public.exams where id = st.exam_id;
  if not public._start_can_submit(st, e) then
    -- שמירת התשובות האחרונות כטיוטה גם כשההגשה נחסמה (רק אם ההתחלה עדיין פתוחה לעדכון)
    raise exception 'exam_closed';
  end if;
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

  insert into public.exam_submissions (exam_id, cohort_id, full_name, unit, id_number, receipt, attempt_no, status, answers,
    auto_points, total_points, needs_manual, score_pct, passed)
  values (e.id, e.cohort_id, st.full_name, st.unit, st.id_number, v_receipt, v_no, v_status, p_answers, v_auto, v_total, v_manual, v_pct, v_passed)
  returning id into v_sub;
  update public.exam_starts set status = 'submitted', submission_id = v_sub, draft_answers = p_answers, draft_saved_at = now() where id = st.id;

  return json_build_object('submitted', true, 'receipt', v_receipt, 'show_results', e.show_results,
    'pending_manual', v_manual,
    'score_pct', case when v_status = 'counted' and e.show_results = 'immediately' then v_pct end,
    'passed',    case when v_status = 'counted' and e.show_results = 'immediately' then v_passed end);
end $$;
-- הגרסה הקודמת (הגשה בלי התחלה) מוסרת — כל הגשה עוברת דרך התחלה מתועדת
drop function if exists public.submit_exam(uuid, text, text, text, jsonb);

-- מצב התחלות שלא הוגשו (למסך הניהול)
create or replace function public.exam_open_starts(p_exam uuid) returns json
language plpgsql stable security definer set search_path = public as $$
declare v json;
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  select coalesce(json_agg(json_build_object('id', s.id, 'full_name', s.full_name, 'unit', s.unit, 'id_number', s.id_number,
           'started_at', s.started_at, 'status', s.status, 'draft_saved_at', s.draft_saved_at,
           'answered', (select count(*) from jsonb_object_keys(coalesce(s.draft_answers, '{}'::jsonb))),
           'draft_answers', s.draft_answers) order by s.started_at), '[]'::json)
    into v from public.exam_starts s where s.exam_id = p_exam and s.status <> 'submitted';
  return v;
end $$;


revoke all on function public._start_can_submit(public.exam_starts, public.exams) from public, anon, authenticated;
revoke all on function public.set_exam_open(uuid, boolean, text, integer), public.exam_open_starts(uuid) from public, anon;
grant execute on function public.set_exam_open(uuid, boolean, text, integer), public.exam_open_starts(uuid) to authenticated;
revoke all on function public.start_exam(uuid, text, text, text), public.save_exam_draft(text, jsonb), public.get_exam_draft(text), public.submit_exam(text, jsonb) from public;
grant execute on function public.start_exam(uuid, text, text, text), public.save_exam_draft(text, jsonb), public.get_exam_draft(text), public.submit_exam(text, jsonb) to anon, authenticated;

-- נוסח "דבר מדור ההדרכה" מתוך "רגע לפני.png" (לא דורס עריכה קיימת)
insert into public.site_settings (key, value) values ('welcome', '{"quote":"כִּי־טוֹבָה חָכְמָה מִפְּנִינִים, וְכָל חֲפָצִים לֹא יִשְׁווּ בָהּ","source":"משלי ח'', פסוק י\"א","title":"ברוכים הבאים לקורס קציני משא״ן ע״צ!","intro":"אנו שמחים על הצטרפותכם לקורס ומברכים אתכם עם פתיחתו.\nהקורס נבנה מתוך הבנה עמוקה של האתגרים והמשמעויות שכרוכים בתפקידכם כקציני משא״ן ע״צ.","body":"תמצאו בו שילוב בין ידע עיוני עדכני, הבנה מערכתית, כלים יישומיים ומיומנויות בינאישיות – כולם מותאמים לעשייה המקצועית הנדרשת מכם.\nהתפקיד שלכם נוגע בליבה האנושית של המערכת: אתם הגורם שמלווה את עובדי צה\"ל לכל אורך מעגל חייהם בצה\"ל – מהקליטה, דרך ההתפתחות המקצועית, ועד ההתמודדות עם מצבי חיים משתנים ומצבי חירום.\nבכל נקודת מגע – יש לכם אפשרות לעשות את ההבדל.\nכאשר ע\"צ מקבל שירות שמושתת על מקצועיות, הקשבה ודיוק – הוא לא רק מתפקד טוב יותר, אלא גם מרגיש שייך, מוערך ובעל ערך.\nאנו מזמינים אתכם לגשת אל הקורס מתוך סקרנות, פתיחות ומחויבות.\nלעצור לרגע את מרוץ היומיום, להתבונן, ללמוד, להעמיק ולהתפתח.\nלנצל כל פיסת מידע, כל דיון, כל שיתוף – ולמצוא את הדרכים להפוך אותם לכלי עבודה אמיתי ומשמעותי עבורכם.\nמאחלים לכם קורס מלמד, משמעותי, ומלא השראה.","closing":"בהצלחה","signature":"מדור הדרכה מרכז תע״ץ"}'::jsonb) on conflict (key) do nothing;
