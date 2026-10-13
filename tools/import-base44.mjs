// ייבוא היסטוריה מהמערכת הקודמת (base44) — רץ בתוך מסך הניהול המחובר (localhost בלבד, דרך /__tools/).
// אין כאן נתונים ואין כתובת מקור: הכתובת נמסרת בזמן ההרצה. הנתונים עוברים מהמקור ישירות למסד הנתונים,
// ומה שמוחזר החוצה הוא דוח מסכם עם דוגמאות מושחרות בלבד.
//
// שימוש (בקונסולה של מסך הניהול):
//   const m = await import('/__tools/import-base44.mjs');
//   const plan = await m.buildPlan({ source: '<כתובת אפליקציית המקור>', appId: '<מזהה>', decisions });
//   m.report(plan)                      // דוח מסכם
//   await m.run(plan, { dryRun: true })  // הרצת ניסיון: מבוצע ומבוטל בעסקה אחת
//   await m.run(plan, { dryRun: false }) // ייבוא בפועל (רק אחרי אישור המנהלת)

import { createStore } from '/js/store.js';

const TZ = 'Asia/Jerusalem';
const localDate = iso => new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ });
const optId = i => String.fromCharCode(97 + i);
const luhnOk = s => { if (!/^\d{9}$/.test(s)) return false; let t = 0; for (let i = 0; i < 9; i++) { const d = +s[i] * (i % 2 ? 2 : 1); t += d > 9 ? d - 9 : d; } return t % 10 === 0; };
const normName = s => String(s || '').replace(/\s+/g, ' ').trim();
const fullName = t => `${normName(t.firstName)} ${normName(t.lastName)}`.trim();
const mask = t => `${normName(t.firstName)[0] || '?'}.${normName(t.lastName)[0] || '?'}. · ת״ז •••••••${String(t.idNumber).slice(-2)}`;
const strip = r => { const { created_by, created_by_id, ...rest } = r; return rest; };   // בלי פרטי החשבון שיצר את הרשומה במקור

// מפתחות המשוב במקור → מספר השאלה בטופס המשוב (סדר 1–15)
const FB_RATING_KEYS = ['metExpectations', 'acquiredTools', 'professionalTeaching', 'relevantContent', 'wellOrganized', 'meaningfulDiscussion', 'supportiveAtmosphere'];
const FB_FIELDS = { professionalContribution: 8, significantTopics: 9, missingTopics: 10, courseDuration: 11, readinessLevel: 12, metProfessionalNeeds: 13, improvementSuggestions: 14, additionalComments: 15 };

// רשומת בדיקה לפי סימנים ברורים בלבד; כל השאר נכנס לדוח לאישור
export function testSignals(t) {
  const s = [];
  if (/בדיקה|ניסיון|test/i.test(fullName(t))) s.push('שם של בדיקה');
  if (/^(\d)\1{8}$/.test(t.idNumber)) s.push('ת״ז מספרה חוזרת');
  return s;
}

async function fetchAll(base, entity) {
  const r = await fetch(`${base}/entities/${entity}?limit=5000`);
  if (!r.ok) throw new Error(`source ${entity}: ${r.status}`);
  const a = await r.json();
  const more = await (await fetch(`${base}/entities/${entity}?limit=5000&skip=${a.length}`)).json();
  if (more.length) throw new Error(`source ${entity}: more than one page`);
  return a;
}

/**
 * decisions = {
 *   batchId: 'base44-2026-10-13',
 *   cohorts: [{ key, name, start_date, end_date, dates: [...], nearest: [...] } | { key, existing: '<cohort uuid>', dates, nearest }],
 *     dates = מועדי המחזור; nearest = מועדים בודדים ששויכו למחזור הקרוב (יסומנו לבדיקה)
 *   versionByCohort: { key: 1|2 },
 *   copyVersionToCohort: { examId, version },            // העתקת גרסה לשאלות המבחן של מחזור קיים (סגור, בלי כללים)
 *   feedbackTemplateCohort: '<cohort uuid>',              // טופס המשוב שממנו נלקח המבנה
 *   exclude: [sourceId...], include: [sourceId...],       // החלטות ידניות על רשומות גבוליות
 *   pendingDates: ['YYYY-MM-DD', ...]                     // מועדים שהשיוך שלהם ממתין להחלטה (לא ייובאו באצווה זו)
 * }
 */
export async function buildPlan({ source, appId, decisions }) {
  const base = `${source.replace(/\/$/, '')}/api/apps/${appId}`;
  const store = await createStore();
  if (store.mode !== 'live') throw new Error('not live');
  const [T, Q, F] = await Promise.all(['TestResult', 'Question', 'Feedback'].map(e => fetchAll(base, e)));

  // ---- גרסאות המבחן: לפי קבוצת השאלות שכל ניסיון קיבל ----
  const qById = Object.fromEntries(Q.map(q => [q.id, q]));
  const setKey = t => t.answers.map(a => a.questionId).slice().sort().join(',');
  const versions = [];   // [{ order: [qid...], first, n }]
  for (const t of [...T].sort((a, b) => a.completedAt.localeCompare(b.completedAt))) {
    const k = setKey(t); let v = versions.find(x => x.key === k);
    if (!v) versions.push(v = { key: k, order: t.answers.map(a => a.questionId), first: t.completedAt, n: 0, orderVariants: new Set() });
    v.n++; v.orderVariants.add(t.answers.map(a => a.questionId).join(','));
  }
  versions.forEach((v, i) => { v.no = i + 1; });
  const versionOf = t => versions.find(v => v.key === setKey(t)).no;

  // ---- שיוך למחזורים לפי תאריך מקומי ----
  const cohortByDate = {};
  for (const c of decisions.cohorts) for (const d of [...c.dates, ...(c.nearest || [])]) cohortByDate[d] = c.key;
  const ids = () => crypto.randomUUID();
  const cohortId = {};
  const newCohorts = decisions.cohorts.filter(c => !c.existing).map(c => { cohortId[c.key] = ids(); return { id: cohortId[c.key], name: c.name, start_date: c.start_date, end_date: c.end_date }; });
  decisions.cohorts.filter(c => c.existing).forEach(c => { cohortId[c.key] = c.existing; });

  // ---- סיווג ניסיונות ----
  const exclude = new Set(decisions.exclude || []), include = new Set(decisions.include || []), pending = new Set(decisions.pendingDates || []);
  const seen = new Map();
  const rows = [...T].sort((a, b) => a.completedAt.localeCompare(b.completedAt) || a.created_date.localeCompare(b.created_date) || a.id.localeCompare(b.id)).map(t => {
    const d = localDate(t.completedAt), key = cohortByDate[d];
    const sig = testSignals(t);
    const dupKey = `${t.idNumber}|${t.completedAt}|${t.score}`;
    let outcome = 'imported', note = null;
    if (seen.has(dupKey)) { outcome = 'skipped_duplicate'; note = `כפילות זהה של ${seen.get(dupKey)}`; }
    else if ((sig.length && !include.has(t.id)) || exclude.has(t.id)) { outcome = 'skipped_test'; note = sig.join(', ') || 'הוחרג לפי החלטת המנהלת'; }
    else if (!key && pending.has(d)) { outcome = 'skipped_pending'; note = 'ממתין להחלטת המנהלת על שיוך למחזור'; }
    else if (!key) { outcome = 'unassigned'; note = 'אין מחזור לתאריך'; }
    if (outcome !== 'skipped_duplicate') seen.set(dupKey, t.id);
    return { t, d, key, outcome, note, sig };
  });
  const unassigned = rows.filter(r => r.outcome === 'unassigned');

  // ---- שאלות: עותק לכל מבחן היסטורי, בסדר המקורי ----
  const exams = [], questions = [], qMap = {};   // qMap[examId][sourceQid] = { id, q }
  const mkQuestions = (examId, versionNo) => {
    const v = versions.find(x => x.no === versionNo);
    qMap[examId] = {};
    v.order.forEach((sid, i) => {
      const q = qById[sid]; const id = ids();
      const options = q.options.map((text, k) => ({ id: optId(k), text }));
      const correct = q.isMultipleChoice ? q.correctAnswers.map(optId) : optId(q.correctAnswers[0]);
      questions.push({ id, exam_id: examId, sort: i + 1, qtype: q.isMultipleChoice ? 'multi' : 'single', prompt: q.text, options, points: 1, correct, explanation: q.explanation || null, source_id: sid });
      qMap[examId][sid] = { id, q };
    });
  };
  const examOfCohort = {};
  for (const c of decisions.cohorts) {
    if (!rows.some(r => r.key === c.key && r.outcome === 'imported')) continue;
    const id = ids(); examOfCohort[c.key] = id;
    const vno = decisions.versionByCohort[c.key];
    exams.push({ id, cohort_id: cohortId[c.key], title: 'מבחן מסכם (היסטורי — מיובא)', historical_rules: {
      source: 'מערכת המבחנים הקודמת', version: vno, questions: 40, time_limit_minutes: 75, pass_threshold_shown: 70,
      score: 'אחוז התשובות הנכונות, מעוגל למספר שלם (כפי שנשמר במקור)', attempts_limit: 'לא הוגבל במקור',
      attempt_no: 'מחושב לפי סדר ההגשות לכל ת״ז במחזור — לא נשמר במקור', timezone: 'מועדים נשמרו במקור לפי UTC; מוצגים לפי שעון ישראל',
      unit: 'לא נרשמה במקור' } });
    mkQuestions(id, vno);
  }
  if (decisions.copyVersionToCohort) mkQuestions(decisions.copyVersionToCohort.examId, decisions.copyVersionToCohort.version);

  // ---- הגשות ----
  const submissions = [], attempts = {};
  const namesByCohort = {};
  rows.filter(r => r.outcome === 'imported').forEach(r => { (namesByCohort[r.key] ??= {}); (namesByCohort[r.key][fullName(r.t)] ??= new Set()).add(r.t.idNumber); });
  for (const r of rows.filter(r => r.outcome === 'imported')) {
    const t = r.t, examId = examOfCohort[r.key], qm = qMap[examId];
    if (versionOf(t) !== decisions.versionByCohort[r.key]) throw new Error('version mismatch for cohort ' + r.key);
    const answers = {};
    for (const a of t.answers) { const m = qm[a.questionId]; if (!m) throw new Error('unknown question'); const sel = a.selectedAnswers || [];
      if (m.q.isMultipleChoice) answers[m.id] = sel.map(optId); else if (sel.length) answers[m.id] = sel.length === 1 ? optId(sel[0]) : sel.map(optId); }
    const ak = `${r.key}|${t.idNumber}`; attempts[ak] = (attempts[ak] || 0) + 1;
    const flags = ['no_unit'];
    if (!luhnOk(t.idNumber)) flags.push('invalid_id_checksum');
    if (namesByCohort[r.key][fullName(t)].size > 1) flags.push('same_name_other_id');
    if (decisions.cohorts.find(c => c.key === r.key).nearest?.includes(r.d)) flags.push('assigned_by_nearest_date');
    submissions.push({ id: ids(), exam_id: examId, cohort_id: cohortId[r.key], full_name: fullName(t), unit: null, id_number: String(t.idNumber),
      attempt_no: attempts[ak], answers, auto_points: t.answers.filter(a => a.isCorrect).length, total_points: t.answers.length,
      score_pct: t.score, submitted_at: t.completedAt, time_spent_sec: t.timeSpent, review_flags: flags, source_id: t.id, _r: r });
  }

  // ---- משוב: מבנה הטופס מועתק מתבנית קיימת; אנונימי, תאריך בלבד ----
  const tmplForm = (await store.list('feedback_forms', { eq: { cohort_id: decisions.feedbackTemplateCohort } }))[0];
  const tmplQs = await store.list('feedback_questions', { eq: { form_id: tmplForm.id }, order: [['sort']] });
  if (tmplQs.length !== 15) throw new Error('feedback template must have 15 questions');
  const feedback_forms = [], feedback_questions = [], feedback_responses = [], fbQ = {};
  const fbRows = F.map(f => ({ f, d: localDate(f.submittedAt || f.created_date) })).map(x => ({ ...x, key: cohortByDate[x.d] }));
  for (const key of [...new Set(fbRows.filter(x => x.key).map(x => x.key))]) {
    const fid = ids(); feedback_forms.push({ id: fid, cohort_id: cohortId[key], title: tmplForm.title, intro: tmplForm.intro, sections: tmplForm.sections });
    fbQ[key] = { form: fid, qs: tmplQs.map(q => { const id = ids(); feedback_questions.push({ id, form_id: fid, sort: q.sort, section: q.section, qtype: q.qtype, prompt: q.prompt, options: q.options, required: q.required, placeholder: q.placeholder }); return { ...q, newId: id }; }) };
  }
  const fbProblems = [];
  for (const x of fbRows.filter(x => x.key)) {
    const { f } = x, m = fbQ[x.key], qn = n => m.qs[n - 1];
    const ans = {};
    FB_RATING_KEYS.forEach((k, i) => { const v = f.generalSatisfaction?.[k]; if (v != null) ans[qn(i + 1).newId] = v; });
    for (const [k, n] of Object.entries(FB_FIELDS)) {
      const q = qn(n), v = f[k];
      if (q.qtype === 'multi') { const sel = (v || []).map(t => q.options.find(o => o.text === t)?.id); if (sel.some(s => !s)) fbProblems.push(k); if (sel.length) ans[q.newId] = sel; }
      else if (q.qtype === 'single') { if (v) { const o = q.options.find(o => o.text === v); if (!o) fbProblems.push(k); else ans[q.newId] = o.id; } }
      else if (String(v || '').trim()) ans[q.newId] = v;
    }
    feedback_responses.push({ form_id: m.form, cohort_id: cohortId[x.key], answers: ans, submitted_on: x.d, source_id: f.id });
  }
  if (fbProblems.length) throw new Error('feedback values without matching option: ' + [...new Set(fbProblems)].join(','));

  // ---- יומן ----
  const usedQ = new Set(versions.flatMap(v => v.order));
  const sigQ = q => JSON.stringify([q.text.trim(), q.options, q.correctAnswers, q.isMultipleChoice]);
  const records = [
    ...rows.map(r => { const s = submissions.find(x => x.source_id === r.t.id);
      return { source_entity: 'TestResult', source_id: r.t.id, outcome: r.outcome === 'unassigned' ? 'skipped_pending' : r.outcome, target_table: s ? 'exam_submissions' : null, target_id: s?.id || null,
        flags: s?.review_flags || r.sig, note: r.outcome === 'unassigned' ? 'לא שויך למחזור' : r.note, payload: strip(r.t) }; }),
    ...Q.map(q => { if (usedQ.has(q.id)) return { source_entity: 'Question', source_id: q.id, outcome: 'imported', target_table: 'exam_questions', note: `גרסה ${versions.find(v => v.order.includes(q.id)).no}`, payload: strip(q) };
      const twin = [...usedQ].find(id => sigQ(qById[id]) === sigQ(q));
      return { source_entity: 'Question', source_id: q.id, outcome: 'merged_duplicate_question', note: twin ? `עותק זהה של ${twin}` : 'לא שימשה אף מבחן', payload: strip(q) }; }),
    ...fbRows.map(x => ({ source_entity: 'Feedback', source_id: x.f.id, outcome: x.key ? 'imported' : 'skipped_pending', target_table: x.key ? 'feedback_responses' : null,
      note: x.key ? null : 'ממתין להחלטת המנהלת על שיוך למחזור', payload: strip(x.f) })),
  ];

  const plan = {
    p: { batch: { id: decisions.batchId, source: 'מערכת המבחנים הקודמת (base44)', note: 'ייבוא היסטוריה: מבחנים, שאלות ומשובים' },
      cohorts: newCohorts, exams, questions, submissions: submissions.map(({ _r, ...s }) => s), feedback_forms, feedback_questions, feedback_responses, records },
    _meta: { T, Q, F, rows, versions, unassigned, submissions, fbRows },
  };
  plan.p.summary = summarize(plan);
  return plan;
}

function summarize(plan) {
  const { rows, versions, fbRows } = plan._meta, by = (a, f) => a.reduce((m, x) => (m[f(x)] = (m[f(x)] || 0) + 1, m), {});
  return {
    source: { attempts: plan._meta.T.length, questions: plan._meta.Q.length, feedback: plan._meta.F.length },
    attempts_by_outcome: by(rows, r => r.outcome),
    attempts_by_cohort: by(rows.filter(r => r.outcome === 'imported'), r => r.key),
    feedback_by_cohort: by(fbRows, x => x.key || 'לא שויך'),
    versions: versions.map(v => ({ no: v.no, attempts: v.n, first: v.first.slice(0, 10), order_variants: v.orderVariants.size })),
    flags: by(plan._meta.submissions.flatMap(s => s.review_flags), f => f),
  };
}

// דוח לתצוגה: סיכומים ודוגמאות מושחרות בלבד
export function report(plan) {
  const { rows, unassigned, submissions, fbRows } = plan._meta;
  const maskRow = r => ({ src: r.t.id.slice(-6), date: r.d, who: mask(r.t), why: r.note });
  return {
    summary: plan.p.summary,
    skipped_test: rows.filter(r => r.outcome === 'skipped_test').map(maskRow),
    skipped_duplicate: rows.filter(r => r.outcome === 'skipped_duplicate').map(maskRow),
    unassigned: unassigned.map(maskRow),
    pending: rows.filter(r => r.outcome === 'skipped_pending').map(maskRow),
    feedback_pending: fbRows.filter(x => !x.key).map(x => x.d),
    borderline: rows.filter(r => r.outcome === 'imported' && (submissions.find(s => s.source_id === r.t.id)?.review_flags || []).some(f => f !== 'no_unit'))
      .map(r => ({ ...maskRow(r), flags: submissions.find(s => s.source_id === r.t.id).review_flags.filter(f => f !== 'no_unit') })),
    payload_bytes: JSON.stringify(plan.p).length,
  };
}

export async function run(plan, { dryRun = true } = {}) {
  if (plan._meta.unassigned.length && !dryRun) throw new Error('יש רשומות שלא שויכו — נדרשת החלטה');
  const store = await createStore();
  return store.rpc('import_apply', { p: plan.p, p_dry_run: dryRun });
}

// גיבוי פרטי: מוריד קובץ JSON (יש להעביר מיד לתיקייה הפרטית _private_import)
export function download(name, data) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
}
