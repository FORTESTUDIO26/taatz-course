-- שדרוג למסד נתונים קיים: שיוך מצגת לשיעור בלו"ז. בטוח להרצה חוזרת. (schema.sql כבר כולל את השינוי)
alter table public.schedule_items add column if not exists resource_id uuid references public.resources(id) on delete set null;
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
