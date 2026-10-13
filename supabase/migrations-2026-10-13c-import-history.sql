-- עדכון 2026-10-13 (ג): ייבוא היסטוריה ממערכת קודמת.
-- כל רשומה מיובאת נושאת מזהה אצווה ומזהה מקור. הרצה חוזרת של אותה אצווה אינה יוצרת כפילויות,
-- ואפשר לבטל אצווה שלמה בלי לגעת בנתונים שלא יובאו בה. בטוח להרצה חוזרת. אינו מוחק נתונים.

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

notify pgrst, 'reload schema';
