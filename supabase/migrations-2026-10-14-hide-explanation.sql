-- 2026-10-14: an explanation on an exam question may hint at the answer, so the public gets no access to it.
-- Participants receive questions only through start_exam / get_exam_draft, which return no explanation.
-- Safe to re-run. Deletes no data.
revoke select on public.exam_questions from anon;
grant select (id, exam_id, sort, qtype, prompt, options, points) on public.exam_questions to anon;
