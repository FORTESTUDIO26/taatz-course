// בדיקת הרשאות ולוגיקה של supabase/schema.sql + seed.sql על Postgres מקומי (PGlite), בלי חשבון ובלי רשת.
// הרצה: cd tools && npm install && npm run test:db
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';

const schema = (await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8')).replace(/create extension if not exists pgcrypto;/, '');
const seed = await readFile(new URL('../supabase/seed.sql', import.meta.url), 'utf8');
const db = new PGlite();

// --- סביבה מדומה של Supabase: תפקידים, auth, storage ---
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  grant usage on schema public, auth, storage to anon, authenticated;
  grant select, insert, update, delete on storage.objects to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;
`);
await db.exec(schema);
await db.exec(schema); // הרצה חוזרת חייבת לעבור
await db.exec(seed);
await db.exec(seed);   // וגם ההזנה
// עזר לבדיקות: התחלה + הגשה בקריאה אחת (האתר עושה זאת בשני שלבים)
await db.exec(`create function public.t_submit(p_exam uuid, p_name text, p_unit text, p_id text, p_answers jsonb) returns json
  language plpgsql as $$ declare t json; begin t := public.start_exam(p_exam, p_name, p_unit, p_id); return public.submit_exam(t->>'token', p_answers); end $$;
  grant execute on function public.t_submit(uuid, text, text, text, jsonb) to anon, authenticated;`);

const ADMIN = '00000000-0000-4000-8000-0000000000a1';
const OTHER = '00000000-0000-4000-8000-0000000000b1'; // משתמש מחובר שאינו מנהלת
await db.exec(`insert into auth.users (id, email) values ('${ADMIN}', 'admin@test'), ('${OTHER}', 'other@test');
  insert into public.admins (user_id, email) values ('${ADMIN}', 'admin@test');`);

let pass = 0, fail = 0;
const ok = (cond, name, extra = '') => { if (cond) { pass++; console.log('  ✓', name); } else { fail++; console.log('  ✗', name, extra); } };
async function as(role, uid, sql, params) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid || ''}', false); set role ${role};`);
  try { return await db.query(sql, params); } finally { await db.exec('reset role;'); }
}
const fails = async (role, uid, sql, p) => { try { await as(role, uid, sql, p); return null; } catch (e) { return e.message; } };
const rows = async (role, uid, sql, p) => (await as(role, uid, sql, p)).rows;
const C6 = '6a0c6f10-0000-4000-8000-000000000006', C7 = '6a0c6f10-0000-4000-8000-000000000007';

console.log('\nתוכן התחלתי');
const coh = await rows('authenticated', ADMIN, `select name, is_active, schedule_approved from cohorts order by start_date`);
ok(coh.length === 2 && coh[1].is_active && !coh[1].schedule_approved && !coh[0].is_active, 'מחזור ז׳ פעיל עם לו"ז ראשוני; מחזור ו׳ לא פעיל', JSON.stringify(coh));
const d7 = await rows('authenticated', ADMIN, `select distinct day_date::text d from schedule_items where cohort_id = $1 order by 1`, [C7]);
ok(d7.map(r => r.d).join() === '2026-11-02,2026-11-03,2026-11-04,2026-11-05', 'ארבעת ימי הטיוטה הועברו ל-2–5.11.2026 לפי הסדר', JSON.stringify(d7));
const cnt = await rows('authenticated', ADMIN, `select cohort_id, count(*)::int c from schedule_items group by 1 order by 1`);
ok(cnt.length === 2 && cnt[0].c === 30 && cnt[1].c === 30, 'שני הלו"זים קיימים (30 שורות כל אחד), ההזנה לא שוכפלה');

console.log('\nציבור (ללא התחברות)');
ok((await rows('anon', null, `select name from cohorts`)).map(r => r.name).join() === 'מחזור ז׳', 'רואה רק את המחזור הפעיל');
ok((await rows('anon', null, `select * from schedule_items`)).length === 30, 'רואה את לו"ז המחזור הפעיל בלבד');
ok((await rows('anon', null, `select * from resources`)).length === 14, 'רואה את כל החומרים המפורסמים');
await as('authenticated', ADMIN, `update resources set is_published = false where title = 'הפעלה בחירום'`);
ok((await rows('anon', null, `select * from resources`)).length === 13, 'חומר מוסתר אינו נראה');
ok(!!(await fails('anon', null, `insert into schedule_items (cohort_id, day_date, topic) values ($1, '2026-11-02', 'x')`, [C7])), 'לא יכול להוסיף ללו"ז');
ok((await as('anon', null, `update schedule_items set topic = 'פרצה' returning id`)).rows.length === 0, 'עדכון לו"ז לא משפיע');
ok((await as('anon', null, `delete from resources returning id`)).rows.length === 0, 'מחיקת חומרים לא משפיעה');
ok((await as('anon', null, `update cohorts set schedule_approved = true returning id`)).rows.length === 0, 'לא יכול לאשר לו"ז');
ok((await rows('anon', null, `select * from admins`)).length === 0, 'לא רואה רשימת מנהלות');
ok(/not_admin/.test(await fails('anon', null, `select set_active_cohort($1)`, [C6]) || '') || !!(await fails('anon', null, `select set_active_cohort($1)`, [C6])), 'שינוי מחזור פעיל חסום');
ok(!!(await fails('anon', null, `select clone_schedule($1, $2, true)`, [C6, C7])), 'שכפול לו"ז חסום');
ok(!!(await fails('anon', null, `insert into storage.objects (bucket_id, name) values ('materials', 'x.pdf')`)), 'העלאת קבצים חסומה');
ok((await rows('anon', null, `select * from storage.objects`)).length === 0, 'אי אפשר למשוך רשימה של כל הקבצים');
ok((await db.query(`select public from storage.buckets where id = 'materials'`)).rows[0]?.public === true, 'דלי החומרים מוגדר ציבורי לקריאה');

console.log('\nמשתמש מחובר שאינו מנהלת');
ok((await as('authenticated', OTHER, `update schedule_items set topic = 'פרצה' returning id`)).rows.length === 0, 'לא יכול לערוך לו"ז');
ok(!!(await fails('authenticated', OTHER, `insert into admins (user_id) values ($1)`, [OTHER])), 'לא יכול להוסיף את עצמו כמנהלת');
ok(/not_admin/.test(await fails('authenticated', OTHER, `select set_active_cohort($1)`, [C6])), 'פונקציות ניהול חסומות');
ok(!!(await fails('authenticated', OTHER, `insert into storage.objects (bucket_id, name) values ('materials', 'x.pdf')`)), 'העלאת קבצים חסומה');

console.log('\nמנהלת');
const C8 = (await rows('authenticated', ADMIN, `insert into cohorts (name, start_date, end_date) values ('מחזור ח', '2027-03-01', '2027-03-04') returning id`))[0].id;
ok((await rows('authenticated', ADMIN, `select clone_schedule($1, $2, false) n`, [C7, C8]))[0].n === 30, 'שכפול לו"ז למחזור חדש');
ok((await rows('authenticated', ADMIN, `select min(day_date)::text d from schedule_items where cohort_id = $1`, [C8]))[0].d === '2027-03-01', 'התאריכים הוזזו');
await as('authenticated', ADMIN, `update cohorts set schedule_approved = true where id = $1`, [C7]);
ok((await rows('anon', null, `select schedule_approved from cohorts`))[0].schedule_approved === true, 'אישור לו"ז נראה לציבור');
ok(!!(await fails('authenticated', ADMIN, `update cohorts set is_active = true where id = $1`, [C8])), 'אי אפשר שני מחזורים פעילים');

console.log('\nמבחן');
// מספרי ת"ז תקינים לבדיקה (מחושבים לפי ספרת ביקורת; לא של אנשים אמיתיים)
const mkId = base8 => { const d = String(base8).padStart(8, '0'); let s = 0;
  for (let i = 0; i < 8; i++) { let x = +d[i] * (i % 2 ? 2 : 1); s += x > 9 ? x - 9 : x; }
  return d + ((10 - s % 10) % 10); };
const ID1 = mkId('01234567'), ID2 = mkId('02345678'), ID3 = mkId('00345671');
ok(ID1.startsWith('0') && (await db.query(`select public.norm_il_id($1) v`, [ID1])).rows[0].v === ID1, 'ת"ז עם 0 מוביל נשמרת כטקסט של 9 ספרות');
ok((await db.query(`select public.norm_il_id($1) v`, [ID1.slice(1)])).rows[0].v === ID1, 'ת"ז בלי אפס מוביל מושלמת ל-9 ספרות');
ok((await db.query(`select public.norm_il_id('123456789') v`)).rows[0].v === null, 'ת"ז עם ספרת ביקורת שגויה נדחית');
const E = (await rows('authenticated', ADMIN, `insert into exams (cohort_id, title, mode) values ($1, 'מבחן', 'internal') returning id`, [C7]))[0].id;
ok(!!(await fails('authenticated', ADMIN, `update exams set pass_score = 70, max_attempts = 1, show_results = 'immediately', rules_approved = true, is_open = true where id = $1`, [E])), 'לא נפתח בלי כלל "ציון קובע"');
const q = async (sort, t, prompt, opts, pts, correct) => (await rows('authenticated', ADMIN,
  `select save_exam_question($1, null, $2, $3, $4, $5::jsonb, $6, $7::jsonb) as id`, [E, sort, t, prompt, JSON.stringify(opts), pts, correct == null ? null : JSON.stringify(correct)]))[0].id;
const Q1 = await q(0, 'single', 'ש1', [{ id: 'a', text: 'א' }, { id: 'b', text: 'ב' }], 1, 'b');
const Q2 = await q(1, 'multi', 'ש2', [{ id: 'a', text: 'א' }, { id: 'b', text: 'ב' }, { id: 'c', text: 'ג' }], 2, ['a', 'c']);
const Q3 = await q(2, 'truefalse', 'ש3', [], 1, 'false');
const Q4 = await q(3, 'short', 'ש4', [], 1, ['משא"ן']);
const ALL_RIGHT = JSON.stringify({ [Q1]: 'b', [Q2]: ['c', 'a'], [Q3]: 'false', [Q4]: 'משאן' });
const HALF = JSON.stringify({ [Q1]: 'b', [Q2]: ['a'], [Q3]: 'false' });   // 2/5 = 40
ok(!!(await fails('anon', null, `select save_exam_question($1, null, 0, 'single', 'x', '[]', 1, '"a"')`, [E])), 'הציבור לא יכול להוסיף שאלות');
ok((await rows('anon', null, `select * from exam_questions`)).length === 0, 'שאלות לא נחשפות לפני פתיחה');
ok(/exam_closed/.test(await fails('anon', null, `select t_submit($1, 'דנה כהן', 'יחידה', $2, '{}'::jsonb)`, [E, ID1])), 'אי אפשר להגיש מבחן סגור');
await as('authenticated', ADMIN, `update exams set pass_score = 70, max_attempts = 1, show_results = 'immediately', final_score_rule = 'highest', rules_approved = true, is_open = true where id = $1`, [E]);
ok((await rows('anon', null, `select * from exam_questions`)).length === 4, 'אחרי פתיחה — השאלות גלויות');
ok((await rows('anon', null, `select * from exam_keys`)).length === 0, 'מפתח התשובות חסום לציבור');
ok((await rows('authenticated', OTHER, `select * from exam_keys`)).length === 0, 'מפתח התשובות חסום גם למחובר שאינו מנהלת');
ok(/bad_id/.test(await fails('anon', null, `select t_submit($1, 'דנה כהן', 'יחידה', '123456789', '{}'::jsonb)`, [E])), 'בדיקת ת"ז בשרת');
ok(/bad_unit/.test(await fails('anon', null, `select t_submit($1, 'דנה כהן', ' ', $2, '{}'::jsonb)`, [E, ID1])), 'יחידה היא שדה חובה');
ok(/bad_name/.test(await fails('anon', null, `select t_submit($1, ' ', 'יחידה', $2, '{}'::jsonb)`, [E, ID1])), 'שם הוא שדה חובה');

// ניסיון ראשון: נכשל (40)
const a1 = (await rows('anon', null, `select t_submit($1, 'דנה כהן', 'ענף שכר', $2, $3::jsonb) r`, [E, ID1.slice(1), HALF]))[0].r;
ok(a1.score_pct == 40 && a1.passed === false && /^[0-9A-F]{12}$/.test(a1.receipt), 'ציון מחושב בשרת ומוחזר (מצב "מיד"); קוד אישור 12 תווים', JSON.stringify(a1));
ok(!('attempts_left' in a1) && !('attempt_no' in a1), 'התשובה לא חושפת מספר ניסיונות');
ok((await rows('anon', null, `select * from exam_submissions`)).length === 0, 'הציבור לא רואה הגשות');
ok((await rows('authenticated', OTHER, `select * from exam_submissions`)).length === 0, 'מחובר שאינו מנהלת לא רואה הגשות');
// ניסיון נוסף בלי אישור: נשמר כחריגה, לא נספר, והתשובה לא מגלה זאת בתוצאה כספרה
const a2 = (await rows('anon', null, `select t_submit($1, 'דנה כהן', 'ענף שכר', $2, $3::jsonb) r`, [E, ID1, ALL_RIGHT]))[0].r;
ok(a2.submitted && a2.score_pct === null && a2.receipt, 'ניסיון מעבר למותר: נקלט בלי ציון ובלי הודעת שגיאה');
let st = await rows('authenticated', ADMIN, `select attempt_no, status, score_pct::float s from exam_submissions where id_number = $1 order by attempt_no`, [ID1]);
ok(st.length === 2 && st[0].status === 'counted' && st[1].status === 'over_limit' && st[1].s === 100, 'שני הניסיונות נשמרו; השני מסומן "חריגה" ואינו נספר', JSON.stringify(st));
let pp = (await rows('authenticated', ADMIN, `select exam_people($1) p`, [E]))[0].p;
ok(pp.length === 1 && pp[0].final_score == 40 && pp[0].passed === false && pp[0].attempts === 1 && pp[0].allowed === 1, 'הציון הקובע עדיין 40 (החריגה לא נספרת)', JSON.stringify(pp));
ok(!!(await fails('anon', null, `select exam_people($1)`, [E])) && /not_admin/.test(await fails('authenticated', OTHER, `select exam_people($1)`, [E])), 'רשימת הנבחנים חסומה לציבור');
ok(!!(await fails('anon', null, `select public._person_final($1, $2)`, [E, ID1])) && !!(await fails('authenticated', OTHER, `select public._person_final($1, $2)`, [E, ID1])), 'אין פונקציה ציבורית לבדיקת ת"ז');
ok(!!(await fails('anon', null, `select public._cert_payload(c) from certificates c`)), 'פונקציה פנימית של טופס חסומה');
// תוצאה לפי קוד
let r = (await rows('anon', null, `select exam_result($1) r`, [a1.receipt.toLowerCase()]))[0].r;
ok(r.visible === true && r.score_pct == 40, 'תוצאה אישית לפי קוד אישור');
r = (await rows('anon', null, `select exam_result($1) r`, [a2.receipt]))[0].r;
ok(r.visible === false && r.score_pct === null, 'קוד של ניסיון חריג לא מציג ציון');
ok(/bad_receipt/.test(await fails('anon', null, `select exam_result($1)`, [ID1])), 'ת"ז אינה קוד גישה לתוצאה');
// טופס סיום לא מונפק למי שנכשל
const SUB1 = (await rows('authenticated', ADMIN, `select id from exam_submissions where receipt = $1`, [a1.receipt]))[0].id;
ok(/not_eligible/.test(await fails('authenticated', ADMIN, `select issue_certificate($1)`, [SUB1])), 'אין טופס סיום למי שנכשל');
// מבחן חוזר
ok(/not_admin/.test(await fails('authenticated', OTHER, `select grant_retake($1)`, [SUB1])) && !!(await fails('anon', null, `select grant_retake($1)`, [SUB1])), 'רק מנהלת מאשרת מבחן חוזר');
await as('authenticated', ADMIN, `select grant_retake($1, 'אושר')`, [SUB1]);
const a3 = (await rows('anon', null, `select t_submit($1, 'דנה כהן', 'ענף שכר', $2, $3::jsonb) r`, [E, ID1, ALL_RIGHT]))[0].r;
ok(a3.score_pct == 100 && a3.passed === true, 'אחרי אישור — ניסיון חוזר נספר ונבדק');
st = await rows('authenticated', ADMIN, `select attempt_no, status from exam_submissions where id_number = $1 order by attempt_no`, [ID1]);
ok(st.map(x => x.status).join() === 'counted,over_limit,counted' && st[2].attempt_no === 3, 'כל הניסיונות נשמרו בנפרד, בלי דריסה');
pp = (await rows('authenticated', ADMIN, `select exam_people($1) p`, [E]))[0].p;
ok(pp[0].final_score == 100 && pp[0].passed === true, 'ציון קובע לפי "הגבוה" = 100');
ok(/already_passed/.test(await fails('authenticated', ADMIN, `select grant_retake($1)`, [SUB1])), 'אין מבחן חוזר למי שכבר עבר');
await as('authenticated', ADMIN, `update exams set final_score_rule = 'last' where id = $1`, [E]);
// מספר ניסיונות נספר לפי ת"ז, לא לפי שם
const b1 = (await rows('anon', null, `select t_submit($1, 'יוסי לוי', 'ענף פרט', $2, $3::jsonb) r`, [E, ID2, HALF]))[0].r;
const b2 = (await rows('anon', null, `select t_submit($1, 'שם אחר לגמרי', 'ענף פרט', $2, $3::jsonb) r`, [E, ID2, ALL_RIGHT]))[0].r;
ok(b2.score_pct === null, 'שם אחר עם אותה ת"ז לא מקבל ניסיון נוסף');
// טופס סיום
const SUB_A3 = (await rows('authenticated', ADMIN, `select id from exam_submissions where receipt = $1`, [a3.receipt]))[0].id;
ok(!!(await fails('anon', null, `select issue_certificate($1)`, [SUB_A3])) && /not_admin/.test(await fails('authenticated', OTHER, `select issue_certificate($1)`, [SUB_A3])), 'רק מנהלת מפיקה טופס');
let gc = (await rows('anon', null, `select get_certificate($1) r`, [a3.receipt]))[0].r;
ok(gc.available === false, 'לפני אישור המנהלת — אין טופס למשתתף/ת');
await db.exec(`insert into private_assets (key, value) values ('cert_settings', '{"signer_name":"חותמת לבדיקה","signer_title":"תפקיד לבדיקה"}'), ('signature', '{"data_uri":"data:image/png;base64,AAAA"}')`);
ok((await rows('anon', null, `select * from private_assets`)).length === 0 && (await rows('authenticated', OTHER, `select * from private_assets`)).length === 0, 'קובץ החתימה ופרטי החותמת חסומים לציבור');
const cert = (await rows('authenticated', ADMIN, `select issue_certificate($1) c`, [SUB_A3]))[0].c;
ok(cert.full_name === 'דנה כהן' && cert.final_score == 100 && cert.id_number === null && cert.cohort_name === 'מחזור ז׳' && cert.start_date === '2026-11-02', 'טופס הופק: שם, ציון קובע, מחזור ותאריכים; ת"ז לא מודפסת כברירת מחדל', JSON.stringify(cert).slice(0, 300));
ok(/already_issued/.test(await fails('authenticated', ADMIN, `select issue_certificate($1)`, [SUB_A3])), 'אין שני טפסים בתוקף לאותו אדם');
ok((await rows('anon', null, `select * from certificates`)).length === 0, 'טבלת הטפסים חסומה לציבור');
gc = (await rows('anon', null, `select get_certificate($1) r`, [a3.receipt]))[0].r;
ok(gc.available && gc.certificate.full_name === 'דנה כהן' && gc.certificate.signature, 'המשתתף/ת מקבל/ת את הטופס עם קוד האישור של הניסיון הקובע');
gc = (await rows('anon', null, `select get_certificate($1) r`, [a1.receipt]))[0].r;
ok(gc.available === false, 'קוד של ניסיון אחר של אותו אדם לא פותח את הטופס');
gc = (await rows('anon', null, `select get_certificate($1) r`, [a2.receipt]))[0].r;
ok(gc.available === false, 'קוד של הגשה חריגה עם אותה ת"ז לא פותח את הטופס');
ok(/bad_receipt/.test(await fails('anon', null, `select get_certificate($1)`, [ID1])), 'ת"ז אינה קוד גישה לטופס');
// שינוי ציון אחרי הפקה → ביטול והפקה מחדש
await as('authenticated', ADMIN, `select set_submission_status($1, 'voided', 'בדיקה')`, [SUB_A3]);
pp = (await rows('authenticated', ADMIN, `select exam_people($1) p`, [E]))[0].p.find(p => p.id_number === ID1);
ok(pp.cert && pp.cert.final_score == 100 && pp.passed === false, 'אחרי ביטול ניסיון — הטופס הקיים מסומן כלא תואם לציון הנוכחי', JSON.stringify(pp));
const certId = pp.cert.id;
ok(!!(await fails('anon', null, `select revoke_certificate($1)`, [certId])), 'הציבור לא יכול לבטל טופס');
await as('authenticated', ADMIN, `select revoke_certificate($1, 'הציון השתנה')`, [certId]);
gc = (await rows('anon', null, `select get_certificate($1) r`, [a3.receipt]))[0].r;
ok(gc.available === false, 'טופס שבוטל כבר לא זמין למשתתף/ת');
await as('authenticated', ADMIN, `select set_submission_status($1, 'counted')`, [SUB_A3]);
const cert2 = (await rows('authenticated', ADMIN, `select issue_certificate($1) c`, [SUB_A3]))[0].c;
ok(cert2.version === 2, 'הפקה מחדש יוצרת גרסה 2');
const ev = await rows('authenticated', ADMIN, `select event from certificate_events order by id`);
ok(ev.map(e => e.event).join() === 'issued,participant_view,revoked,issued', 'יומן הפקות וביטולים נשמר', JSON.stringify(ev));
ok((await rows('authenticated', ADMIN, `select count(*)::int c from certificates`))[0].c === 2, 'הטופס הקודם נשמר כמבוטל, לא נמחק');
// הפקה לכל הזכאים
const ID3sub = (await rows('anon', null, `select t_submit($1, 'רונית', 'ענף קליטה', $2, $3::jsonb) r`, [E, ID3, ALL_RIGHT]))[0].r;
const nAll = (await rows('authenticated', ADMIN, `select issue_all_certificates($1) n`, [E]))[0].n;
ok(nAll === 1, 'הפקה לכל הזכאים: רק מי שעבר ואין לו טופס בתוקף (יוסי נכשל, דנה כבר קיבלה)', String(nAll));
// ניקוד ידני
const QO = await q(4, 'open', 'פתוחה', [], 2, null);
await as('authenticated', ADMIN, `select grant_retake(id) from exam_submissions where id_number = $1 limit 1`, [ID2]);
const c1 = (await rows('anon', null, `select t_submit($1, 'יוסי לוי', 'ענף פרט', $2, $3::jsonb) r`, [E, ID2, JSON.stringify({ [Q1]: 'b', [QO]: 'תשובה' })]))[0].r;
ok(c1.pending_manual === true && c1.score_pct === null, 'שאלה פתוחה: ממתין לבדיקה ידנית');
const S2 = (await rows('authenticated', ADMIN, `select id from exam_submissions where receipt = $1`, [c1.receipt]))[0].id;
ok(!!(await fails('anon', null, `select grade_manual($1, 2)`, [S2])), 'הציבור לא יכול לנקד');
await as('authenticated', ADMIN, `select grade_manual($1, 2)`, [S2]);
const g = (await rows('authenticated', ADMIN, `select score_pct::float s, passed from exam_submissions where id = $1`, [S2]))[0];
ok(g.s === 42.9 && g.passed === false, 'ניקוד ידני: (1+2)/7 = 42.9', JSON.stringify(g));
// ת"ז לא נשמרת ביומנים: אין עמודת ת"ז ביומן הטפסים
ok(!(await db.query(`select column_name from information_schema.columns where table_name = 'certificate_events'`)).rows.some(c => /id_number/.test(c.column_name)), 'יומן הטפסים לא כולל ת"ז');

console.log('\nמשוב');
const F = (await rows('authenticated', ADMIN, `insert into feedback_forms (cohort_id, mode, anonymous) values ($1, 'internal', true) returning id`, [C7]))[0].id;
await as('authenticated', ADMIN, `insert into feedback_questions (form_id, qtype, prompt) values ($1, 'rating5', 'דירוג')`, [F]);
await as('authenticated', ADMIN, `update feedback_forms set is_open = true where id = $1`, [F]);
await as('anon', null, `select submit_feedback($1, 'ניסיון לשם', '{"x":5}'::jsonb)`, [F]);
const resp = await rows('authenticated', ADMIN, `select full_name, submitted_at, submitted_on from feedback_responses`);
ok(resp.length === 1 && resp[0].full_name === null && resp[0].submitted_at === null && resp[0].submitted_on, 'משוב אנונימי: גם שם שנשלח לא נשמר, אין שעה');
ok((await rows('anon', null, `select * from feedback_responses`)).length === 0, 'הציבור לא רואה תשובות משוב');
await as('authenticated', ADMIN, `insert into feedback_responses (form_id, cohort_id, full_name, answers, submitted_at) values ($1, $2, 'שם', '{}', now())`, [F, C7]);
ok((await rows('authenticated', ADMIN, `select count(*)::int c from feedback_responses where full_name is not null or submitted_at is not null`))[0].c === 0, 'גם הכנסה ישירה למשוב אנונימי מנוקה');
await as('authenticated', ADMIN, `update feedback_forms set is_open = false where id = $1`, [F]);
ok(/feedback_closed/.test(await fails('anon', null, `select submit_feedback($1, null, '{}'::jsonb)`, [F])), 'משוב סגור לא מקבל תשובות');

console.log('\nהפרדת מחזורים');
await as('authenticated', ADMIN, `select set_active_cohort($1)`, [C8]);
ok((await rows('anon', null, `select name from cohorts`))[0].name === 'מחזור ח', 'אחרי מעבר — האתר מציג את המחזור החדש');
ok((await rows('anon', null, `select * from exam_questions`)).length === 0, 'מבחן המחזור הקודם כבר לא גלוי');
ok(/exam_closed/.test(await fails('anon', null, `select t_submit($1, 'מישהו', 'יחידה', $2, '{}'::jsonb)`, [E, ID3])), 'אי אפשר להגיש למבחן של מחזור לא פעיל');
ok((await rows('authenticated', ADMIN, `select count(*)::int c from exam_submissions where cohort_id = $1`, [C7]))[0].c === 7, 'תוצאות המחזור הקודם נשמרו');

console.log('\nפתיחה וסגירה של מבחן ומשוב');
const E2 = (await rows('authenticated', ADMIN, `insert into exams (cohort_id, title, mode, pass_score, max_attempts, show_results, final_score_rule, rules_approved)
  values ($1, 'מבחן 2', 'internal', 60, 1, 'immediately', 'last', true) returning id`, [C8]))[0].id;
ok((await rows('authenticated', ADMIN, `select is_open from exams where id = $1`, [E2]))[0].is_open === false, 'ברירת מחדל: מבחן חדש סגור');
ok(/exam_incomplete: no_questions/.test(await fails('authenticated', ADMIN, `select set_exam_open($1, true)`, [E2])), 'אי אפשר לפתוח מבחן בלי שאלות');
const P1 = (await rows('authenticated', ADMIN, `insert into exam_questions (exam_id, qtype, prompt, options, points) values ($1, 'single', 'ש', '[{"id":"a","text":"א"},{"id":"b","text":"ב"}]', 1) returning id`, [E2]))[0].id;
ok(/missing_keys/.test(await fails('authenticated', ADMIN, `select set_exam_open($1, true)`, [E2])), 'אי אפשר לפתוח מבחן בלי תשובה נכונה');
await as('authenticated', ADMIN, `insert into exam_keys values ($1, '"b"')`, [P1]);
ok(!!(await fails('anon', null, `select set_exam_open($1, true)`, [E2])) && /not_admin/.test(await fails('authenticated', OTHER, `select set_exam_open($1, true)`, [E2])), 'רק מנהלת פותחת וסוגרת');
ok(/exam_closed/.test(await fails('anon', null, `select start_exam($1, 'נבחן', 'יחידה', $2)`, [E2, ID3])), 'מבחן סגור: אי אפשר להתחיל');
ok((await rows('anon', null, `select * from exam_questions where exam_id = $1`, [E2])).length === 0, 'מבחן סגור: השאלות לא נחשפות');
await as('authenticated', ADMIN, `select set_exam_open($1, true)`, [E2]);
ok((await rows('anon', null, `select * from exam_questions where exam_id = $1`, [E2])).length === 1, 'אחרי פתיחה: השאלות גלויות');
const tA = (await rows('anon', null, `select start_exam($1, 'נבחנת א', 'יחידה', $2) r`, [E2, ID1]))[0].r.token;
const tB = (await rows('anon', null, `select start_exam($1, 'נבחן ב', 'יחידה', $2) r`, [E2, ID2]))[0].r.token;
ok(/^[0-9a-f]{64}$/.test(tA), 'קוד התחלה אקראי ארוך');
ok((await rows('authenticated', ADMIN, `select count(*)::int c from exam_starts where exam_id = $1 and status = 'started'`, [E2]))[0].c === 2, 'התחלות נרשמות בשרת');
await as('anon', null, `select save_exam_draft($1, $2::jsonb)`, [tA, JSON.stringify({ [P1]: 'b' })]);
await as('anon', null, `select save_exam_draft($1, $2::jsonb)`, [tB, JSON.stringify({ [P1]: 'a' })]);
ok((await rows('anon', null, `select * from exam_starts`)).length === 0, 'הציבור לא רואה התחלות וטיוטות');
// סגירה מתונה
await as('authenticated', ADMIN, `select set_exam_open($1, false, 'graceful', 30)`, [E2]);
ok(/exam_closed/.test(await fails('anon', null, `select start_exam($1, 'מאוחר', 'יחידה', $2)`, [E2, ID3])), 'סגירה מתונה: התחלה חדשה חסומה');
ok((await rows('anon', null, `select * from exam_questions where exam_id = $1`, [E2])).length === 0, 'סגירה מתונה: השאלות לא נחשפות לחדשים');
let dr = (await rows('anon', null, `select get_exam_draft($1) r`, [tA]))[0].r;
ok(dr.can_submit === true && dr.questions.length === 1 && dr.answers[P1] === 'b', 'מי שהתחיל: חוזר לטיוטה ולשאלות גם אחרי רענון');
const sA = (await rows('anon', null, `select submit_exam($1, $2::jsonb) r`, [tA, JSON.stringify({ [P1]: 'b' })]))[0].r;
ok(sA.submitted && sA.score_pct == 100, 'סגירה מתונה: מי שהתחיל מגיש בהצלחה');
ok(/exam_closed/.test(await fails('anon', null, `select submit_exam($1, '{}'::jsonb)`, [tA])), 'אי אפשר להגיש פעמיים עם אותו קוד התחלה');
// סגירה מיידית
await as('authenticated', ADMIN, `select set_exam_open($1, false, 'immediate')`, [E2]);
ok(/exam_closed/.test(await fails('anon', null, `select submit_exam($1, $2::jsonb)`, [tB, JSON.stringify({ [P1]: 'b' })])), 'סגירה מיידית: הגשה פעילה נחסמת (גם מדף שנשאר פתוח)');
ok(/exam_closed/.test(await fails('anon', null, `select save_exam_draft($1, '{}'::jsonb)`, [tB])), 'סגירה מיידית: שמירת טיוטה נחסמת');
const os = (await rows('authenticated', ADMIN, `select exam_open_starts($1) r`, [E2]))[0].r;
ok(os.length === 1 && os[0].status === 'closed_unsubmitted' && os[0].draft_answers[P1] === 'a' && os[0].full_name === 'נבחן ב', 'סגירה מיידית: התשובות שנשמרו נשארות אצל המנהלת');
ok((await rows('authenticated', ADMIN, `select count(*)::int c from exam_submissions where exam_id = $1`, [E2]))[0].c === 1, 'סגירה לא מוחקת הגשות');
dr = (await rows('anon', null, `select get_exam_draft($1) r`, [tB]))[0].r;
ok(dr.can_submit === false && dr.questions === null, 'אחרי סגירה מיידית: אין שאלות גם עם קוד התחלה');
await as('authenticated', ADMIN, `select set_exam_open($1, true)`, [E2]);
ok(/exam_closed/.test(await fails('anon', null, `select submit_exam($1, '{}'::jsonb)`, [tB])), 'התחלה שנסגרה נשארת סגורה גם אחרי פתיחה מחדש');
ok(/bad_token/.test(await fails('anon', null, `select get_exam_draft('xyz')`)), 'קוד התחלה שגוי לא מחזיר דבר');
// ארכה שהסתיימה
const tD = (await rows('anon', null, `select start_exam($1, 'נבחן ד', 'יחידה', $2) r`, [E2, ID3]))[0].r.token;
await as('authenticated', ADMIN, `select set_exam_open($1, false, 'graceful', 5)`, [E2]);
await db.exec(`update exams set grace_until = now() - interval '1 minute' where id = '${E2}'`);
ok(/exam_closed/.test(await fails('anon', null, `select submit_exam($1, '{}'::jsonb)`, [tD])), 'אחרי שזמן הארכה נגמר: הגשה נחסמת');
ok(/bad_grace/.test(await fails('authenticated', ADMIN, `select set_exam_open($1, false, 'graceful', 0)`, [E2])), 'סגירה מתונה דורשת זמן ארכה');
// משוב
const F2 = (await rows('authenticated', ADMIN, `insert into feedback_forms (cohort_id, mode, anonymous) values ($1, 'internal', true) returning id`, [C8]))[0].id;
ok((await rows('authenticated', ADMIN, `select is_open from feedback_forms where id = $1`, [F2]))[0].is_open === false, 'ברירת מחדל: משוב חדש סגור');
ok(/feedback_incomplete/.test(await fails('authenticated', ADMIN, `update feedback_forms set is_open = true where id = $1`, [F2])), 'אי אפשר לפתוח משוב בלי שאלות');
await as('authenticated', ADMIN, `insert into feedback_questions (form_id, qtype, prompt) values ($1, 'rating5', 'ד')`, [F2]);
ok(/feedback_closed/.test(await fails('anon', null, `select submit_feedback($1, null, '{"x":1}'::jsonb)`, [F2])), 'משוב סגור: אי אפשר לשלוח');
ok((await rows('anon', null, `select * from feedback_questions where form_id = $1`, [F2])).length === 0, 'משוב סגור: הטופס לא נחשף');
await as('authenticated', ADMIN, `update feedback_forms set is_open = true where id = $1`, [F2]);
await as('anon', null, `select submit_feedback($1, null, '{"x":1}'::jsonb)`, [F2]);
await as('authenticated', ADMIN, `update feedback_forms set is_open = false where id = $1`, [F2]);
ok(/feedback_closed/.test(await fails('anon', null, `select submit_feedback($1, null, '{"x":2}'::jsonb)`, [F2])) &&
   (await rows('authenticated', ADMIN, `select count(*)::int c from feedback_responses where form_id = $1`, [F2]))[0].c === 1, 'סגירת משוב חוסמת שליחה ולא מוחקת תשובות');
ok((await rows('authenticated', ADMIN, `select show_welcome from cohorts where id = $1`, [C8]))[0].show_welcome === true, 'ברירת מחדל: "דבר מדור ההדרכה" מוצג במחזור חדש');
console.log(`\n${pass} עברו, ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
