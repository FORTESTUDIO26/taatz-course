// שכבת הנתונים של האתר. ממשק אחד, שני מצבים:
//  live — Supabase (מסד נתונים משותף, הרשאות בצד השרת)
//  demo — תצוגת הדגמה: נתונים לדוגמה בדפדפן הזה בלבד. לא משותף, לא מאובטח, לא לשימוש אמיתי.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const DEMO_KEY = 'taatz-course-demo-v2';
const BUCKET = 'materials';
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() :
  'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => (Math.random() * 16 | 0).toString(16)));

export const ERR_HE = {
  bad_name: 'יש להזין שם מלא (2–80 תווים).',
  bad_unit: 'יש להזין יחידה.',
  bad_id: 'מספר תעודת הזהות אינו תקין. יש להקליד 9 ספרות.',
  demo_unsupported: 'הפעולה זמינה לאחר החיבור למסד הנתונים (לא בתצוגת ההדגמה).',
  not_eligible: 'אין זכאות לטופס: הציון הקובע אינו עובר, או שיש ניסיון שממתין לבדיקה.',
  already_issued: 'כבר קיים טופס בתוקף. כדי להפיק גרסה חדשה יש לבטל את הקיים.',
  already_passed: 'הנבחן/ת כבר עבר/ה את המבחן — אין צורך במבחן חוזר.',
  bad_points: 'ניקוד לא תקין.',
  not_found: 'הרשומה לא נמצאה.',
  bad_answers: 'לא ניתן לשלוח את הטופס. נסו שוב.',
  bad_receipt: 'קוד האישור לא נמצא. בדקו שהוקלד נכון.',
  not_admin: 'הפעולה מותרת למנהלות בלבד.',
  exam_closed: 'המבחן אינו פתוח כעת.',
  exam_incomplete: 'אי אפשר לפתוח את המבחן: חסרות שאלות או תשובות נכונות לשאלות סגורות.',
  feedback_incomplete: 'אי אפשר לפתוח את המשוב לפני שהוגדרו בו שאלות.',
  bad_token: 'הניסיון אינו פעיל.',
  bad_grace: 'יש לקבוע כמה דקות יוכלו מי שכבר התחילו לסיים (1–600).',
  feedback_closed: 'המשוב אינו פתוח כעת.',
  missing_required: 'יש לענות על כל שאלות החובה המסומנות בכוכבית.',
  exam_rules_before_open: 'אי אפשר לפתוח מבחן פנימי לפני שנקבעו ואושרו ציון עובר, מספר ניסיונות, מועד הצגת תוצאות ואיזה ציון קובע.',
  'Invalid login credentials': 'דוא״ל או סיסמה שגויים.',
};
export function errText(e) {
  const m = String(e?.message || e || '');
  for (const k of Object.keys(ERR_HE)) if (m.includes(k)) return ERR_HE[k];
  if (/row-level security|permission denied|42501/i.test(m)) return 'אין הרשאה לפעולה זו.';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'אין חיבור לשרת. בדקו את החיבור לאינטרנט.';
  return m || 'אירעה שגיאה.';
}

export async function createStore() {
  if (SUPABASE_URL && SUPABASE_ANON_KEY) return createLiveStore();
  return createDemoStore();
}

/* =====================================================================
   LIVE — Supabase
   ===================================================================== */
async function createLiveStore() {
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
  const ok = ({ data, error }) => { if (error) throw new Error(error.message + (error.code ? ` (${error.code})` : '')); return data; };

  const api = {
    mode: 'live',
    async session() {
      const { data: { session } } = await sb.auth.getSession();
      const user = session?.user || null;
      return { signedIn: !!user, email: user?.email || null, isAdmin: user ? !!ok(await sb.rpc('is_admin')) : false };
    },
    async list(table, { eq = {}, order = [], select = '*', inList } = {}) {
      if (inList && !inList[1].length) return [];
      let q = sb.from(table).select(select);
      for (const [k, v] of Object.entries(eq)) q = v === null ? q.is(k, null) : q.eq(k, v);
      if (inList) q = q.in(inList[0], inList[1]);
      for (const [col, asc = true] of order) q = q.order(col, { ascending: asc, nullsFirst: false });
      return ok(await q);
    },
    async insert(table, row) { return ok(await sb.from(table).insert(row).select().single()); },
    async insertMany(table, rows) { if (!rows.length) return []; return ok(await sb.from(table).insert(rows).select()); },
    async update(table, id, patch, idCol = 'id') { return ok(await sb.from(table).update(patch).eq(idCol, id).select().maybeSingle()); },
    async upsert(table, row, onConflict) { return ok(await sb.from(table).upsert(row, onConflict ? { onConflict } : undefined).select().maybeSingle()); },
    async remove(table, id, idCol = 'id') { ok(await sb.from(table).delete().eq(idCol, id)); },
    async rpc(name, args = {}) { return ok(await sb.rpc(name, args)); },
    async signOut() { await sb.auth.signOut(); },
    async adminSignIn(email, password) {
      ok(await sb.auth.signInWithPassword({ email, password }));
      if (!ok(await sb.rpc('is_admin'))) { await sb.auth.signOut(); throw new Error('not_admin'); }
    },
    fileUrl(res) {
      if (res.kind === 'link') return res.url || null;
      if (!res.storage_path) return null;
      return sb.storage.from(BUCKET).getPublicUrl(res.storage_path).data.publicUrl;
    },
    async upload(path, file) {
      ok(await sb.storage.from(BUCKET).upload(path, file, { upsert: false, contentType: file.type || undefined, cacheControl: '3600' }));
      return path;
    },
    async removeFile(path) { if (path) ok(await sb.storage.from(BUCKET).remove([path])); },
  };
  return api;
}

/* =====================================================================
   DEMO — נתונים לדוגמה, בדפדפן הזה בלבד
   ===================================================================== */
async function createDemoStore() {
  const seed = await (await fetch(new URL('../content/demo-data.json', import.meta.url))).json();
  const shiftDate = (iso, days) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
  const dayDiff = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);

  function fresh() {
    const base = seed.cohorts.find(c => !c.schedule_draft_from);
    const baseItems = seed.schedule_items.map((r, i) => ({ id: uuid(), cohort_id: base.id, day_date: r[0], start_time: r[1], end_time: r[2],
      topic: r[3], block: r[4], lecturer: r[5], location: r[6], sort: i }));
    const drafts = seed.cohorts.filter(c => c.schedule_draft_from).flatMap(c => {
      const src = seed.cohorts.find(x => x.id === c.schedule_draft_from), sh = dayDiff(src.start_date, c.start_date);
      return baseItems.filter(r => r.cohort_id === src.id).map(r => ({ ...r, id: uuid(), cohort_id: c.id, day_date: shiftDate(r.day_date, sh) }));
    });
    return {
      site_settings: Object.entries(seed.site_settings).map(([key, value]) => ({ key, value })),
      cohorts: seed.cohorts.map(({ schedule_draft_from, ...c }) => ({ created_at: new Date().toISOString(), ...c })),
      schedule_items: [...baseItems, ...drafts],
      resources: seed.resources.map((r, i) => ({ id: uuid(), section: r.section, title: r.title, description: r.description || null,
        kind: 'file', url: null, storage_path: null, file_name: null, cohort_id: null, sort: i, is_published: true, updated_at: new Date().toISOString() })),
      glossary_terms: seed.glossary_terms.map((g, i) => ({ id: uuid(), sort: i, ...g })),
      exams: [], exam_questions: [], exam_keys: [], exam_submissions: [],
      feedback_forms: [], feedback_questions: [], feedback_responses: [], private_assets: [],
      _session: { isAdmin: false },
    };
  }
  let S;
  try { S = JSON.parse(localStorage.getItem(DEMO_KEY) || 'null'); } catch { S = null; }
  if (!S || !S.cohorts) S = fresh();
  const save = () => { try { localStorage.setItem(DEMO_KEY, JSON.stringify(S)); } catch { /* demo only */ } };
  const T = name => (S[name] ||= []);
  const isActive = cid => !!T('cohorts').find(c => c.id === cid && c.is_active);
  const norm = t => String(t ?? '').replace(/["'״׳.,]/g, '').replace(/[\s\-]+/g, ' ').trim().toLowerCase();
  const fail = code => { throw new Error(code); };
  const admin = () => { if (!S._session.isAdmin) fail('not_admin'); };
  const keyOf = table => ['site_settings', 'private_assets'].includes(table) ? 'key' : table === 'exam_keys' ? 'question_id' : 'id';
  const sameArr = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
  const rulesOk = e => e.rules_approved && e.pass_score != null && e.max_attempts && e.show_results && e.final_score_rule;
  // מדמה את ההגבלות של השרת על קריאה ציבורית
  const PUBLIC_READ = {
    cohorts: r => r.is_active, schedule_items: r => isActive(r.cohort_id), site_settings: () => true, glossary_terms: () => true,
    resources: r => r.is_published && (!r.cohort_id || isActive(r.cohort_id)),
    exams: r => r.mode !== 'off' && isActive(r.cohort_id),
    exam_questions: r => { const e = T('exams').find(x => x.id === r.exam_id); return e && e.is_open && e.mode === 'internal' && isActive(e.cohort_id); },
    feedback_forms: r => r.mode !== 'off' && isActive(r.cohort_id),
    feedback_questions: r => { const f = T('feedback_forms').find(x => x.id === r.form_id); return f && f.is_open && f.mode === 'internal' && isActive(f.cohort_id); },
  };

  const rpcs = {
    is_admin: () => S._session.isAdmin,
    clone_schedule({ p_from, p_to, p_replace }) {
      admin();
      const a = T('cohorts').find(c => c.id === p_from), b = T('cohorts').find(c => c.id === p_to);
      const sh = a?.start_date && b?.start_date ? dayDiff(a.start_date, b.start_date) : 0;
      if (p_replace) S.schedule_items = T('schedule_items').filter(r => r.cohort_id !== p_to);
      const src = T('schedule_items').filter(r => r.cohort_id === p_from);
      for (const r of src) T('schedule_items').push({ ...r, id: uuid(), cohort_id: p_to, day_date: shiftDate(r.day_date, sh) });
      if (b) b.schedule_approved = false;
      return src.length;
    },
    set_active_cohort({ p_cohort }) { admin(); for (const c of T('cohorts')) c.is_active = c.id === p_cohort; },
    save_exam_question({ p_exam, p_id, p_sort, p_qtype, p_prompt, p_options, p_points, p_correct }) {
      admin();
      let q = p_id && T('exam_questions').find(x => x.id === p_id);
      const row = { exam_id: p_exam, sort: p_sort || 0, qtype: p_qtype, prompt: p_prompt, options: p_options || [], points: p_points ?? 1 };
      if (q) Object.assign(q, row); else { q = { id: uuid(), ...row }; T('exam_questions').push(q); }
      S.exam_keys = T('exam_keys').filter(k => k.question_id !== q.id);
      if (p_correct != null && p_qtype !== 'open') T('exam_keys').push({ question_id: q.id, correct: p_correct });
      return q.id;
    },
    submit_feedback({ p_form, p_name, p_answers }) {
      const f = T('feedback_forms').find(x => x.id === p_form);
      if (!f || f.mode !== 'internal' || !f.is_open || !isActive(f.cohort_id)) fail('feedback_closed');
      const today = new Date().toISOString().slice(0, 10);
      T('feedback_responses').push(f.anonymous
        ? { id: uuid(), form_id: f.id, cohort_id: f.cohort_id, full_name: null, answers: p_answers || {}, submitted_on: today, submitted_at: null }
        : { id: uuid(), form_id: f.id, cohort_id: f.cohort_id, full_name: String(p_name || '').trim().slice(0, 80) || null, answers: p_answers || {}, submitted_on: today, submitted_at: new Date().toISOString() });
      return { submitted: true };
    },
  };

  const api = {
    mode: 'demo',
    async session() { return { signedIn: S._session.isAdmin, email: S._session.isAdmin ? 'הדגמה' : null, isAdmin: S._session.isAdmin }; },
    async list(table, { eq = {}, order = [], inList } = {}) {
      let rows = T(table);
      if (!S._session.isAdmin) { const f = PUBLIC_READ[table]; rows = f ? rows.filter(f) : []; }
      rows = rows.filter(r => Object.entries(eq).every(([k, v]) => (r[k] ?? null) === v));
      if (inList) rows = rows.filter(r => inList[1].includes(r[inList[0]]));
      rows = rows.map(r => structuredClone(r));
      for (const [col, asc = true] of [...order].reverse()) rows.sort((a, b) => ((a[col] ?? '') > (b[col] ?? '') ? 1 : (a[col] ?? '') < (b[col] ?? '') ? -1 : 0) * (asc ? 1 : -1));
      return rows;
    },
    async insert(table, row) {
      admin();
      const r = { ...row }; if (keyOf(table) === 'id' && !r.id) r.id = uuid();
      if (table === 'cohorts') { r.created_at ||= new Date().toISOString(); r.schedule_approved ??= false; }
      if (table === 'exams' && r.is_open && r.mode === 'internal' && !rulesOk(r)) fail('exam_rules_before_open');
      T(table).push(r); save(); return structuredClone(r);
    },
    async insertMany(table, rows) { const out = []; for (const r of rows) out.push(await api.insert(table, r)); return out; },
    async update(table, id, patch, idCol) {
      admin();
      const k = idCol || keyOf(table); const r = T(table).find(x => x[k] === id); if (!r) return null;
      if (table === 'exams') { const n = { ...r, ...patch }; if (n.is_open && n.mode === 'internal' && !rulesOk(n)) fail('exam_rules_before_open'); }
      Object.assign(r, patch); save(); return structuredClone(r);
    },
    async upsert(table, row) {
      admin();
      const k = keyOf(table); const r = T(table).find(x => x[k] === row[k]);
      if (r) { Object.assign(r, row); save(); return structuredClone(r); }
      return api.insert(table, row);
    },
    async remove(table, id, idCol) {
      admin();
      const k = idCol || keyOf(table); S[table] = T(table).filter(x => x[k] !== id);
      if (table === 'cohorts') for (const t of ['schedule_items', 'exams', 'exam_submissions', 'feedback_forms', 'feedback_responses']) S[t] = T(t).filter(x => x.cohort_id !== id);
      if (table === 'exam_questions') S.exam_keys = T('exam_keys').filter(x => x.question_id !== id);
      save();
    },
    async rpc(name, args = {}) { if (!rpcs[name]) fail('demo_unsupported'); const out = rpcs[name](args); save(); return structuredClone(out ?? null); },
    async signOut() { S._session = { isAdmin: false }; save(); },
    async adminSignIn() { S._session.isAdmin = true; save(); },
    // בהדגמה קבצים אינם מועלים בפועל
    fileUrl(res) { return res.kind === 'link' ? res.url || null : null; },
    async upload(path) { admin(); return path; },
    async removeFile() { },
    resetDemo() { S = fresh(); save(); },
  };
  return api;
}
