-- =====================================================================
--  אתר קורס קציני משא"ן ע"צ — מבנה מסד הנתונים והרשאות (Supabase)
--  הרצה: Supabase → SQL Editor → להדביק את כל הקובץ → Run.
--  אפשר להריץ שוב בבטחה (הקובץ אינו מוחק נתונים קיימים).
--
--  מודל הגישה:
--  * ציבורי (ללא התחברות): המחזור הפעיל, הלו"ז שלו, חומרי הלימוד, המילון,
--    והגדרות המבחן/המשוב הפתוחים. קבצים נשמרים בדלי ציבורי לקריאה בלבד.
--  * מנהלת: משתמשת מחוברת שמופיעה בטבלת admins. רק היא יכולה לשנות נתונים,
--    להעלות קבצים ולצפות בתוצאות, בפרטי הנבחנים, בטופסי הסיום ובמשובים (RLS בצד השרת).
--  * מבחן: שם, יחידה ות"ז מוזנים בטופס. ת"ז נבדקת לתקינות (ספרת ביקורת) — זו אינה אימות זהות.
--    ההגשה, הציון ומגבלת הניסיונות (לפי ת"ז ומחזור) נבדקים בשרת. אין פונקציה שמאפשרת לבדוק
--    אם ת"ז קיימת במערכת או לראות תוצאה לפי ת"ז — רק לפי קוד אישור אישי.
--  * טופס סיום: מופק רק אחרי אישור המנהלת, למי שעבר לפי הציון הקובע. נגיש למשתתף/ת רק
--    עם קוד האישור של הניסיון הקובע. קובץ החתימה ופרטי החותמת שמורים בטבלה פרטית.
--  * משוב אנונימי: נשמר בלי שם ובלי שעה מדויקת (תאריך בלבד), ונפרד לגמרי מנתוני המבחן.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- מנהלות ----------
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email   text,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- ---------- מחזורים ----------
create table if not exists public.cohorts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_date date,
  end_date date,
  is_active boolean not null default false,
  schedule_approved boolean not null default false,  -- false = "לו"ז ראשוני – כפוף לעדכון"
  created_at timestamptz not null default now()
);
create unique index if not exists cohorts_one_active on public.cohorts (is_active) where is_active;

create or replace function public.is_active_cohort(p_cohort uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.cohorts where id = p_cohort and is_active);
$$;

-- ---------- לו"ז ----------
create table if not exists public.schedule_items (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references public.cohorts(id) on delete cascade,
  day_date date not null,
  start_time time,
  end_time time,
  topic text not null,
  block text,
  lecturer text,
  location text,
  sort int not null default 0
);
create index if not exists schedule_items_cohort on public.schedule_items (cohort_id, day_date, start_time);

-- ---------- הגדרות כלליות, חומרים ומילון ----------
create table if not exists public.site_settings (
  key text primary key,
  value jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.resources (
  id uuid primary key default gen_random_uuid(),
  section text not null check (section in ('presentations','course_booklets','info_booklets','book','podcasts','other')),
  title text not null,
  description text,
  kind text not null default 'file' check (kind in ('file','link')),
  url text,
  storage_path text,     -- נתיב הקובץ בדלי materials
  file_name text,
  cohort_id uuid references public.cohorts(id) on delete cascade, -- ריק = לכל המחזורים
  sort int not null default 0,
  is_published boolean not null default true,
  updated_at timestamptz not null default now()
);

-- שיוך מצגת לשיעור בלו"ז (המנהלת בוחרת; מחיקת המצגת מנקה את השיוך)
alter table public.schedule_items add column if not exists resource_id uuid references public.resources(id) on delete set null;

create table if not exists public.glossary_terms (
  id uuid primary key default gen_random_uuid(),
  term text not null,
  definition text not null,
  category text,
  sort int not null default 0
);

-- ---------- מבחנים ----------
create table if not exists public.exams (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references public.cohorts(id) on delete cascade,
  title text not null default 'מבחן מסכם',
  instructions text,
  mode text not null default 'off' check (mode in ('off','internal','external')),
  external_url text,
  is_open boolean not null default false,
  -- כללים שהמנהלת קובעת ומאשרת לפני הפעלה (אין ערכי ברירת מחדל)
  pass_score numeric check (pass_score between 0 and 100),
  max_attempts int check (max_attempts >= 1),
  show_results text check (show_results in ('immediately','after_close','never')),
  final_score_rule text check (final_score_rule in ('highest','last')),   -- איזה ציון קובע כשיש כמה ניסיונות
  rules_approved boolean not null default false,
  results_released boolean not null default false,
  created_at timestamptz not null default now(),
  constraint exam_rules_before_open check (
    not (is_open and mode = 'internal')
    or (rules_approved and pass_score is not null and max_attempts is not null and show_results is not null and final_score_rule is not null)
  )
);
create unique index if not exists exams_one_per_cohort on public.exams (cohort_id);

create table if not exists public.exam_questions (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  sort int not null default 0,
  qtype text not null check (qtype in ('single','multi','truefalse','short','open')),
  prompt text not null,
  options jsonb not null default '[]'::jsonb,
  points numeric not null default 1 check (points >= 0)
);

-- מפתח תשובות: למנהלות בלבד
create table if not exists public.exam_keys (
  question_id uuid primary key references public.exam_questions(id) on delete cascade,
  correct jsonb not null
);

-- כל ניסיון נשמר כשורה נפרדת ואינו נדרס.
-- הפרטים מוזנים בטופס: מספר ת"ז עובר בדיקת ספרת ביקורת, אך זו אינה אימות זהות.
create table if not exists public.exam_submissions (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  cohort_id uuid not null references public.cohorts(id) on delete cascade,
  full_name text not null,
  unit text not null,
  id_number text not null check (id_number ~ '^[0-9]{9}$'),   -- טקסט, 9 ספרות כולל אפסים מובילים
  receipt text not null unique,      -- קוד אישי לצפייה בתוצאה (ולטופס הסיום) — אינו קוד כניסה לאתר
  attempt_no int not null,
  status text not null default 'counted' check (status in ('counted','over_limit','voided')),
  status_note text,
  answers jsonb not null,
  auto_points numeric not null default 0,
  total_points numeric not null default 0,
  manual_points numeric,
  needs_manual boolean not null default false,
  score_pct numeric,
  passed boolean,
  submitted_at timestamptz not null default now()
);
create index if not exists exam_submissions_cohort on public.exam_submissions (cohort_id, exam_id);
create index if not exists exam_submissions_person on public.exam_submissions (exam_id, id_number);

-- אישורי מבחן חוזר: כל אישור מוסיף ניסיון אחד לאותה ת"ז באותו מבחן
create table if not exists public.exam_retakes (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  cohort_id uuid not null references public.cohorts(id) on delete cascade,
  id_number text not null,
  note text,
  granted_by uuid,
  granted_at timestamptz not null default now()
);
create index if not exists exam_retakes_person on public.exam_retakes (exam_id, id_number);

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

-- ---------- טופסי סיום ----------
create table if not exists public.certificates (
  id uuid primary key default gen_random_uuid(),
  cert_no text not null unique,
  exam_id uuid not null references public.exams(id) on delete cascade,
  cohort_id uuid not null references public.cohorts(id) on delete cascade,
  id_number text not null,
  source_submission uuid not null references public.exam_submissions(id) on delete cascade,  -- הניסיון שקבע את הציון
  full_name text not null,
  final_score numeric not null,
  show_id boolean not null default false,          -- ברירת מחדל: ת"ז לא מודפסת בטופס
  version int not null default 1,
  status text not null default 'issued' check (status in ('issued','revoked')),
  issued_at timestamptz not null default now(),
  issued_by uuid,
  revoked_at timestamptz,
  revoked_by uuid,
  revoke_reason text
);
create unique index if not exists certificates_one_active on public.certificates (exam_id, id_number) where status = 'issued';

create table if not exists public.certificate_events (
  id bigint generated always as identity primary key,
  certificate_id uuid not null references public.certificates(id) on delete cascade,
  event text not null check (event in ('issued','revoked','admin_pdf','participant_view')),
  at timestamptz not null default now(),
  by_user uuid
);

-- נתונים פרטיים של המנהלת (קובץ החתימה, פרטי החותמת). לא ציבורי ולא באחסון הקבצים הציבורי.
create table if not exists public.private_assets (
  key text primary key,
  value jsonb,
  updated_at timestamptz not null default now()
);

-- ---------- משובים ----------
create table if not exists public.feedback_forms (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references public.cohorts(id) on delete cascade,
  title text not null default 'משוב הקורס',
  intro text,
  mode text not null default 'off' check (mode in ('off','internal','external')),
  external_url text,
  is_open boolean not null default false,
  anonymous boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists feedback_one_per_cohort on public.feedback_forms (cohort_id);

create table if not exists public.feedback_questions (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.feedback_forms(id) on delete cascade,
  sort int not null default 0,
  section text,
  qtype text not null check (qtype in ('rating5','single','multi','text','longtext')),
  prompt text not null,
  options jsonb not null default '[]'::jsonb,
  required boolean not null default false
);
-- חלקי המשוב: [{ "title": "...", "intro": "..." }] — כותרת והנחיה לכל חלק, לפי הסדר
alter table public.feedback_forms add column if not exists sections jsonb not null default '[]'::jsonb;
-- טקסט רמז בתיבת תשובה פתוחה
alter table public.feedback_questions add column if not exists placeholder text;

create table if not exists public.feedback_responses (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.feedback_forms(id) on delete cascade,
  cohort_id uuid not null references public.cohorts(id) on delete cascade,
  full_name text,                                    -- ריק במשוב אנונימי
  answers jsonb not null,
  submitted_on date not null default current_date,   -- תאריך בלבד
  submitted_at timestamptz                           -- ריק במשוב אנונימי
);

-- הגנה נוספת: פרטים מזהים במשוב אנונימי נמחקים גם בהכנסה ישירה
create or replace function public.strip_anonymous_feedback() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select anonymous from public.feedback_forms where id = new.form_id) then
    new.full_name := null; new.submitted_at := null;
  end if;
  return new;
end $$;
drop trigger if exists feedback_strip_identity on public.feedback_responses;
create trigger feedback_strip_identity before insert or update on public.feedback_responses
for each row execute function public.strip_anonymous_feedback();

-- =====================================================================
--  RLS
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array['admins','cohorts','schedule_items','site_settings','resources','glossary_terms',
    'exams','exam_questions','exam_keys','exam_submissions','exam_retakes','exam_starts','certificates','certificate_events','private_assets',
    'feedback_forms','feedback_questions','feedback_responses'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists admin_all on public.%I', t);
    execute format('create policy admin_all on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

-- קריאה ציבורית
drop policy if exists public_read on public.cohorts;
create policy public_read on public.cohorts for select to anon, authenticated using (is_active);

drop policy if exists public_read on public.schedule_items;
create policy public_read on public.schedule_items for select to anon, authenticated using (public.is_active_cohort(cohort_id));

drop policy if exists public_read on public.site_settings;
create policy public_read on public.site_settings for select to anon, authenticated using (true);

drop policy if exists public_read on public.glossary_terms;
create policy public_read on public.glossary_terms for select to anon, authenticated using (true);

drop policy if exists public_read on public.resources;
create policy public_read on public.resources for select to anon, authenticated
  using (is_published and (cohort_id is null or public.is_active_cohort(cohort_id)));

drop policy if exists public_read on public.exams;
create policy public_read on public.exams for select to anon, authenticated
  using (mode <> 'off' and public.is_active_cohort(cohort_id));

drop policy if exists public_read on public.exam_questions;
create policy public_read on public.exam_questions for select to anon, authenticated
  using (exists (select 1 from public.exams e where e.id = exam_id and e.is_open and e.mode = 'internal' and public.is_active_cohort(e.cohort_id)));

drop policy if exists public_read on public.feedback_forms;
create policy public_read on public.feedback_forms for select to anon, authenticated
  using (mode <> 'off' and public.is_active_cohort(cohort_id));

drop policy if exists public_read on public.feedback_questions;
create policy public_read on public.feedback_questions for select to anon, authenticated
  using (exists (select 1 from public.feedback_forms f where f.id = form_id and f.is_open and f.mode = 'internal' and public.is_active_cohort(f.cohort_id)));

-- אין מדיניות ציבורית על: admins, exam_keys, exam_submissions, exam_retakes, exam_starts, certificates, certificate_events,
-- private_assets, feedback_responses → חסומים לגמרי לציבור.

-- =====================================================================
--  פונקציות שרת
-- =====================================================================

create or replace function public.clone_schedule(p_from uuid, p_to uuid, p_replace boolean default false) returns int
language plpgsql security definer set search_path = public as $$
declare v_shift int; v_count int;
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  select coalesce((select start_date from public.cohorts where id = p_to) - (select start_date from public.cohorts where id = p_from), 0)
    into v_shift;
  if p_replace then delete from public.schedule_items where cohort_id = p_to; end if;
  insert into public.schedule_items (cohort_id, day_date, start_time, end_time, topic, block, lecturer, location, sort, resource_id)
  select p_to, day_date + v_shift, start_time, end_time, topic, block, lecturer, location, sort, resource_id
    from public.schedule_items where cohort_id = p_from;
  get diagnostics v_count = row_count;
  update public.cohorts set schedule_approved = false where id = p_to;  -- לו"ז מועתק הוא טיוטה
  return v_count;
end $$;

create or replace function public.set_active_cohort(p_cohort uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  update public.cohorts set is_active = false where is_active and id <> p_cohort;
  update public.cohorts set is_active = true where id = p_cohort;
end $$;

create or replace function public.save_exam_question(p_exam uuid, p_id uuid, p_sort int, p_qtype text, p_prompt text,
  p_options jsonb, p_points numeric, p_correct jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid := p_id;
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  if v_id is null then
    insert into public.exam_questions (exam_id, sort, qtype, prompt, options, points)
    values (p_exam, coalesce(p_sort,0), p_qtype, p_prompt, coalesce(p_options,'[]'::jsonb), coalesce(p_points,1)) returning id into v_id;
  else
    update public.exam_questions set sort = coalesce(p_sort,0), qtype = p_qtype, prompt = p_prompt,
      options = coalesce(p_options,'[]'::jsonb), points = coalesce(p_points,1) where id = v_id and exam_id = p_exam;
  end if;
  if p_correct is null or p_qtype = 'open' then
    delete from public.exam_keys where question_id = v_id;
  else
    insert into public.exam_keys (question_id, correct) values (v_id, p_correct)
    on conflict (question_id) do update set correct = excluded.correct;
  end if;
  return v_id;
end $$;

create or replace function public.norm_text(t text) returns text
language sql immutable as $$
  select btrim(lower(regexp_replace(regexp_replace(coalesce(t,''), '["''״׳.,]', '', 'g'), '[\s\-]+', ' ', 'g')));
$$;

-- בדיקת תקינות מספר ת"ז ישראלי (ספרת ביקורת). מחזיר 9 ספרות או null. בדיקת תקינות בלבד — לא אימות זהות.
create or replace function public.norm_il_id(p text) returns text
language plpgsql immutable as $$
declare v text := regexp_replace(coalesce(p,''), '[\s\-]', '', 'g'); s int := 0; d int; i int;
begin
  if v !~ '^[0-9]{5,9}$' then return null; end if;
  v := lpad(v, 9, '0');
  if v = '000000000' then return null; end if;
  for i in 1..9 loop
    d := substr(v, i, 1)::int * (case when i % 2 = 1 then 1 else 2 end);
    s := s + case when d > 9 then d - 9 else d end;
  end loop;
  return case when s % 10 = 0 then v end;
end $$;

-- הציון הקובע של נבחן/ת לפי כלל המבחן (פנימי; לא נחשף לציבור)
create or replace function public._person_final(p_exam uuid, p_id text,
  out final_score numeric, out passed boolean, out pending boolean, out attempts int, out allowed int, out last_sub uuid, out deciding_sub uuid)
language plpgsql stable security definer set search_path = public as $$
declare e public.exams;
begin
  select * into e from public.exams where id = p_exam;
  select count(*)::int into attempts from public.exam_submissions where exam_id = p_exam and id_number = p_id and status = 'counted';
  allowed := coalesce(e.max_attempts, 0) + (select count(*)::int from public.exam_retakes where exam_id = p_exam and id_number = p_id);
  select id into last_sub from public.exam_submissions where exam_id = p_exam and id_number = p_id order by attempt_no desc limit 1;
  if attempts = 0 or e.final_score_rule is null then
    pending := attempts > 0; return;
  end if;
  if e.final_score_rule = 'last' then
    select s.score_pct, s.score_pct is null, s.id into final_score, pending, deciding_sub from public.exam_submissions s
     where s.exam_id = p_exam and s.id_number = p_id and s.status = 'counted' order by s.attempt_no desc limit 1;
  else
    select max(s.score_pct), bool_or(s.score_pct is null) into final_score, pending from public.exam_submissions s
     where s.exam_id = p_exam and s.id_number = p_id and s.status = 'counted';
    select s.id into deciding_sub from public.exam_submissions s
     where s.exam_id = p_exam and s.id_number = p_id and s.status = 'counted' and s.score_pct = final_score order by s.attempt_no limit 1;
  end if;
  if not pending and final_score is not null and e.pass_score is not null then passed := final_score >= e.pass_score; end if;
end $$;

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

-- תוצאה אישית לפי קוד אישור בלבד (לא לפי ת"ז)
create or replace function public.exam_result(p_receipt text) returns json
language plpgsql stable security definer set search_path = public as $$
declare s public.exam_submissions; e public.exams; v_see boolean;
begin
  select * into s from public.exam_submissions where receipt = upper(btrim(coalesce(p_receipt,'')));
  if s.id is null then raise exception 'bad_receipt'; end if;
  select * into e from public.exams where id = s.exam_id;
  v_see := s.status = 'counted' and (e.show_results = 'immediately' or (e.show_results = 'after_close' and e.results_released));
  return json_build_object('submitted_at', s.submitted_at, 'visible', v_see and s.score_pct is not null,
    'pending_manual', s.needs_manual and s.manual_points is null,
    'score_pct', case when v_see then s.score_pct end, 'passed', case when v_see then s.passed end);
end $$;

create or replace function public.grade_manual(p_submission uuid, p_points numeric) returns void
language plpgsql security definer set search_path = public as $$
declare s public.exam_submissions; e public.exams; v_pct numeric;
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  select * into s from public.exam_submissions where id = p_submission;
  select * into e from public.exams where id = s.exam_id;
  if p_points < 0 then raise exception 'bad_points'; end if;
  if s.total_points > 0 then v_pct := round((s.auto_points + p_points) / s.total_points * 100, 1); end if;
  update public.exam_submissions set manual_points = p_points, score_pct = v_pct,
         passed = case when v_pct is not null and e.pass_score is not null then v_pct >= e.pass_score end
   where id = p_submission;
end $$;

-- ניהול ניסיון: ביטול / החזרה לספירה / סימון כחריגה (מנהלת)
create or replace function public.set_submission_status(p_submission uuid, p_status text, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  if p_status not in ('counted','over_limit','voided') then raise exception 'bad_status'; end if;
  update public.exam_submissions set status = p_status, status_note = p_note where id = p_submission;
end $$;

-- אישור מבחן חוזר (מנהלת). מזוהה לפי הגשה — ת"ז לא עוברת בקישור או בפרמטר.
create or replace function public.grant_retake(p_submission uuid, p_note text default null) returns json
language plpgsql security definer set search_path = public as $$
declare s public.exam_submissions; f record;
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  select * into s from public.exam_submissions where id = p_submission;
  if s.id is null then raise exception 'not_found'; end if;
  select * into f from public._person_final(s.exam_id, s.id_number);
  if f.passed then raise exception 'already_passed'; end if;
  insert into public.exam_retakes (exam_id, cohort_id, id_number, note, granted_by) values (s.exam_id, s.cohort_id, s.id_number, p_note, auth.uid());
  return json_build_object('allowed', f.allowed + 1, 'attempts', f.attempts);
end $$;

-- סיכום לפי נבחן/ת למסך הניהול
create or replace function public.exam_people(p_exam uuid) returns json
language plpgsql stable security definer set search_path = public as $$
declare v json;
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  select coalesce(json_agg(x order by x.full_name), '[]'::json) into v from (
    select p.id_number, f.final_score, f.passed, f.pending, f.attempts, f.allowed, f.last_sub,
      ls.full_name, ls.unit, f.deciding_sub,
      (select count(*) from public.exam_submissions o where o.exam_id = p_exam and o.id_number = p.id_number and o.status = 'over_limit') as over_limit,
      (select row_to_json(c) from public.certificates c where c.exam_id = p_exam and c.id_number = p.id_number and c.status = 'issued') as cert
    from (select distinct id_number from public.exam_submissions where exam_id = p_exam) p
    cross join lateral public._person_final(p_exam, p.id_number) f
    join public.exam_submissions ls on ls.id = f.last_sub
  ) x;
  return v;
end $$;

-- נתוני טופס סיום להפקת PDF
create or replace function public._cert_payload(c public.certificates) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('id', c.id, 'cert_no', c.cert_no, 'full_name', c.full_name, 'final_score', c.final_score,
    'id_number', case when c.show_id then c.id_number end, 'version', c.version, 'issued_at', c.issued_at,
    'cohort_name', co.name, 'start_date', co.start_date, 'end_date', co.end_date,
    'course_title', coalesce(st.value->>'course_title', 'קורס קציני משא״ן ע״צ'),
    'signer_name', st.value->>'signer_name', 'signer_title', st.value->>'signer_title',
    'signature', sg.value->>'data_uri')
  from public.cohorts co
  left join public.private_assets st on st.key = 'cert_settings'
  left join public.private_assets sg on sg.key = 'signature'
  where co.id = c.cohort_id;
$$;

-- אישור זכאות והפקת טופס (מנהלת). רק למי שעבר לפי הציון הקובע.
create or replace function public.issue_certificate(p_submission uuid, p_show_id boolean default false) returns json
language plpgsql security definer set search_path = public as $$
declare s public.exam_submissions; f record; v_ver int; c public.certificates; n public.exam_submissions;
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  select * into s from public.exam_submissions where id = p_submission;
  if s.id is null then raise exception 'not_found'; end if;
  select * into f from public._person_final(s.exam_id, s.id_number);
  if f.passed is not true then raise exception 'not_eligible'; end if;
  if exists (select 1 from public.certificates where exam_id = s.exam_id and id_number = s.id_number and status = 'issued') then
    raise exception 'already_issued';
  end if;
  select * into n from public.exam_submissions where id = f.deciding_sub;
  select coalesce(max(version), 0) + 1 into v_ver from public.certificates where exam_id = s.exam_id and id_number = s.id_number;
  insert into public.certificates (cert_no, exam_id, cohort_id, id_number, source_submission, full_name, final_score, show_id, version, issued_by)
  values (upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)), s.exam_id, s.cohort_id, s.id_number, n.id, n.full_name,
          f.final_score, coalesce(p_show_id, false), v_ver, auth.uid())
  returning * into c;
  insert into public.certificate_events (certificate_id, event, by_user) values (c.id, 'issued', auth.uid());
  return public._cert_payload(c);
end $$;

create or replace function public.issue_all_certificates(p_exam uuid, p_show_id boolean default false) returns int
language plpgsql security definer set search_path = public as $$
declare r record; f record; v int := 0;
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  for r in select distinct id_number from public.exam_submissions where exam_id = p_exam loop
    select * into f from public._person_final(p_exam, r.id_number);
    if f.passed is true and not exists (select 1 from public.certificates where exam_id = p_exam and id_number = r.id_number and status = 'issued') then
      perform public.issue_certificate(f.last_sub, p_show_id);
      v := v + 1;
    end if;
  end loop;
  return v;
end $$;

create or replace function public.revoke_certificate(p_cert uuid, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  update public.certificates set status = 'revoked', revoked_at = now(), revoked_by = auth.uid(), revoke_reason = p_reason
   where id = p_cert and status = 'issued';
  if found then insert into public.certificate_events (certificate_id, event, by_user) values (p_cert, 'revoked', auth.uid()); end if;
end $$;

-- טופס להפקת PDF במסך הניהול (כולל רישום ביומן)
create or replace function public.admin_certificate(p_cert uuid) returns json
language plpgsql security definer set search_path = public as $$
declare c public.certificates;
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  select * into c from public.certificates where id = p_cert;
  if c.id is null then raise exception 'not_found'; end if;
  insert into public.certificate_events (certificate_id, event, by_user) values (c.id, 'admin_pdf', auth.uid());
  return public._cert_payload(c);
end $$;

-- טופס סיום למשתתף/ת: רק עם קוד האישור של הניסיון שקבע את הציון, ורק אם המנהלת אישרה והטופס בתוקף.
-- (קוד של הגשה אחרת עם אותה ת"ז לא פותח את הטופס.)
create or replace function public.get_certificate(p_receipt text) returns json
language plpgsql security definer set search_path = public as $$
declare s public.exam_submissions; c public.certificates;
begin
  select * into s from public.exam_submissions where receipt = upper(btrim(coalesce(p_receipt,'')));
  if s.id is null then raise exception 'bad_receipt'; end if;
  select * into c from public.certificates where source_submission = s.id and status = 'issued';
  if c.id is null then return json_build_object('available', false); end if;
  insert into public.certificate_events (certificate_id, event) values (c.id, 'participant_view');
  return json_build_object('available', true, 'certificate', public._cert_payload(c));
end $$;

-- הגשת משוב (ללא התחברות)
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

-- =====================================================================
--  ייבוא היסטוריה ממערכת קודמת (ראו גם migrations-2026-10-13c-import-history.sql)
-- =====================================================================

create table if not exists public.import_batches (
  id text primary key check (id ~ '^[a-z0-9-]{3,60}$'),
  source text not null,
  note text,
  summary jsonb,
  created_at timestamptz not null default now(),
  created_by uuid
);

-- יומן הייבוא: רשומה לכל רשומת מקור — יובאה, דולגה (בדיקה/כפילות) או אוחדה. נגיש למנהלת בלבד.
create table if not exists public.import_records (
  id bigserial primary key,
  batch_id text not null references public.import_batches(id) on delete cascade,
  source_entity text not null,
  source_id text not null,
  outcome text not null,   -- imported / skipped_test / skipped_duplicate / skipped_pending / merged_duplicate_question
  target_table text,
  target_id uuid,
  flags text[] not null default '{}',
  note text,
  payload jsonb
);
-- רשומת מקור מיובאת פעם אחת בלבד; רשומה שדולגה או ממתינה להחלטה אפשר לייבא באצווה מאוחרת
do $$ begin
  alter table public.import_records drop constraint if exists import_records_source_entity_source_id_key;
  alter table public.import_records drop constraint if exists import_records_outcome_check;
  if not exists (select 1 from pg_constraint where conname = 'import_records_outcome_ok') then
    alter table public.import_records add constraint import_records_outcome_ok
      check (outcome in ('imported','skipped_test','skipped_duplicate','skipped_pending','merged_duplicate_question'));
  end if;
end $$;
create unique index if not exists import_records_imported_once on public.import_records (source_entity, source_id) where outcome in ('imported','merged_duplicate_question');

alter table public.cohorts            add column if not exists import_batch text references public.import_batches(id);
alter table public.exams              add column if not exists import_batch text references public.import_batches(id);
alter table public.exams              add column if not exists historical_rules jsonb;   -- הגדרות המערכת הקודמת, לתיעוד בלבד
alter table public.exam_questions     add column if not exists import_batch text references public.import_batches(id);
alter table public.exam_questions     add column if not exists source_id text;
alter table public.exam_questions     add column if not exists explanation text;
alter table public.exam_submissions   add column if not exists import_batch text references public.import_batches(id);
alter table public.exam_submissions   add column if not exists source_id text;
alter table public.exam_submissions   add column if not exists time_spent_sec int;
alter table public.exam_submissions   add column if not exists review_flags text[] not null default '{}';
alter table public.feedback_forms     add column if not exists import_batch text references public.import_batches(id);
alter table public.feedback_questions add column if not exists import_batch text references public.import_batches(id);
alter table public.feedback_responses add column if not exists import_batch text references public.import_batches(id);
alter table public.feedback_responses add column if not exists source_id text;

create unique index if not exists exam_submissions_source on public.exam_submissions (source_id) where source_id is not null;
create unique index if not exists feedback_responses_source on public.feedback_responses (source_id) where source_id is not null;
create unique index if not exists exam_questions_source on public.exam_questions (exam_id, source_id) where source_id is not null;

-- יחידה: חובה בהגשות באתר; ברשומות מיובאות מותר ריק כשלא נרשמה במקור
alter table public.exam_submissions alter column unit drop not null;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'exam_submissions_unit_required') then
    alter table public.exam_submissions add constraint exam_submissions_unit_required check (unit is not null or import_batch is not null);
  end if;
end $$;

-- RLS: מנהלת בלבד
do $$
declare t text;
begin
  foreach t in array array['import_batches','import_records'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists admin_all on public.%I', t);
    execute format('create policy admin_all on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

-- ביצוע הייבוא בעסקה אחת. p_dry_run = true: הכול מבוצע ואז מבוטל, ומוחזר דוח בלבד.
-- המבנה של p מתועד ב-tools/import-base44.mjs. מזהי רשומות היעד נוצרים מראש בצד המנהלת.
create or replace function public.import_apply(p jsonb, p_dry_run boolean default true) returns json
language plpgsql security definer set search_path = public as $$
declare b text := p #>> '{batch,id}'; v json;
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  if b is null then raise exception 'bad_batch'; end if;
  if exists (select 1 from public.import_batches where id = b) then
    return json_build_object('status', 'already_imported', 'batch', b);
  end if;
  begin
    insert into public.import_batches (id, source, note, summary, created_by)
    values (b, p #>> '{batch,source}', p #>> '{batch,note}', p -> 'summary', auth.uid());

    insert into public.cohorts (id, name, start_date, end_date, is_active, import_batch)
    select x.id, x.name, x.start_date, x.end_date, false, b
    from jsonb_to_recordset(coalesce(p -> 'cohorts', '[]')) as x(id uuid, name text, start_date date, end_date date);

    insert into public.exams (id, cohort_id, title, mode, is_open, historical_rules, import_batch)
    select x.id, x.cohort_id, x.title, 'off', false, x.historical_rules, b
    from jsonb_to_recordset(coalesce(p -> 'exams', '[]')) as x(id uuid, cohort_id uuid, title text, historical_rules jsonb);

    insert into public.exam_questions (id, exam_id, sort, qtype, prompt, options, points, explanation, source_id, import_batch)
    select x.id, x.exam_id, x.sort, x.qtype, x.prompt, x.options, x.points, x.explanation, x.source_id, b
    from jsonb_to_recordset(coalesce(p -> 'questions', '[]'))
      as x(id uuid, exam_id uuid, sort int, qtype text, prompt text, options jsonb, points numeric, explanation text, source_id text, correct jsonb);
    insert into public.exam_keys (question_id, correct)
    select x.id, x.correct from jsonb_to_recordset(coalesce(p -> 'questions', '[]')) as x(id uuid, correct jsonb) where x.correct is not null;

    insert into public.exam_submissions (id, exam_id, cohort_id, full_name, unit, id_number, receipt, attempt_no, status, status_note,
      answers, auto_points, total_points, needs_manual, score_pct, passed, submitted_at, time_spent_sec, review_flags, source_id, import_batch)
    select x.id, x.exam_id, x.cohort_id, x.full_name, x.unit, x.id_number,
      upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)), x.attempt_no, 'counted', null,
      x.answers, x.auto_points, x.total_points, false, x.score_pct, null, x.submitted_at, x.time_spent_sec,
      coalesce(x.review_flags, '{}'), x.source_id, b
    from jsonb_to_recordset(coalesce(p -> 'submissions', '[]'))
      as x(id uuid, exam_id uuid, cohort_id uuid, full_name text, unit text, id_number text, attempt_no int, answers jsonb,
           auto_points numeric, total_points numeric, score_pct numeric, submitted_at timestamptz, time_spent_sec int, review_flags text[], source_id text);

    insert into public.feedback_forms (id, cohort_id, title, intro, mode, anonymous, is_open, sections, import_batch)
    select x.id, x.cohort_id, x.title, x.intro, 'internal', true, false, coalesce(x.sections, '[]'), b
    from jsonb_to_recordset(coalesce(p -> 'feedback_forms', '[]')) as x(id uuid, cohort_id uuid, title text, intro text, sections jsonb);

    insert into public.feedback_questions (id, form_id, sort, section, qtype, prompt, options, required, placeholder, import_batch)
    select x.id, x.form_id, x.sort, x.section, x.qtype, x.prompt, coalesce(x.options, '[]'), x.required, x.placeholder, b
    from jsonb_to_recordset(coalesce(p -> 'feedback_questions', '[]'))
      as x(id uuid, form_id uuid, sort int, section text, qtype text, prompt text, options jsonb, required boolean, placeholder text);

    -- משוב אנונימי: תאריך בלבד, בלי שם ובלי שעה (גם הטריגר מנקה)
    insert into public.feedback_responses (form_id, cohort_id, answers, submitted_on, source_id, import_batch)
    select x.form_id, x.cohort_id, x.answers, x.submitted_on, x.source_id, b
    from jsonb_to_recordset(coalesce(p -> 'feedback_responses', '[]'))
      as x(form_id uuid, cohort_id uuid, answers jsonb, submitted_on date, source_id text);

    insert into public.import_records (batch_id, source_entity, source_id, outcome, target_table, target_id, flags, note, payload)
    select b, x.source_entity, x.source_id, x.outcome, x.target_table, x.target_id, coalesce(x.flags, '{}'), x.note, x.payload
    from jsonb_to_recordset(coalesce(p -> 'records', '[]'))
      as x(source_entity text, source_id text, outcome text, target_table text, target_id uuid, flags text[], note text, payload jsonb);

    select json_build_object('status', case when p_dry_run then 'dry_run' else 'imported' end, 'batch', b,
      'cohorts', (select json_agg(json_build_object('name', c.name, 'new', c.import_batch is not null,
          'submissions', (select count(*) from public.exam_submissions s where s.cohort_id = c.id and s.import_batch = b),
          'people', (select count(distinct s.id_number) from public.exam_submissions s where s.cohort_id = c.id and s.import_batch = b),
          'feedback', (select count(*) from public.feedback_responses r where r.cohort_id = c.id and r.import_batch = b),
          'questions', (select count(*) from public.exam_questions q join public.exams e on e.id = q.exam_id where e.cohort_id = c.id and q.import_batch = b))
        order by c.start_date) from public.cohorts c
        where c.import_batch = b or exists (select 1 from public.exam_submissions s where s.cohort_id = c.id and s.import_batch = b)
          or exists (select 1 from public.exam_questions q join public.exams e on e.id = q.exam_id where e.cohort_id = c.id and q.import_batch = b)
          or exists (select 1 from public.feedback_responses r where r.cohort_id = c.id and r.import_batch = b)),
      'records', (select json_object_agg(o, n) from (select outcome o, count(*) n from public.import_records where batch_id = b group by outcome) z),
      'keys', (select count(*) from public.exam_keys k join public.exam_questions q on q.id = k.question_id where q.import_batch = b),
      'anonymous_ok', not exists (select 1 from public.feedback_responses where import_batch = b and (full_name is not null or submitted_at is not null)))
    into v;
    if p_dry_run then raise exception 'import_dry_run_rollback'; end if;
  exception when raise_exception then
    if sqlerrm = 'import_dry_run_rollback' then return v; end if;
    raise;
  end;
  return v;
end $$;

-- ביטול אצווה: מוחק רק רשומות שנוצרו בה. מסרב אם במחזור שנוצר בייבוא נוספו נתונים אחרים.
create or replace function public.import_undo(p_batch text) returns json
language plpgsql security definer set search_path = public as $$
declare n_sub int; n_fb int; n_q int; n_c int;
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  if not exists (select 1 from public.import_batches where id = p_batch) then raise exception 'not_found'; end if;
  if exists (select 1 from public.cohorts c where c.import_batch = p_batch and (
       exists (select 1 from public.schedule_items x where x.cohort_id = c.id)
    or exists (select 1 from public.resources x where x.cohort_id = c.id)
    or exists (select 1 from public.exams x where x.cohort_id = c.id and x.import_batch is distinct from p_batch)
    or exists (select 1 from public.exam_submissions x where x.cohort_id = c.id and x.import_batch is distinct from p_batch)
    or exists (select 1 from public.feedback_forms x where x.cohort_id = c.id and x.import_batch is distinct from p_batch)
    or exists (select 1 from public.feedback_responses x where x.cohort_id = c.id and x.import_batch is distinct from p_batch)
    or exists (select 1 from public.certificates x where x.cohort_id = c.id))) then
    raise exception 'cohort_has_other_data';
  end if;
  if exists (select 1 from public.certificates x join public.exam_submissions s on s.id = x.source_submission where s.import_batch = p_batch) then
    raise exception 'has_certificates';
  end if;
  delete from public.feedback_responses where import_batch = p_batch; get diagnostics n_fb = row_count;
  delete from public.feedback_questions where import_batch = p_batch;
  delete from public.feedback_forms where import_batch = p_batch;
  delete from public.exam_submissions where import_batch = p_batch; get diagnostics n_sub = row_count;
  delete from public.exam_questions where import_batch = p_batch; get diagnostics n_q = row_count;
  delete from public.exams where import_batch = p_batch;
  delete from public.cohorts where import_batch = p_batch; get diagnostics n_c = row_count;
  delete from public.import_batches where id = p_batch;
  return json_build_object('submissions', n_sub, 'feedback', n_fb, 'questions', n_q, 'cohorts', n_c);
end $$;

do $$
declare f text;
begin
  foreach f in array array['public.import_apply(jsonb, boolean)', 'public.import_undo(text)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

revoke all on public.import_batches, public.import_records from anon;
grant select, insert, update, delete on public.import_batches, public.import_records to authenticated;
grant usage on sequence public.import_records_id_seq to authenticated;


-- הרשאות הרצה
do $$
declare f text;
begin
  -- פונקציות פנימיות: לא נגישות מבחוץ בכלל
  foreach f in array array['public._person_final(uuid, text)', 'public._cert_payload(public.certificates)', 'public._start_can_submit(public.exam_starts, public.exams)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
  -- ניהול: למחוברים בלבד (ובתוך כל פונקציה יש בדיקת is_admin)
  foreach f in array array['public.clone_schedule(uuid, uuid, boolean)', 'public.set_active_cohort(uuid)',
    'public.save_exam_question(uuid, uuid, int, text, text, jsonb, numeric, jsonb)', 'public.grade_manual(uuid, numeric)',
    'public.set_submission_status(uuid, text, text)', 'public.grant_retake(uuid, text)', 'public.exam_people(uuid)',
    'public.issue_certificate(uuid, boolean)', 'public.issue_all_certificates(uuid, boolean)', 'public.revoke_certificate(uuid, text)',
    'public.admin_certificate(uuid)', 'public.set_exam_open(uuid, boolean, text, integer)', 'public.exam_open_starts(uuid)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  -- ציבור: הגשה ובדיקה לפי קוד אישור בלבד
  foreach f in array array['public.start_exam(uuid, text, text, text)', 'public.save_exam_draft(text, jsonb)', 'public.get_exam_draft(text)',
    'public.submit_exam(text, jsonb)', 'public.exam_result(text)',
    'public.get_certificate(text)', 'public.submit_feedback(uuid, text, jsonb)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
end $$;

-- =====================================================================
--  אחסון קבצים: דלי ציבורי לקריאה (הורדה בקישור ישיר), כתיבה למנהלות בלבד.
--  אין מדיניות SELECT לציבור על storage.objects — כך אי אפשר לקבל רשימה של כל הקבצים.
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit)
values ('materials', 'materials', true, 52428800)
on conflict (id) do update set public = true;

drop policy if exists "materials admin write" on storage.objects;
create policy "materials admin write" on storage.objects for all to authenticated
  using (bucket_id = 'materials' and public.is_admin())
  with check (bucket_id = 'materials' and public.is_admin());

-- הרשאות בסיס לטבלאות (ההגבלה בפועל נעשית ע"י RLS שלמעלה)
grant usage on schema public to anon, authenticated;
grant select on all tables in schema public to anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
