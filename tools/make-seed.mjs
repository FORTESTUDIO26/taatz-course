// יוצר את supabase/seed.sql מתוך docs/content/demo-data.json (התוכן ההתחלתי).
// הרצה: node tools/make-seed.mjs
import { readFile, writeFile } from 'node:fs/promises';
const data = JSON.parse(await readFile(new URL('../docs/content/demo-data.json', import.meta.url), 'utf8'));
const q = v => v == null || v === '' ? 'null' : `'${String(v).replace(/'/g, "''")}'`;
const j = v => `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
const out = ['-- תוכן התחלתי לאתר הקורס. נוצר אוטומטית ע"י tools/make-seed.mjs — להרצה אחרי schema.sql. אפשר להריץ שוב בבטחה.', 'begin;'];

for (const [k, v] of Object.entries(data.site_settings))
  out.push(`insert into site_settings (key, value) values (${q(k)}, ${j(v)}) on conflict (key) do nothing;`);
for (const c of data.cohorts)
  out.push(`insert into cohorts (id, name, start_date, end_date, is_active, schedule_approved) values (${q(c.id)}, ${q(c.name)}, ${q(c.start_date)}, ${q(c.end_date)}, ${c.is_active}, ${!!c.schedule_approved}) on conflict (id) do nothing;`);

const base = data.cohorts.find(c => !c.schedule_draft_from);
const rows = data.schedule_items.map((r, i) => `  (${q(r[0])}::date, ${q(r[1])}::time, ${q(r[2])}::time, ${q(r[3])}, ${q(r[4])}, ${q(r[5])}, ${q(r[6])}, ${i})`);
out.push(`insert into schedule_items (cohort_id, day_date, start_time, end_time, topic, block, lecturer, location, sort)
select ${q(base.id)}, v.* from (values
${rows.join(',\n')}
) v where not exists (select 1 from schedule_items where cohort_id = ${q(base.id)});`);

// טיוטת לו"ז: העתקה מהמחזור הבסיסי והזזה לפי תאריך הפתיחה (נשאר "ראשוני" עד אישור)
for (const c of data.cohorts.filter(c => c.schedule_draft_from)) {
  const src = data.cohorts.find(x => x.id === c.schedule_draft_from);
  out.push(`insert into schedule_items (cohort_id, day_date, start_time, end_time, topic, block, lecturer, location, sort)
select ${q(c.id)}, s.day_date + (date ${q(c.start_date)} - date ${q(src.start_date)}), s.start_time, s.end_time, s.topic, s.block, s.lecturer, s.location, s.sort
  from schedule_items s where s.cohort_id = ${q(src.id)}
   and not exists (select 1 from schedule_items where cohort_id = ${q(c.id)});`);
}

out.push(`insert into resources (section, title, sort)
select v.* from (values
${data.resources.map((r, i) => `  (${q(r.section)}, ${q(r.title)}, ${i})`).join(',\n')}
) v(section, title, sort) where not exists (select 1 from resources);`);
out.push('commit;', '');
await writeFile(new URL('../supabase/seed.sql', import.meta.url), out.join('\n'));
console.log('supabase/seed.sql נוצר');
