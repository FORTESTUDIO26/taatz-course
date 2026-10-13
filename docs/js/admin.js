// מסך ניהול. כל ההרשאות נבדקות בשרת (RLS + פונקציות שרת); המסך רק מציג.
import { createStore, errText } from './store.js';
import { esc, $, $$, icon, toast, sheet, confirmBox, safeUrl, fmtDate, fmtDayLong, fmtDateTime, hm, fmtRange, downloadXLSX, isBreak,
  FOOTER_TEXT, demoBanner } from './ui.js';

const TABS = [
  { r: 'cohorts', t: 'מחזורים', i: 'users' },
  { r: 'schedule', t: 'עריכת לו״ז', i: 'calendar' },
  { r: 'materials', t: 'חומרים וקישורים', i: 'booklet' },
  { r: 'podcasts', t: 'פודקאסטים', i: 'mic' },
  { r: 'content', t: 'עמוד הבית ודבר המדור', i: 'home' },
  { r: 'glossary', t: 'מילון מונחים', i: 'glossary' },
  { r: 'exam', t: 'הגדרת מבחן', i: 'exam' },
  { r: 'feedback', t: 'הגדרת משוב', i: 'feedback' },
  { r: 'results', t: 'תוצאות מבחנים', i: 'chart' },
  { r: 'certs', t: 'טופסי סיום', i: 'award' },
  { r: 'fbsummary', t: 'סיכום משובים', i: 'chart' },
];
const SECTION_NAMES = { presentations: 'מצגות הקורס', course_booklets: 'חוברות הקורס', info_booklets: 'חוברות מידע', book: 'ספר קצין משא״ן ע״צ', podcasts: 'פודקאסטים', other: 'אחר' };
const LINK_KEYS = [['policy_url', 'אתר המדיניות של מרכז תע״ץ'], ['instagram_url', 'אינסטגרם'], ['facebook_url', 'פייסבוק']];
const QTYPES_EXAM = { single: 'בחירה יחידה (אמריקאית)', multi: 'בחירה מרובה', truefalse: 'נכון / לא נכון', short: 'תשובה קצרה (השוואה לתשובות מאושרות)', open: 'שאלה פתוחה (בדיקה ידנית)' };
const QTYPES_FB = { rating5: 'דירוג 1–5', single: 'בחירה יחידה', multi: 'בחירה מרובה', text: 'טקסט קצר', longtext: 'טקסט פתוח' };
const FINAL = { highest: 'הציון הגבוה מבין הניסיונות', last: 'הציון של הניסיון האחרון' };
const STATUS = { counted: 'נספר', over_limit: 'חריגה — לא נספר', voided: 'בוטל' };
const SHOW = { immediately: 'מיד לאחר ההגשה', after_close: 'לאחר שאפרסם (כפתור "פרסום תוצאות")', never: 'לא להציג למשתתפים' };
const MODE = { off: 'כבוי', internal: 'בתוך האתר', external: 'קישור חיצוני' };

let store, ses, cohorts = [], selCohort = null;

/* ================= boot ================= */
(async function start() {
  try { store = await createStore(); } catch (e) { $('#view').innerHTML = errBox(e); return; }
  demoBanner(store, '<a href="#" data-act="reset-demo" style="color:inherit">איפוס נתוני ההדגמה</a>');
  $('#foot').innerHTML = `<div>${FOOTER_TEXT}</div>`;
  $('#burger').addEventListener('click', () => { const o = $('#side').classList.toggle('open'); $('#scrim').classList.toggle('on', o); });
  $('#scrim').addEventListener('click', closeNav);
  addEventListener('hashchange', () => { render(); scrollTo({ top: 0 }); });
  await boot();
})();
function closeNav() { $('#side').classList.remove('open'); $('#scrim').classList.remove('on'); }
const errBox = e => `<div class="wrap" style="padding-top:30px"><div class="callout key"><span class="mark"></span><div><h4>שגיאה</h4><p>${esc(errText(e))}</p></div></div></div>`;

async function boot() {
  ses = await store.session();
  if (!ses.isAdmin) return renderLogin();
  await loadCohorts();
  render();
}
async function loadCohorts() {
  cohorts = await store.list('cohorts', { order: [['start_date', false], ['created_at', false]] });
  if (!cohorts.find(c => c.id === selCohort)) selCohort = (cohorts.find(c => c.is_active) || cohorts[0])?.id || null;
}

function renderLogin() {
  $('#side').hidden = true; $('#burger').hidden = true; $('#who').innerHTML = '';
  $('#view').innerHTML = `<div class="wrap" style="max-width:480px;padding-top:40px"><div class="card pad">
    <div class="eyebrow">מסך ניהול</div><h1 style="color:var(--deep);font-size:1.6rem;margin-bottom:6px">כניסת מנהלת</h1>
    ${store.mode === 'demo' ? `<p class="muted">בתצוגת ההדגמה אין סיסמה. במערכת האמיתית הכניסה היא בדוא״ל וסיסמה, וההרשאה נבדקת בשרת.</p>
      <button class="btn solid" id="demo-login">כניסה להדגמה</button>` : `
    <form id="login-form"><div class="field"><label for="em">דוא״ל</label><input class="input" id="em" type="email" autocomplete="username" required dir="ltr"></div>
    <div class="field"><label for="pw">סיסמה</label><input class="input" id="pw" type="password" autocomplete="current-password" required dir="ltr"></div>
    <div class="err" id="login-err" role="alert"></div><button class="btn solid" type="submit">כניסה</button></form>`}
    <p class="small muted" style="margin-top:16px"><a href="./">חזרה לאתר הקורס</a></p></div></div>`;
  $('#demo-login')?.addEventListener('click', async () => { await store.adminSignIn(); boot(); });
  $('#login-form')?.addEventListener('submit', async e => {
    e.preventDefault(); const b = $('button[type=submit]', e.target); b.disabled = true;
    try { await store.adminSignIn($('#em').value.trim(), $('#pw').value); $('#pw').value = ''; await boot(); }
    catch (err) { $('#login-err').textContent = errText(err); b.disabled = false; }
  });
}

/* ================= shell ================= */
const route = () => location.hash.replace(/^#\/?/, '') || 'cohorts';
async function render() {
  $('#side').hidden = false; $('#burger').hidden = false;
  const r = route();
  if (r !== 'results' && selCohort === '*') selCohort = (cohorts.find(c => c.is_active) || cohorts[0])?.id || null;
  $('#side-nav').innerHTML = `<div class="side-grp">ניהול</div>${TABS.map(t => `<a class="nav-item${t.r === r ? ' is-on' : ''}" href="#/${t.r}">${icon(t.i)}<span>${esc(t.t)}</span></a>`).join('')}
    <div class="side-grp">אתר</div><a class="nav-item" href="./" target="_blank">${icon('external')}<span>צפייה באתר המשתתפים</span></a>
    <div class="side-who"><span class="small muted">מחובר/ת כמנהלת</span><b class="ltr" style="display:block">${esc(ses.email || '')}</b>
    <div class="row"><span></span><button class="btn ghost sm" data-act="logout">${icon('logout')}יציאה</button></div></div>`;
  $('#who').innerHTML = `<button class="iconbtn" data-act="logout" aria-label="יציאה">${icon('logout')}<span class="lbl">יציאה</span></button>`;
  closeNav();
  const v = $('#view'); v.classList.remove('view'); void v.offsetWidth; v.classList.add('view');
  try { v.innerHTML = '<div class="wrap" style="padding-top:40px"><p class="muted">טוען…</p></div>'; v.innerHTML = await (VIEWS[r] || VIEWS.cohorts)(); bindView(r); }
  catch (e) { v.innerHTML = errBox(e); }
}
const head = (ic, title, lede) => `<div class="scr-head"><div class="scr-icon">${icon(ic)}</div><div><div class="eyebrow">מסך ניהול</div><h1>${esc(title)}</h1>${lede ? `<p class="lede">${esc(lede)}</p>` : ''}</div></div>`;
const cohortPicker = (allOpt = false) => `<div class="field"><label for="pick-cohort">מחזור</label><select class="input" id="pick-cohort">
  ${allOpt ? `<option value="*"${selCohort === '*' ? ' selected' : ''}>כל המחזורים</option>` : ''}
  ${cohorts.map(c => `<option value="${c.id}"${c.id === selCohort ? ' selected' : ''}>${esc(c.name)}${c.is_active ? ' (פעיל)' : ''}</option>`).join('')}</select></div>`;
const cohortName = id => cohorts.find(c => c.id === id)?.name || '';
const noCohorts = () => `<div class="empty"><b>עדיין אין מחזורים</b>יש ליצור מחזור במסך "מחזורים".</div>`;

/* ================= generic form sheet ================= */
function fieldHTML(f, v) {
  const id = 'f_' + f.k, req = f.req ? ' required' : '';
  const hint = f.hint ? `<span class="hint">${esc(f.hint)}</span>` : '';
  if (f.type === 'checkbox') return `<label class="choice"><input type="checkbox" id="${id}" ${v ? 'checked' : ''}><span><b>${esc(f.l)}</b>${f.hint ? `<br><span class="small muted">${esc(f.hint)}</span>` : ''}</span></label>`;
  let input;
  if (f.type === 'select') input = `<select class="input" id="${id}"${req}>${Object.entries(f.opts).map(([k, t]) => `<option value="${esc(k)}"${String(v ?? '') === k ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
  else if (f.type === 'textarea') input = `<textarea class="input" id="${id}"${req} rows="${f.rows || 4}">${esc(v ?? '')}</textarea>`;
  else if (f.type === 'file') input = `<input class="input" id="${id}" type="file"${f.accept ? ` accept="${f.accept}"` : ''}>`;
  else input = `<input class="input" id="${id}" type="${f.type || 'text'}"${req} value="${esc(v ?? '')}"${f.type === 'url' || f.ltr ? ' dir="ltr"' : ''}${f.min != null ? ` min="${f.min}"` : ''}${f.max != null ? ` max="${f.max}"` : ''}${f.step ? ` step="${f.step}"` : ''}>`;
  return `<div class="field" data-fk="${f.k}"><label for="${id}">${esc(f.l)}${f.req ? ' <span class="req">*</span>' : ''}</label>${input}${hint}</div>`;
}
function readField(el, f) {
  const x = $('#f_' + f.k, el);
  if (f.type === 'checkbox') return x.checked;
  if (f.type === 'file') return x.files[0] || null;
  if (f.type === 'number') return x.value === '' ? null : Number(x.value);
  const s = x.value.trim(); return s === '' ? null : s;
}
function formSheet(title, fields, values = {}, { sub = '', wide = false, okLabel = 'שמירה', onChange } = {}) {
  return new Promise(res => {
    let done = false;
    const el = sheet(`<h3>${esc(title)}</h3>${sub ? `<p class="sub">${sub}</p>` : ''}<form novalidate>${fields.map(f => fieldHTML(f, values[f.k])).join('')}
      <div class="err" role="alert"></div><div class="btnrow" style="margin-top:8px"><button class="btn solid" type="submit">${esc(okLabel)}</button><button class="btn ghost" type="button" data-close>ביטול</button></div></form>`,
      { wide, onClose: () => { if (!done) res(null); } });
    const form = $('form', el);
    const sync = () => onChange?.(el, Object.fromEntries(fields.map(f => [f.k, readField(el, f)])));
    form.addEventListener('change', sync); sync();
    form.addEventListener('submit', e => {
      e.preventDefault();
      const out = Object.fromEntries(fields.map(f => [f.k, readField(el, f)]));
      const miss = fields.find(f => f.req && (out[f.k] == null || out[f.k] === '') && !$(`[data-fk="${f.k}"]`, el)?.hidden);
      if (miss) { $('.err', el).textContent = `יש למלא: ${miss.l}`; return; }
      for (const f of fields) if (f.type === 'url' && out[f.k] && !safeUrl(out[f.k])) { $('.err', el).textContent = `${f.l}: כתובת לא תקינה (צריכה להתחיל ב-https://)`; return; }
      done = true; el.close(); res(out);
    });
  });
}
async function run(fn, okMsg) {
  try { const r = await fn(); if (okMsg) toast(okMsg); return r; }
  catch (e) { toast(errText(e), true); throw e; }
}

/* ================= views ================= */
const VIEWS = {};
const BIND = {};
function bindView(r) { BIND[r]?.(); const p = $('#pick-cohort'); p?.addEventListener('change', () => { selCohort = p.value; render(); }); }

/* ---------- cohorts ---------- */
// מצב המבחן/המשוב לתצוגה
const hhmm = ts => new Date(ts).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
function examStateOf(e) {
  if (!e || e.mode === 'off') return { open: false, label: e ? 'כבוי — לא הוגדר אופן מבחן' : 'לא הוגדר', can: false };
  if (e.is_open) return { open: true, label: 'פתוח', can: true };
  if (e.grace_until && new Date(e.grace_until) > new Date()) return { open: false, label: `סגור להתחלות חדשות · מי שהתחיל יכול להגיש עד ${hhmm(e.grace_until)}`, can: true, grace: true };
  return { open: false, label: 'סגור', can: true };
}
function feedbackStateOf(f) {
  if (!f || f.mode === 'off') return { open: false, label: f ? 'כבוי — לא הוגדר אופן משוב' : 'לא הוגדר', can: false };
  return { open: !!f.is_open, label: f.is_open ? 'פתוח' : 'סגור', can: true };
}
const switchHTML = (attr, id, st, what) => `<div class="sw-row"><span class="sw-name">${what}</span>
  <button type="button" class="sw" role="switch" aria-checked="${st.open}" ${attr}="${id}" ${st.can ? '' : 'disabled'} aria-label="${what}: ${st.open ? 'פתוח — לחצי לסגירה' : 'סגור — לחצי לפתיחה'}"><span class="sw-knob"></span></button>
  <span class="sw-label ${st.open ? 'ok' : st.grace ? 'amber' : ''}">${esc(st.label)}</span></div>`;

VIEWS.cohorts = async () => {
  const [exams, forms] = await Promise.all([store.list('exams'), store.list('feedback_forms')]);
  const rows = cohorts.map(c => {
    const e = exams.find(x => x.cohort_id === c.id), f = forms.find(x => x.cohort_id === c.id);
    return `<div class="edit-row" style="flex-wrap:wrap"><div class="grow"><div class="t">${esc(c.name)} ${c.is_active ? '<span class="tag ok">פעיל — מוצג באתר</span>' : ''}
      ${c.schedule_approved ? '<span class="tag">לו״ז מאושר</span>' : '<span class="tag amber">לו״ז ראשוני</span>'}</div>
      <div class="d">${c.start_date ? esc(fmtRange(c.start_date, c.end_date)) : 'ללא תאריכים'}</div></div>
      <div class="btnrow">${!c.is_active ? `<button class="btn ghost sm" data-activate="${c.id}">הפיכה לפעיל</button>` : ''}
      <button class="btn ghost sm" data-edit-cohort="${c.id}">${icon('edit')}עריכה</button>
      <button class="btn danger sm" data-del-cohort="${c.id}" aria-label="מחיקה">${icon('trash')}</button></div>
      <div class="sw-box">
        ${switchHTML('data-exam-sw', c.id, examStateOf(e), 'מבחן')}
        ${switchHTML('data-fb-sw', c.id, feedbackStateOf(f), 'משוב')}
        ${switchHTML('data-welcome-sw', c.id, { open: c.show_welcome !== false, label: c.show_welcome !== false ? 'מוצג בעמוד הבית' : 'מוסתר', can: true }, 'דבר מדור ההדרכה')}
      </div></div>`;
  }).join('');
  return `<div class="wrap">${head('users', 'מחזורים', 'המחזור הפעיל הוא זה שמוצג באתר. המבחן והמשוב נפתחים ונסגרים כאן, כל אחד בנפרד — בלי לסגור את שאר האתר. סגירה לא מוחקת תוכן או תוצאות.')}
    <div class="btnrow" style="margin-bottom:16px"><button class="btn solid" id="new-cohort">${icon('plus')}מחזור חדש</button></div>
    ${rows || noCohorts()}</div>`;
};
// פתיחה/סגירה של מבחן — משותף למסך המחזורים ולמסך הגדרת המבחן
async function toggleExam(cohortId) {
  const [e] = await store.list('exams', { eq: { cohort_id: cohortId } });
  if (!e) return toast('לא הוגדר מבחן למחזור הזה (מסך "הגדרת מבחן").', true);
  const st = examStateOf(e);
  if (!st.open) {
    const rules = e.mode === 'internal' ? `ציון עובר ${e.pass_score ?? '—'}, ${e.max_attempts ?? '—'} ניסיונות.` : 'המשתתפים יקבלו את הקישור למבחן החיצוני.';
    if (!(await confirmBox(`לפתוח את המבחן של ${cohortName(cohortId)}? ${rules}`, 'פתיחת המבחן'))) return;
    await run(() => store.rpc('set_exam_open', { p_exam: e.id, p_open: true }), 'המבחן נפתח');
    return render();
  }
  const v = await formSheet(`סגירת המבחן · ${cohortName(cohortId)}`, [
    { k: 'mode', l: 'איך לסגור?', type: 'select', opts: { graceful: 'לחסום התחלות חדשות — מי שכבר התחיל יכול לסיים', immediate: 'לסגור מיד — גם מי שבאמצע המבחן לא יוכל להגיש' } },
    { k: 'grace', l: 'כמה דקות יש למי שכבר התחיל כדי לסיים ולהגיש?', type: 'number', min: 1, max: 600, req: true },
  ], { mode: 'graceful', grace: 30 }, {
    sub: 'הסגירה לא מוחקת דבר: הגשות, ציונים ותשובות שכבר נשמרו נשארים. אפשר לפתוח שוב בכל עת.<br>• <b>חסימת התחלות חדשות:</b> אי אפשר להתחיל ניסיון חדש; מי שכבר התחיל יכול להגיש עד תום הזמן שתקבעי.<br>• <b>סגירה מיידית:</b> גם הגשות פעילות נחסמות. התשובות שכבר נשמרו אוטומטית יופיעו אצלך ב״תוצאות מבחנים״ כ״נסגר לפני הגשה״.',
    okLabel: 'סגירת המבחן', onChange: (el, x) => { const g = $('[data-fk="grace"]', el); if (g) g.hidden = x.mode !== 'graceful'; } });
  if (!v) return;
  const r = await run(() => store.rpc('set_exam_open', { p_exam: e.id, p_open: false, p_mode: v.mode, p_grace_minutes: v.mode === 'graceful' ? v.grace : null }));
  toast(v.mode === 'graceful' ? `המבחן נסגר להתחלות חדשות. מי שהתחיל יכול להגיש עד ${hhmm(r.grace_until)}` : `המבחן נסגר${r.closed_starts ? ` · ${r.closed_starts} ניסיונות שלא הוגשו נשמרו כטיוטה` : ''}`);
  render();
}
async function toggleFeedback(cohortId) {
  const [f] = await store.list('feedback_forms', { eq: { cohort_id: cohortId } });
  if (!f) return toast('לא הוגדר משוב למחזור הזה (מסך "הגדרת משוב").', true);
  if (!f.is_open && !(await confirmBox(`לפתוח את המשוב של ${cohortName(cohortId)}?`, 'פתיחת המשוב'))) return;
  if (f.is_open && !(await confirmBox(`לסגור את המשוב של ${cohortName(cohortId)}? התשובות שכבר נשלחו נשמרות.`, 'סגירת המשוב'))) return;
  await run(() => store.update('feedback_forms', f.id, { is_open: !f.is_open }), f.is_open ? 'המשוב נסגר' : 'המשוב נפתח');
  render();
}
document.addEventListener('click', async ev => {
  const b = ev.target.closest('[data-exam-sw],[data-fb-sw],[data-welcome-sw]'); if (!b || b.disabled) return;
  if (b.dataset.examSw) return toggleExam(b.dataset.examSw);
  if (b.dataset.fbSw) return toggleFeedback(b.dataset.fbSw);
  if (b.dataset.welcomeSw) {
    const c = cohorts.find(x => x.id === b.dataset.welcomeSw); const show = c.show_welcome === false;
    await run(() => store.update('cohorts', c.id, { show_welcome: show }), show ? 'הברכה מוצגת בעמוד הבית' : 'הברכה הוסתרה');
    await loadCohorts(); render();
  }
});
const cohortFields = (withClone) => [
  { k: 'name', l: 'שם המחזור', req: true, hint: 'לדוגמה: מחזור ח׳' },
  { k: 'start_date', l: 'תאריך פתיחה', type: 'date' },
  { k: 'end_date', l: 'תאריך סיום', type: 'date' },
  ...(withClone ? [{ k: 'clone_from', l: 'להעתיק לו״ז ממחזור קודם?', type: 'select', opts: { '': 'לא, לו״ז ריק', ...Object.fromEntries(cohorts.map(c => [c.id, c.name])) }, hint: 'הימים יועתקו לפי הסדר לתאריכים החדשים. הלו״ז המועתק יסומן ״ראשוני – כפוף לעדכון״ עד שתאשרי אותו.' },
    { k: 'make_active', l: 'להפוך למחזור הפעיל עכשיו', type: 'checkbox', hint: 'אפשר גם בהמשך. באתר מוצג רק המחזור הפעיל.' }] : []),
];
BIND.cohorts = () => {
  $('#new-cohort')?.addEventListener('click', async () => {
    const v = await formSheet('מחזור חדש', cohortFields(true), { clone_from: cohorts.find(c => c.is_active)?.id || '' });
    if (!v) return;
    await run(async () => {
      const c = await store.insert('cohorts', { name: v.name, start_date: v.start_date, end_date: v.end_date, is_active: false, schedule_approved: false });
      if (v.clone_from) await store.rpc('clone_schedule', { p_from: v.clone_from, p_to: c.id, p_replace: false });
      if (v.make_active) await store.rpc('set_active_cohort', { p_cohort: c.id });
      selCohort = c.id;
    }, 'המחזור נוצר');
    await loadCohorts(); render();
  });
};

/* ---------- schedule ---------- */
// מצגות שהועלו (קובץ או קישור) — לבחירה בשורת לו"ז. אין שיוך אוטומטי.
async function presentationOptions() {
  const pres = (await store.list('resources', { eq: { section: 'presentations' }, order: [['sort'], ['title']] })).filter(r => r.storage_path || r.url);
  return { list: pres, opts: { '': 'ללא מצגת', ...Object.fromEntries(pres.map(p => [p.id, p.title + (p.is_published ? '' : ' (מוסתרת באתר)')])) } };
}
VIEWS.schedule = async () => {
  if (!cohorts.length) return `<div class="wrap">${head('calendar', 'עריכת לו״ז')}${noCohorts()}</div>`;
  const c = cohorts.find(x => x.id === selCohort);
  const items = await store.list('schedule_items', { eq: { cohort_id: selCohort }, order: [['day_date'], ['start_time'], ['sort']] });
  const { list: pres } = await presentationOptions();
  const presTag = r => { if (!r.resource_id) return ''; const p = pres.find(x => x.id === r.resource_id);
    return p ? ` <span class="tag">${icon('slides', 'sr')}מצגת: ${esc(p.title)}</span>` : ' <span class="tag wine">המצגת המשויכת לא נמצאה</span>'; };
  const days = [...new Set(items.map(r => r.day_date))];
  const body = days.map((d, di) => `<div class="sect-title">יום ${di + 1} · ${esc(fmtDayLong(d))}</div>
    ${items.filter(r => r.day_date === d).map(r => `<div class="edit-row"${isBreak(r.topic) ? ' style="background:var(--tint)"' : ''}>
      <div class="ltr" style="font-weight:800;color:var(--navy);min-width:92px;text-align:end">${esc(hm(r.start_time))}–${esc(hm(r.end_time))}</div>
      <div class="grow"><div class="t">${esc(r.topic)}${presTag(r)}</div><div class="d">${[r.lecturer, r.location, r.block].filter(Boolean).map(esc).join(' · ')}</div></div>
      <div class="btnrow">${isBreak(r.topic) ? '' : `<button class="btn ghost sm" data-pres-slot="${r.id}">${icon('slides')}${r.resource_id ? 'שינוי מצגת' : 'שיוך מצגת'}</button>`}
      <button class="btn ghost sm" data-edit-slot="${r.id}" aria-label="עריכה">${icon('edit')}</button>
      <button class="btn ghost sm" data-dup-slot="${r.id}" aria-label="שכפול שורה">${icon('copy')}</button>
      <button class="btn danger sm" data-del-slot="${r.id}" aria-label="מחיקה">${icon('trash')}</button></div></div>`).join('')}`).join('');
  const status = c.schedule_approved
    ? `<div class="callout ok" style="margin-bottom:14px"><span class="mark"></span><div style="flex:1"><h4>הלו״ז מאושר</h4><p>מוצג באתר כלו״ז הקורס.</p></div><button class="btn ghost sm" id="sched-approve" data-val="0" style="align-self:center">החזרה לטיוטה</button></div>`
    : `<div class="callout warn" style="margin-bottom:14px"><span class="mark"></span><div style="flex:1"><h4>לו״ז ראשוני – כפוף לעדכון</h4><p>כך הוא מסומן באתר. אחרי שתעדכני ותבדקי את הנושאים, השעות, המרצים והמיקומים — לחצי ״אישור הלו״ז״.</p></div><button class="btn solid sm" id="sched-approve" data-val="1" style="align-self:center">אישור הלו״ז</button></div>`;
  return `<div class="wrap">${head('calendar', 'עריכת לו״ז', 'שינויים נשמרים מיד ומוצגים באתר כשהמחזור פעיל. ״שיוך מצגת״ מוסיף לשיעור אייקון שפותח את המצגת.')}
    <div class="toolbar">${cohortPicker()}<button class="btn solid" id="add-slot">${icon('plus')}הוספת שורה</button>
    <button class="btn ghost" id="clone-sched">${icon('copy')}העתקת לו״ז ממחזור אחר</button></div>
    ${!c.is_active ? '<div class="callout" style="margin-bottom:14px"><span class="mark"></span><div><p>המחזור הזה אינו פעיל — הוא לא מוצג באתר כרגע.</p></div></div>' : ''}
    ${status}${body || '<div class="empty"><b>הלו״ז ריק</b>אפשר להוסיף שורות או להעתיק לו״ז ממחזור קודם.</div>'}</div>`;
};
const slotFields = (blocks, presOpts) => [
  { k: 'day_date', l: 'תאריך', type: 'date', req: true },
  { k: 'start_time', l: 'שעת התחלה', type: 'time', req: true },
  { k: 'end_time', l: 'שעת סיום', type: 'time', req: true },
  { k: 'topic', l: 'נושא', req: true },
  { k: 'lecturer', l: 'מרצה / גורם מעביר' },
  { k: 'location', l: 'מיקום' },
  { k: 'block', l: 'לבנה (שלב במודל הקורס)', hint: blocks.length ? 'קיימות: ' + blocks.join(' · ') : '' },
  { k: 'resource_id', l: 'מצגת השיעור', type: 'select', opts: presOpts, hint: 'רק מצגות שכבר הועלו. אפשר להשאיר ״ללא מצגת״.' },
];
const slotRow = v => ({ ...v, resource_id: v.resource_id || null });
BIND.schedule = () => {
  const getItems = () => store.list('schedule_items', { eq: { cohort_id: selCohort } });
  const blocksOf = items => [...new Set(items.map(r => r.block).filter(Boolean))];
  $('#sched-approve')?.addEventListener('click', async e => {
    const val = e.currentTarget.dataset.val === '1';
    if (val && !(await confirmBox(`לאשר את הלו״ז של ${cohortName(selCohort)}? הסימון ״לו״ז ראשוני״ יוסר מהאתר.`, 'אישור'))) return;
    await run(() => store.update('cohorts', selCohort, { schedule_approved: val }), val ? 'הלו״ז אושר' : 'הלו״ז סומן כראשוני');
    await loadCohorts(); render();
  });
  $('#add-slot')?.addEventListener('click', async () => {
    const items = await getItems(); const last = items.sort((a, b) => (a.day_date + a.end_time > b.day_date + b.end_time ? -1 : 1))[0];
    const c = cohorts.find(x => x.id === selCohort);
    const { opts } = await presentationOptions();
    const v = await formSheet('שורה חדשה בלו״ז', slotFields(blocksOf(items), opts), { day_date: last?.day_date || c?.start_date, start_time: hm(last?.end_time), location: last?.location, block: last?.block, resource_id: '' });
    if (!v) return;
    await run(() => store.insert('schedule_items', { ...slotRow(v), cohort_id: selCohort, sort: items.length }), 'נשמר'); render();
  });
  $('#clone-sched')?.addEventListener('click', async () => {
    const others = cohorts.filter(c => c.id !== selCohort);
    if (!others.length) return toast('אין מחזור אחר להעתקה ממנו', true);
    const v = await formSheet('העתקת לו״ז', [
      { k: 'from', l: 'להעתיק מ־', type: 'select', opts: Object.fromEntries(others.map(c => [c.id, c.name])) },
      { k: 'replace', l: 'למחוק את הלו״ז הקיים במחזור הזה לפני ההעתקה', type: 'checkbox' }],
      {}, { sub: `אל: <b>${esc(cohortName(selCohort))}</b>. התאריכים יוזזו לפי תאריך הפתיחה של כל מחזור, והלו״ז יסומן ״ראשוני״ עד לאישור.`, okLabel: 'העתקה' });
    if (!v) return;
    const n = await run(() => store.rpc('clone_schedule', { p_from: v.from, p_to: selCohort, p_replace: !!v.replace }));
    toast(`הועתקו ${n} שורות`); await loadCohorts(); render();
  });
};

/* ---------- materials ---------- */
const MAX_MB = 50;
const DOC_EXT = ['pdf', 'pptx', 'ppt', 'ppsx', 'docx', 'doc', 'xlsx', 'xls', 'png', 'jpg', 'jpeg'];
const MEDIA_EXT = ['mp3', 'm4a', 'aac', 'wav', 'ogg', 'opus', 'mp4', 'm4v', 'webm', 'mov'];
const MIME = { pdf: 'application/pdf', mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav', ogg: 'audio/ogg', opus: 'audio/ogg',
  mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', ppt: 'application/vnd.ms-powerpoint',
  ppsx: 'application/vnd.openxmlformats-officedocument.presentationml.slideshow',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', doc: 'application/msword',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xls: 'application/vnd.ms-excel', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' };
const extsFor = section => section === 'podcasts' ? MEDIA_EXT : DOC_EXT;
const acceptFor = section => extsFor(section).map(e => '.' + e).join(',');
const extOf = name => (String(name).split('.').pop() || '').toLowerCase();
const mb = n => (n / 1024 / 1024).toFixed(1);
// בדיקת קובץ לפני העלאה: סוג וגודל. מחזיר הודעת שגיאה בעברית או null.
function checkFile(section, file) {
  const ext = extOf(file.name);
  if (!extsFor(section).includes(ext)) return `סוג הקובץ (.${ext || '?'}) אינו מתאים למדור ״${SECTION_NAMES[section]}״. סוגים מותרים: ${extsFor(section).join(', ')}.`;
  if (file.size > MAX_MB * 1024 * 1024) {
    const tip = section === 'podcasts'
      ? 'אפשר לייצא את הסרטון ברזולוציה נמוכה יותר (למשל 720p), לשמור את הפרק כקובץ שמע MP3 בלבד, או לפצל אותו לשני פרקים.'
      : 'אפשר לשמור את הקובץ כ-PDF (ב-PowerPoint: קובץ ← שמירה בשם ← PDF), או לדחוס את התמונות שבו.';
    return `הקובץ שוקל ${mb(file.size)}MB, והמגבלה היא ${MAX_MB}MB לקובץ. ${tip}`;
  }
  if (!file.size) return 'הקובץ ריק.';
  return null;
}
const SINGULAR = { presentations: 'מצגת', course_booklets: 'חוברת קורס', info_booklets: 'חוברת מידע', book: 'קובץ לספר', podcasts: 'פרק', other: 'פריט' };
VIEWS.materials = () => materialsView(null);
VIEWS.podcasts = () => materialsView('podcasts');
async function materialsView(only) {
  const res = await store.list('resources', { order: [['section'], ['sort'], ['title']] });
  const settingsRows = await store.list('site_settings');
  const s = Object.fromEntries(settingsRows.map(r => [r.key, r.value]));
  const sec = Object.keys(SECTION_NAMES).filter(k => only ? k === only : k !== 'podcasts').map(k => {
    const list = res.filter(r => r.section === k);
    if (!list.length && k === 'other') return '';
    return `<div class="btnrow" style="justify-content:space-between;margin:26px 0 10px"><div class="sect-title" style="margin:0">${esc(SECTION_NAMES[k])} (${list.length})</div>
      <button class="btn solid sm" data-add-res="${k}">${icon('plus')}הוספת ${esc(SINGULAR[k])}</button></div>${list.map(r => {
      const has = r.kind === 'link' ? !!r.url : !!r.storage_path;
      return `<div class="edit-row"><div class="grow"><div class="t">${esc(r.title)} ${!r.is_published ? '<span class="tag gray">מוסתר</span>' : ''}
        ${r.cohort_id ? `<span class="tag gray">${esc(cohortName(r.cohort_id))} בלבד</span>` : ''}</div>
        <div class="d">מיקום ${r.sort} · ${has ? (r.kind === 'link' ? 'קישור חיצוני' : 'קובץ: ' + esc(r.file_name || '')) : '<b>יעלה בהמשך</b>'}</div></div>
        <div class="btnrow">${r.kind === 'file' ? `<button class="btn ghost sm" data-upload="${r.id}">${icon('download')}${has ? 'החלפת קובץ' : 'העלאת קובץ'}</button>` : ''}
        <button class="btn ghost sm" data-edit-res="${r.id}" aria-label="עריכת כותרת, מדור וסדר">${icon('edit')}</button>
        <button class="btn danger sm" data-del-res="${r.id}" aria-label="מחיקה">${icon('trash')}</button></div></div>`;
    }).join('') || `<div class="empty" style="padding:16px">${k === 'podcasts' ? 'אין עדיין פרקים. באתר מוצג ״יעלה בהמשך״.' : 'אין פריטים. באתר מוצג ״יעלה בהמשך״.'}</div>`}`;
  }).join('');
  if (only === 'podcasts') return `<div class="wrap">${head('mic', 'פודקאסטים', `הוספה ועריכה של פרקים: קובץ שמע (MP3, M4A, WAV) או וידאו (MP4, MOV, WEBM), עד ${MAX_MB}MB לקובץ. באתר יוצג נגן מתאים.`)}${sec}</div>`;
  return `<div class="wrap">${head('booklet', 'חומרים וקישורים', 'לכל מדור יש כפתור הוספה. פריט בלי קובץ מוצג באתר כ״יעלה בהמשך״. החלפת קובץ אינה משנה את העמוד או את השיוך ללו״ז.')}
    <div class="card pad" style="margin-bottom:6px"><div class="btnrow" style="justify-content:space-between"><div><b>קישורים בתחתית האתר</b>
      <div class="small muted">${LINK_KEYS.map(([k, t]) => `${esc(t)}: ${s[k] ? 'מוגדר' : 'לא הוגדר'}`).join(' · ')}</div></div>
      <button class="btn ghost sm" id="edit-social">${icon('link')}עריכת הקישורים</button></div></div>
    <div class="callout" style="margin:12px 0 4px"><span class="mark"></span><div><p class="small">כל החומרים פתוחים לצפייה ולהורדה לכל מי שנכנס לאתר, ללא התחברות. אין להעלות קבצים עם פרטים אישיים או מידע שאינו מיועד לפרסום.
    גודל קובץ מרבי: ${MAX_MB}MB. מומלץ להעלות מצגות כ-PDF (נפתח טוב בטלפון).</p></div></div>${sec}</div>`;
}
const resFields = section => [
  { k: 'section', l: 'מדור', type: 'select', opts: SECTION_NAMES },
  { k: 'title', l: 'כותרת', req: true },
  { k: 'description', l: 'תיאור קצר' },
  { k: 'kind', l: 'סוג', type: 'select', opts: { file: 'קובץ (העלאה)', link: 'קישור חיצוני' } },
  { k: 'url', l: 'כתובת הקישור', type: 'url', hint: 'מתחיל ב-https://' },
  { k: 'file', l: 'קובץ (אפשר גם להעלות אחר כך)', type: 'file', accept: acceptFor(section), hint: `סוגים: ${extsFor(section).join(', ')} · עד ${MAX_MB}MB` },
  { k: 'cohort_id', l: 'מחזור', type: 'select', opts: { '': 'כל המחזורים', ...Object.fromEntries(cohorts.map(c => [c.id, c.name])) } },
  { k: 'sort', l: 'מיקום ברשימה (מספר)', type: 'number', hint: 'מספר נמוך מופיע ראשון' },
  { k: 'is_published', l: 'מוצג באתר', type: 'checkbox' },
];
const kindToggle = (el, v) => { const f = $('[data-fk="url"]', el), u = $('[data-fk="file"]', el); if (f) f.hidden = v.kind !== 'link'; if (u) u.hidden = v.kind !== 'file'; };
// העלאה עם חלון התקדמות. נכשלת = זורקת שגיאה; לא מוצגת הצלחה.
async function uploadFor(res, file) {
  const bad = checkFile(res.section, file); if (bad) throw new Error(bad);
  const ext = extOf(file.name).replace(/[^a-z0-9]/g, '');
  const path = `${res.section}/${crypto.randomUUID()}.${ext}`;
  const typed = file.type ? file : new File([file], file.name, { type: MIME[ext] || 'application/octet-stream' });
  const prog = sheet(`<h3>מעלה קובץ…</h3><p class="sub">${esc(file.name)} · ${mb(file.size)}MB</p><div class="bar" style="height:12px"><i class="indet" style="width:40%"></i></div>
    <p class="small muted" style="margin-top:12px">נא לא לסגור את הדף עד לסיום.</p>`);
  try {
    try { await store.upload(path, typed); }
    catch (e) {
      const m = String(e.message || '');
      if (/exceeded the maximum|too large|413|Payload/i.test(m)) throw new Error(`השרת דחה את הקובץ כי הוא גדול מדי (${mb(file.size)}MB). המגבלה היא ${MAX_MB}MB לקובץ.`);
      if (/row-level security|Unauthorized|403/i.test(m)) throw new Error('אין הרשאה להעלות. ייתכן שפג תוקף הכניסה — יש לצאת ולהיכנס שוב למסך הניהול.');
      throw new Error('ההעלאה נכשלה: ' + errText(e));
    }
    try { await store.update('resources', res.id, { storage_path: path, file_name: file.name, updated_at: new Date().toISOString() }); }
    catch (e) { await store.removeFile(path).catch(() => {}); throw new Error('הקובץ הועלה אך השמירה נכשלה, ולכן הוא הוסר. נסי שוב. (' + errText(e) + ')'); }
    if (res.storage_path) await store.removeFile(res.storage_path).catch(() => {});
  } finally { prog.close(); }
}
function failBox(msg) { sheet(`<h3>הפעולה לא הושלמה</h3><div class="callout key" style="margin:10px 0 16px"><span class="mark"></span><div><p>${esc(msg)}</p></div></div><button class="btn ghost" data-close>הבנתי</button>`); }
async function addResource(section) {
  const v = await formSheet(`הוספת ${SINGULAR[section] || 'פריט'}`, resFields(section), { kind: 'file', is_published: true, section, cohort_id: '' },
    { onChange: (el, x) => { kindToggle(el, x); const fi = $('#f_file', el); if (fi) fi.accept = acceptFor(x.section || section); } });
  if (!v) return;
  const { file, ...row } = v; row.cohort_id ||= null; row.sort ??= 100;
  if (row.kind === 'file') row.url = null;
  if (file && row.kind === 'file') { const bad = checkFile(row.section, file); if (bad) return failBox(bad); }
  let r;
  try { r = await store.insert('resources', row); } catch (e) { return failBox('השמירה נכשלה: ' + errText(e)); }
  if (file && row.kind === 'file') {
    try { await uploadFor(r, file); }
    catch (e) { await store.remove('resources', r.id).catch(() => {}); render(); return failBox(e.message + ' הפריט לא נשמר.'); }
  }
  toast(file ? 'הקובץ הועלה ונשמר' : 'נשמר'); render();
}
BIND.materials = () => {
  $$('[data-add-res]').forEach(b => b.addEventListener('click', () => addResource(b.dataset.addRes)));
  $('#edit-social')?.addEventListener('click', async () => {
    const rows = await store.list('site_settings'); const s = Object.fromEntries(rows.map(r => [r.key, r.value]));
    const v = await formSheet('קישורים בתחתית האתר (נפתחים בלשונית חדשה)', LINK_KEYS.map(([k, l]) => ({ k, l, type: 'url' })), s);
    if (!v) return;
    await run(async () => { for (const [k] of LINK_KEYS) await store.upsert('site_settings', { key: k, value: v[k] || '', updated_at: new Date().toISOString() }, 'key'); }, 'נשמר');
    render();
  });
};

BIND.podcasts = () => BIND.materials();

/* ---------- home texts ---------- */
VIEWS.content = async () => {
  const rows = await store.list('site_settings'); const s = Object.fromEntries(rows.map(r => [r.key, r.value]));
  return `<div class="wrap">${head('home', 'טקסטים בדף הבית')}
    <form id="content-form" class="card pad">
      ${fieldHTML({ k: 'course_title', l: 'שם הקורס' }, s.course_title)}${fieldHTML({ k: 'org_name', l: 'שם היחידה' }, s.org_name)}
      ${fieldHTML({ k: 'home_intro', l: 'פסקת פתיחה בראש העמוד', type: 'textarea', rows: 3 }, s.home_intro)}
      <div class="sect-title">דבר מדור ההדרכה</div>
      <p class="small muted">מוצג בעמוד הבית מתחת לשם הקורס והתאריכים. הצגה/הסתרה לכל מחזור — במסך ״מחזורים״. כל שורה בתיבות הטקסט = פסקה נפרדת.</p>
      ${fieldHTML({ k: 'w_quote', l: 'ציטוט' }, (s.welcome || {}).quote)}
      ${fieldHTML({ k: 'w_source', l: 'מקור הציטוט' }, (s.welcome || {}).source)}
      ${fieldHTML({ k: 'w_title', l: 'כותרת' }, (s.welcome || {}).title)}
      ${fieldHTML({ k: 'w_intro', l: 'פתיחה (מוצגת תמיד)', type: 'textarea', rows: 3 }, (s.welcome || {}).intro)}
      ${fieldHTML({ k: 'w_body', l: 'המשך המלל (נפתח בלחיצה על ״לקריאת הברכה המלאה״)', type: 'textarea', rows: 9 }, (s.welcome || {}).body)}
      ${fieldHTML({ k: 'w_closing', l: 'שורת סיום' }, (s.welcome || {}).closing)}
      ${fieldHTML({ k: 'w_signature', l: 'חתימה' }, (s.welcome || {}).signature)}
      <div class="btnrow"><button class="btn solid" type="submit">שמירה</button></div></form></div>`;
};
BIND.content = () => {
  $('#content-form').addEventListener('submit', async e => {
    e.preventDefault();
    const now = new Date().toISOString();
    const w = Object.fromEntries(['quote', 'source', 'title', 'intro', 'body', 'closing', 'signature'].map(k => [k, $('#f_w_' + k).value.trim()]));
    await run(async () => {
      for (const k of ['course_title', 'org_name', 'home_intro']) await store.upsert('site_settings', { key: k, value: $('#f_' + k).value.trim(), updated_at: now }, 'key');
      await store.upsert('site_settings', { key: 'welcome', value: w, updated_at: now }, 'key');
    }, 'נשמר');
  });
};

/* ---------- glossary ---------- */
VIEWS.glossary = async () => {
  const g = await store.list('glossary_terms', { order: [['sort'], ['term']] });
  const gu = (await store.list('site_settings', { eq: { key: 'glossary_url' } }))[0]?.value || '';
  return `<div class="wrap">${head('glossary', 'מילון מונחים', 'באתר מוצג קישור למילון (נפתח בלשונית חדשה). כל עוד אין קישור — מוצג ״יעלה בהמשך״.')}
    <div class="card pad" style="margin-bottom:16px"><div class="field" style="margin:0"><span class="lbl">קישור למילון המונחים</span><div>${gu ? `<span class="ltr">${esc(gu)}</span>` : '<span class="muted">לא הוגדר — באתר מוצג ״יעלה בהמשך״</span>'}</div></div>
      <div class="btnrow" style="margin-top:10px"><button class="btn solid sm" id="gloss-url">${icon('link')}${gu ? 'עריכת הקישור' : 'הוספת קישור'}</button></div></div>
    <div class="sect-title">מונחים בתוך האתר (לא חובה)</div>
    <div class="btnrow" style="margin-bottom:16px"><button class="btn solid" id="add-term">${icon('plus')}מונח חדש</button><button class="btn ghost" id="bulk-terms">הדבקת רשימת מונחים</button></div>
    ${g.map(t => `<div class="edit-row"><div class="grow"><div class="t">${esc(t.term)} ${t.category ? `<span class="tag">${esc(t.category)}</span>` : ''}</div><div class="d">${esc(t.definition)}</div></div>
      <div class="btnrow"><button class="btn ghost sm" data-edit-term="${t.id}" aria-label="עריכה">${icon('edit')}</button><button class="btn danger sm" data-del-term="${t.id}" aria-label="מחיקה">${icon('trash')}</button></div></div>`).join('')
      || '<div class="empty" style="padding:16px">אין מונחים בתוך האתר. אפשר להסתפק בקישור למילון.</div>'}</div>`;
};
const termFields = [{ k: 'term', l: 'מונח', req: true }, { k: 'definition', l: 'הגדרה', type: 'textarea', req: true }, { k: 'category', l: 'קטגוריה (לא חובה)' }, { k: 'sort', l: 'מיקום (מספר)', type: 'number' }];
BIND.glossary = () => {
  $('#gloss-url')?.addEventListener('click', async () => {
    const gu = (await store.list('site_settings', { eq: { key: 'glossary_url' } }))[0]?.value || '';
    const v = await formSheet('קישור למילון המונחים', [{ k: 'glossary_url', l: 'כתובת המילון', type: 'url', hint: 'מתחיל ב-https://. אפשר להשאיר ריק כדי להציג ״יעלה בהמשך״.' }], { glossary_url: gu });
    if (!v) return;
    await run(() => store.upsert('site_settings', { key: 'glossary_url', value: v.glossary_url || '', updated_at: new Date().toISOString() }, 'key'), 'נשמר'); render();
  });
  $('#add-term')?.addEventListener('click', async () => { const v = await formSheet('מונח חדש', termFields); if (!v) return; await run(() => store.insert('glossary_terms', { ...v, sort: v.sort ?? 100 }), 'נשמר'); render(); });
  $('#bulk-terms')?.addEventListener('click', async () => {
    const v = await formSheet('הדבקת רשימת מונחים', [{ k: 'text', l: 'שורה לכל מונח, בפורמט: מונח: הגדרה', type: 'textarea', rows: 10, req: true }]);
    if (!v) return;
    const rows = v.text.split('\n').map(l => l.match(/^\s*([^:–\-]+?)\s*[:–]\s*(.+)$/)).filter(Boolean).map((m, i) => ({ term: m[1].trim(), definition: m[2].trim(), sort: 100 + i }));
    if (!rows.length) return toast('לא זוהו שורות בפורמט "מונח: הגדרה"', true);
    await run(() => store.insertMany('glossary_terms', rows), `נוספו ${rows.length} מונחים`); render();
  });
};

/* ---------- exam setup ---------- */
async function getExam() { return (await store.list('exams', { eq: { cohort_id: selCohort } }))[0] || null; }
VIEWS.exam = async () => {
  if (!cohorts.length) return `<div class="wrap">${head('exam', 'הגדרת מבחן')}${noCohorts()}</div>`;
  const e = await getExam();
  const top = `<div class="wrap">${head('exam', 'הגדרת מבחן', 'שאלות ותשובות נכונות נשמרות בשרת. מפתח התשובות אינו נשלח לדפדפן של המשתתפים, והציון מחושב בשרת.')}<div class="toolbar">${cohortPicker()}</div>`;
  if (!e) return top + `<div class="empty"><b>לא הוגדר מבחן למחזור הזה</b><div class="btnrow" style="justify-content:center;margin-top:12px">
    <button class="btn solid" id="create-exam">${icon('plus')}יצירת מבחן</button><button class="btn ghost" id="copy-exam">${icon('copy')}העתקה ממחזור אחר</button></div></div></div>`;
  const qs = await store.list('exam_questions', { eq: { exam_id: e.id }, order: [['sort']] });
  const keys = await store.list('exam_keys', { inList: ['question_id', qs.map(q => q.id)] });
  const rulesOk = e.rules_approved && e.pass_score != null && e.max_attempts && e.show_results && e.final_score_rule;
  const totalPts = qs.reduce((a, q) => a + Number(q.points || 0), 0);
  return top + `<div class="card pad stack">
    <div class="btnrow" style="justify-content:space-between"><div><div class="t" style="font-weight:800;color:var(--deep);font-size:1.15rem">${esc(e.title)}</div>
      <div class="small muted">אופן: <b>${MODE[e.mode]}</b></div></div>
      <div class="btnrow"><button class="btn ghost sm" id="exam-settings">${icon('settings')}הגדרות</button>
</div></div>
    <div class="sw-box" style="border-top:0;padding-top:0">${switchHTML('data-exam-sw', selCohort, examStateOf(e), 'מבחן')}</div>
    ${historyBox(e)}
    ${e.mode === 'internal' ? `<div class="stat"><div><div class="k">ציון עובר</div><div class="v">${e.pass_score ?? '—'}</div></div><div><div class="k">מספר ניסיונות</div><div class="v">${e.max_attempts ?? '—'}</div></div>
      <div><div class="k">הצגת תוצאות</div><div class="v" style="font-size:.95rem">${e.show_results ? SHOW[e.show_results] : '—'}</div></div><div><div class="k">ציון קובע</div><div class="v" style="font-size:.95rem">${e.final_score_rule ? FINAL[e.final_score_rule] : '—'}</div></div><div><div class="k">כללים אושרו</div><div class="v">${e.rules_approved ? 'כן' : 'לא'}</div></div></div>
      ${!rulesOk ? '<div class="callout warn"><span class="mark"></span><div><h4>המבחן לא ייפתח עדיין</h4><p>לפני פתיחה יש לקבוע ציון עובר, מספר ניסיונות, מועד הצגת תוצאות ואיזה ציון קובע, ולסמן ״אישרתי את כללי הציון״ בהגדרות.</p></div></div>' : ''}
      ${e.show_results === 'after_close' ? `<div class="btnrow"><button class="btn ghost sm" id="release">${e.results_released ? 'ביטול פרסום התוצאות' : 'פרסום התוצאות למשתתפים'}</button><span class="small muted">${e.results_released ? 'התוצאות מוצגות למשתתפים.' : 'התוצאות עוד לא מוצגות.'}</span></div>` : ''}` : ''}
    ${e.mode === 'external' ? `<p>קישור חיצוני: ${safeUrl(e.external_url) ? `<a class="ltr" href="${esc(e.external_url)}" target="_blank" rel="noopener">${esc(e.external_url)}</a>` : '<span class="req">לא הוגדר</span>'}</p>` : ''}
    </div>
    ${e.mode !== 'external' ? `<div class="sect-title">שאלות (${qs.length}) · סה״כ ${totalPts} נקודות</div>
    <div class="btnrow" style="margin-bottom:12px"><button class="btn solid" id="add-q">${icon('plus')}שאלה חדשה</button><button class="btn ghost" id="preview-types">תצוגת סוגי השאלות</button>${qs.length ? '<button class="btn solid" id="exam-preview">תצוגה מקדימה של המבחן</button>' : ''}</div>
    ${qs.map((q, i) => { const k = keys.find(x => x.question_id === q.id); return `<div class="edit-row"><div class="grow"><div class="d">שאלה ${i + 1} · ${esc(QTYPES_EXAM[q.qtype])} · ${q.points} נק׳ ${q.import_batch ? '· <span class="tag gray">מיובא</span> ' : ''}${q.qtype !== 'open' && !k ? '<span class="req">· חסרה תשובה נכונה</span>' : ''}</div><div class="t">${esc(q.prompt)}</div></div>
      <div class="btnrow"><button class="btn ghost sm" data-edit-q="${q.id}" aria-label="עריכה">${icon('edit')}</button><button class="btn danger sm" data-del-q="${q.id}" aria-label="מחיקה">${icon('trash')}</button></div></div>`; }).join('')
      || '<div class="empty"><b>אין עדיין שאלות</b>השאלות יוזנו לאחר שתספקי אותן.</div>'}` : ''}</div>`;
};
// מבחן שיובא מהמערכת הקודמת: הכללים שם מוצגים לתיעוד בלבד ואינם כללי המחזור
const HIST_LABELS = { version: 'גרסת שאלות', questions: 'מספר שאלות', time_limit_minutes: 'זמן (דקות)', pass_threshold_shown: 'סף ״עבר״ שהוצג', score: 'חישוב ציון', attempts_limit: 'מגבלת ניסיונות', attempt_no: 'מספר ניסיון', timezone: 'מועדים', unit: 'יחידה' };
function historyBox(e) {
  if (!e.historical_rules) return '';
  const h = e.historical_rules;
  return `<div class="callout"><span class="mark"></span><div><h4>מבחן היסטורי — יובא מהמערכת הקודמת</h4>
    <p class="small">ההגדרות שהיו במערכת הקודמת מוצגות לתיעוד בלבד. הן אינן כללי מבחן מאושרים, לא נקבע לפיהן ציון קובע או זכאות, ולא יופקו טופסי סיום בלי אישורך.</p>
    <ul class="small" style="margin:6px 0 0">${Object.entries(HIST_LABELS).filter(([k]) => h[k] != null).map(([k, l]) => `<li><b>${l}:</b> ${esc(h[k])}</li>`).join('')}</ul></div></div>`;
}
const FLAG_HE = { no_unit: 'יחידה לא נרשמה במקור', invalid_id_checksum: 'ת״ז לא תקינה (ספרת ביקורת)', same_name_other_id: 'אותו שם עם ת״ז אחרת במחזור', assigned_by_nearest_date: 'שויך לפי תאריך סמוך' };
const flagTags = s => (s.review_flags || []).filter(f => f !== 'no_unit').map(f => `<span class="tag amber">${esc(FLAG_HE[f] || f)}</span>`).join(' ');
const passTag = s => s.passed === true ? '<span class="tag ok">עבר</span>' : s.passed === false ? '<span class="tag wine">נכשל</span>' : '';

const examFields = [
  { k: 'title', l: 'כותרת', req: true },
  { k: 'instructions', l: 'הנחיות למשתתפים', type: 'textarea', rows: 3 },
  { k: 'mode', l: 'אופן המבחן', type: 'select', opts: MODE },
  { k: 'external_url', l: 'קישור למבחן החיצוני', type: 'url' },
  { k: 'pass_score', l: 'ציון עובר (0–100)', type: 'number', min: 0, max: 100 },
  { k: 'max_attempts', l: 'מספר ניסיונות מותר', type: 'number', min: 1, max: 20 },
  { k: 'show_results', l: 'מתי להציג למשתתף את הציון', type: 'select', opts: { '': '— לבחירה —', ...SHOW }, hint: 'במצב ״מיד״ מי שמגיש/ה מעבר למספר הניסיונות לא מקבל/ת ציון על המסך — וזה עלול לרמוז שאותה ת״ז כבר הגישה. במצבים האחרים התשובה זהה לכולם.' },
  { k: 'final_score_rule', l: 'איזה ציון קובע כשיש יותר מניסיון אחד', type: 'select', opts: { '': '— לבחירה —', ...FINAL } },
  { k: 'rules_approved', l: 'אישרתי את כללי הציון', type: 'checkbox', hint: 'הציון = סך הנקודות בשאלות שנענו נכון, חלקי סך כל הנקודות, ×100. בחירה מרובה נחשבת נכונה רק אם נבחרו בדיוק כל התשובות הנכונות. שאלות פתוחות נבדקות ידנית.' },
];
const examToggle = (el, v) => { for (const k of ['pass_score', 'max_attempts', 'show_results', 'final_score_rule', 'rules_approved']) { const x = $(`[data-fk="${k}"]`, el) || $('#f_' + k, el)?.closest('.choice'); if (x) x.hidden = v.mode !== 'internal'; } const u = $('[data-fk="external_url"]', el); if (u) u.hidden = v.mode !== 'external'; };
BIND.exam = () => {
  $('#create-exam')?.addEventListener('click', async () => { await run(() => store.insert('exams', { cohort_id: selCohort, title: 'מבחן מסכם', mode: 'off' }), 'נוצר'); render(); });
  $('#copy-exam')?.addEventListener('click', () => copyFromCohort('exam'));
  $('#exam-settings')?.addEventListener('click', async () => {
    const e = await getExam();
    const v = await formSheet('הגדרות המבחן', examFields, e, { onChange: examToggle, wide: true });
    if (!v) return;
    v.show_results ||= null;
    v.final_score_rule ||= null;
    const rulesOk = v.rules_approved && v.pass_score != null && v.max_attempts && v.show_results && v.final_score_rule;
    if (e.is_open && (v.mode === 'off' || (v.mode === 'internal' && !rulesOk))) { if (!(await confirmBox('השינוי יסגור את המבחן הפתוח. להמשיך?', 'שמירה וסגירה', true))) return; await run(() => store.rpc('set_exam_open', { p_exam: e.id, p_open: false, p_mode: 'immediate' })); }
    await run(() => store.update('exams', e.id, v), 'ההגדרות נשמרו'); render();
  });
  $('#release')?.addEventListener('click', async () => { const e = await getExam(); await run(() => store.update('exams', e.id, { results_released: !e.results_released }), 'עודכן'); render(); });
  $('#add-q')?.addEventListener('click', () => editExamQuestion(null));
  // תצוגה מקדימה למנהלת: כך נראות השאלות למשתתף. מפתח התשובות מוסתר עד שמסמנים אותו (למנהלת בלבד).
  $('#exam-preview')?.addEventListener('click', async () => {
    const e = await getExam();
    const qs = await store.list('exam_questions', { eq: { exam_id: e.id }, order: [['sort']] });
    const keys = Object.fromEntries((await store.list('exam_keys', { inList: ['question_id', qs.map(q => q.id)] })).map(k => [k.question_id, k.correct]));
    const isKey = (q, id) => { const k = keys[q.id]; return Array.isArray(k) ? k.includes(id) : k === id; };
    const el = sheet(`<div class="tag amber" style="margin-bottom:8px;white-space:normal;line-height:1.4">תצוגה מקדימה למנהלת — לא נשמר דבר, והשליחה מושבתת</div>
      <h3>${esc(e.title)}</h3>${e.instructions ? `<p class="sub" style="white-space:pre-line">${esc(e.instructions)}</p>` : ''}
      <label class="choice" style="margin:8px 0 14px"><input type="checkbox" id="pv-keys"><span>הצגת התשובות הנכונות (למנהלת בלבד — לא נשלח למשתתפים)</span></label>
      <div id="pv-exam" class="card pad" style="box-shadow:none">${qs.map((q, i) => `<fieldset class="q" style="border:0;margin:0;padding-inline:0">
        <div class="qn">שאלה ${i + 1} · ${q.points} נק׳${q.qtype === 'multi' ? ' · ניתן לבחור כמה תשובות' : ''}</div><legend class="qp">${esc(q.prompt)}</legend>
        ${(q.options || []).map(o => `<label class="choice${isKey(q, o.id) ? ' pv-key' : ''}"><input type="${q.qtype === 'multi' ? 'checkbox' : 'radio'}" name="pv_${q.id}"><span>${esc(o.text)}</span></label>`).join('')}
        ${q.qtype === 'short' ? '<input class="input" disabled>' : q.qtype === 'open' ? '<textarea class="input" disabled></textarea>' : ''}</fieldset>`).join('')}
        <div class="btnrow" style="margin-top:12px"><button class="btn solid" type="button" disabled>הגשת המבחן (מושבת בתצוגה מקדימה)</button></div></div>
      <div class="btnrow" style="margin-top:12px"><button class="btn ghost" data-close>סגירת התצוגה</button></div>`, { wide: true });
    $('#pv-keys', el).addEventListener('change', ev => $('#pv-exam', el).classList.toggle('show-keys', ev.target.checked));
  });
  $('#preview-types')?.addEventListener('click', () => sheet(`<h3>סוגי השאלות</h3><p class="sub">כך נראית כל צורת שאלה למשתתף. הנוסח כאן לתצוגה בלבד.</p>
    ${Object.entries(QTYPES_EXAM).map(([k, t]) => `<div class="q"><div class="qn">${esc(t)}</div><div class="qp">נוסח השאלה יופיע כאן</div>${k === 'single' || k === 'multi' ? `<label class="choice"><input type="${k === 'single' ? 'radio' : 'checkbox'}" disabled><span>אפשרות</span></label><label class="choice"><input type="${k === 'single' ? 'radio' : 'checkbox'}" disabled><span>אפשרות</span></label>` : k === 'truefalse' ? '<label class="choice"><input type="radio" disabled><span>נכון</span></label><label class="choice"><input type="radio" disabled><span>לא נכון</span></label>' : k === 'short' ? '<input class="input" disabled>' : '<textarea class="input" disabled></textarea>'}</div>`).join('')}
    <button class="btn ghost" data-close>סגירה</button>`, { wide: true }));
};
async function editExamQuestion(id) {
  const e = await getExam();
  const qs = await store.list('exam_questions', { eq: { exam_id: e.id }, order: [['sort']] });
  const q = qs.find(x => x.id === id) || { qtype: 'single', prompt: '', options: [], points: 1, sort: qs.length };
  const key = id ? (await store.list('exam_keys', { eq: { question_id: id } }))[0]?.correct : null;
  const el = sheet(`<h3>${id ? 'עריכת שאלה' : 'שאלה חדשה'}</h3><form novalidate>
    ${fieldHTML({ k: 'qtype', l: 'סוג השאלה', type: 'select', opts: QTYPES_EXAM }, q.qtype)}
    ${fieldHTML({ k: 'prompt', l: 'נוסח השאלה', type: 'textarea', rows: 3, req: true }, q.prompt)}
    <div data-part="options">${fieldHTML({ k: 'options', l: 'אפשרויות תשובה (כל אפשרות בשורה נפרדת)', type: 'textarea', rows: 5 }, (q.options || []).map(o => o.text).join('\n'))}
      <div class="field"><span class="lbl">התשובה הנכונה</span><div id="correct-box"></div></div></div>
    <div data-part="tf" class="field"><span class="lbl">התשובה הנכונה</span><label class="choice"><input type="radio" name="tf" value="true"${key === 'true' ? ' checked' : ''}><span>נכון</span></label><label class="choice"><input type="radio" name="tf" value="false"${key === 'false' ? ' checked' : ''}><span>לא נכון</span></label></div>
    <div data-part="short">${fieldHTML({ k: 'accepted', l: 'תשובות מקובלות (כל נוסח בשורה נפרדת)', type: 'textarea', rows: 3, hint: 'ההשוואה מתעלמת מרווחים, גרשיים ונקודות.' }, q.qtype === 'short' && Array.isArray(key) ? key.join('\n') : '')}</div>
    <div data-part="open" class="callout"><span class="mark"></span><div><p class="small">שאלה פתוחה נבדקת ידנית במסך "תוצאות מבחנים". עד הבדיקה הציון הסופי יוצג כ״ממתין לבדיקה״.</p></div></div>
    ${fieldHTML({ k: 'points', l: 'ניקוד', type: 'number', min: 0, step: '0.5' }, q.points)}
    ${fieldHTML({ k: 'sort', l: 'מיקום (מספר)', type: 'number' }, q.sort)}
    <div class="err" role="alert"></div><div class="btnrow"><button class="btn solid" type="submit">שמירה</button><button class="btn ghost" type="button" data-close>ביטול</button></div></form>`, { wide: true });
  const optsOf = () => $('#f_options', el).value.split('\n').map(s => s.trim()).filter(Boolean);
  let sel = q.qtype === 'multi' && Array.isArray(key) ? new Set(key) : new Set(key && typeof key === 'string' ? [key] : []);
  const oldIds = (q.options || []).map(o => o.id);
  // מזהה אפשרות נשמר לפי מיקום: a, b, c...
  const idAt = i => String.fromCharCode(97 + i);
  if (oldIds.length) sel = new Set([...sel].map(k => idAt(oldIds.indexOf(k))).filter(x => x >= 'a'));
  const drawCorrect = () => {
    const t = $('#f_qtype', el).value, opts = optsOf();
    $('#correct-box', el).innerHTML = opts.length ? opts.map((o, i) => `<label class="choice"><input type="${t === 'multi' ? 'checkbox' : 'radio'}" name="cor" value="${idAt(i)}"${sel.has(idAt(i)) ? ' checked' : ''}><span>${esc(o)}</span></label>`).join('') : '<span class="hint">הקלידי אפשרויות למעלה</span>';
  };
  const sync = () => {
    const t = $('#f_qtype', el).value;
    $('[data-part=options]', el).hidden = !['single', 'multi'].includes(t);
    $('[data-part=tf]', el).hidden = t !== 'truefalse';
    $('[data-part=short]', el).hidden = t !== 'short';
    $('[data-part=open]', el).hidden = t !== 'open';
    drawCorrect();
  };
  $('#f_qtype', el).addEventListener('change', () => { sel = new Set(); sync(); });
  $('#f_options', el).addEventListener('input', drawCorrect);
  el.addEventListener('change', ev => { if (ev.target.name === 'cor') sel = new Set($$('input[name=cor]:checked', el).map(x => x.value)); });
  sync();
  $('form', el).addEventListener('submit', async ev => {
    ev.preventDefault();
    const t = $('#f_qtype', el).value, prompt = $('#f_prompt', el).value.trim(), err = $('.err', el);
    if (!prompt) return err.textContent = 'יש להזין נוסח שאלה';
    let options = [], correct = null;
    if (t === 'single' || t === 'multi') {
      const opts = optsOf(); if (opts.length < 2) return err.textContent = 'יש להזין לפחות 2 אפשרויות';
      options = opts.map((text, i) => ({ id: idAt(i), text }));
      const c = $$('input[name=cor]:checked', el).map(x => x.value);
      if (!c.length) return err.textContent = 'יש לסמן את התשובה הנכונה';
      correct = t === 'multi' ? c : c[0];
    } else if (t === 'truefalse') {
      correct = $('input[name=tf]:checked', el)?.value; if (!correct) return err.textContent = 'יש לסמן את התשובה הנכונה';
    } else if (t === 'short') {
      correct = $('#f_accepted', el).value.split('\n').map(s => s.trim()).filter(Boolean); if (!correct.length) return err.textContent = 'יש להזין לפחות תשובה מקובלת אחת';
    }
    const points = $('#f_points', el).value === '' ? 1 : Number($('#f_points', el).value);
    const sort = $('#f_sort', el).value === '' ? qs.length : Number($('#f_sort', el).value);
    try {
      await store.rpc('save_exam_question', { p_exam: e.id, p_id: id, p_sort: sort, p_qtype: t, p_prompt: prompt, p_options: options, p_points: points, p_correct: correct });
      el.close(); toast('השאלה נשמרה'); render();
    } catch (x) { err.textContent = errText(x); }
  });
}

/* ---------- feedback setup ---------- */
async function getForm() { return (await store.list('feedback_forms', { eq: { cohort_id: selCohort } }))[0] || null; }
VIEWS.feedback = async () => {
  if (!cohorts.length) return `<div class="wrap">${head('feedback', 'הגדרת משוב')}${noCohorts()}</div>`;
  const f = await getForm();
  const top = `<div class="wrap">${head('feedback', 'הגדרת משוב')}<div class="toolbar">${cohortPicker()}</div>`;
  if (!f) return top + `<div class="empty"><b>לא הוגדר משוב למחזור הזה</b><div class="btnrow" style="justify-content:center;margin-top:12px">
    <button class="btn solid" id="create-fb">${icon('plus')}יצירת משוב</button><button class="btn ghost" id="copy-fb">${icon('copy')}העתקה ממחזור אחר</button></div></div></div>`;
  const qs = await store.list('feedback_questions', { eq: { form_id: f.id }, order: [['sort']] });
  const { groupSections } = await import('./fbform.js');
  const secs = groupSections(f, qs);
  let num = 0;
  const list = secs.map(s => `<div class="sect-title">${esc(s.title || 'ללא חלק')}</div>
    ${s.intro ? `<div class="small muted" style="white-space:pre-line;margin:-4px 0 10px">${esc(s.intro)}</div>` : ''}
    ${s.questions.map(q => `<div class="edit-row"><div class="grow"><div class="d">${++num} · ${esc(QTYPES_FB[q.qtype])}${q.required ? ' · <b>חובה</b>' : ' · רשות'}${q.placeholder ? ' · רמז: ' + esc(q.placeholder) : ''}</div><div class="t">${esc(q.prompt)}</div>
      ${(q.options || []).length ? `<div class="d">${q.options.map(o => (q.qtype === 'rating5' ? o.id + ' = ' : '') + esc(o.text)).join(' · ')}</div>` : ''}</div>
      <div class="btnrow"><button class="btn ghost sm" data-edit-fq="${q.id}" aria-label="עריכה">${icon('edit')}</button><button class="btn danger sm" data-del-fq="${q.id}" aria-label="מחיקה">${icon('trash')}</button></div></div>`).join('')}`).join('');
  return top + `<div class="card pad stack"><div class="btnrow" style="justify-content:space-between"><div><div style="font-weight:800;color:var(--deep);font-size:1.15rem">${esc(f.title)}</div>
    <div class="small muted">אופן: <b>${MODE[f.mode]}</b> · ${f.anonymous ? '<span class="tag ok">אנונימי</span>' : '<span class="tag amber">מזוהה</span>'}</div></div>
    <div class="btnrow"><button class="btn solid sm" id="fb-preview-btn" ${qs.length ? '' : 'disabled'}>תצוגה מקדימה</button><button class="btn ghost sm" id="fb-settings">${icon('settings')}הגדרות</button><button class="btn ghost sm" id="fb-sections">חלקים והנחיות</button></div></div>
    <div class="sw-box" style="border-top:0;padding-top:0">${switchHTML('data-fb-sw', selCohort, feedbackStateOf(f), 'משוב')}</div>
    ${f.intro ? `<div class="small" style="white-space:pre-line">${esc(f.intro)}</div>` : ''}
    ${f.mode === 'external' ? `<p>קישור חיצוני: ${safeUrl(f.external_url) ? `<a class="ltr" href="${esc(f.external_url)}" target="_blank" rel="noopener">${esc(f.external_url)}</a>` : '<span class="req">לא הוגדר</span>'}</p>` : ''}</div>
    ${f.mode !== 'external' ? `<div class="btnrow" style="justify-content:space-between;margin:22px 0 4px"><div class="sect-title" style="margin:0">שאלות (${qs.length})</div><button class="btn solid sm" id="add-fq">${icon('plus')}שאלה חדשה</button></div>
    ${list || '<div class="empty"><b>אין עדיין שאלות</b>השאלות יוזנו לאחר שתספקי אותן.</div>'}` : ''}</div>`;
};
const fbFields = [
  { k: 'title', l: 'כותרת', req: true }, { k: 'intro', l: 'פתיח למשתתפים (כל שורה = פסקה)', type: 'textarea', rows: 3 },
  { k: 'mode', l: 'אופן המשוב', type: 'select', opts: MODE }, { k: 'external_url', l: 'קישור לטופס החיצוני', type: 'url' },
  { k: 'anonymous', l: 'משוב אנונימי', type: 'checkbox', hint: 'כשמסומן: לא נשמרים שם, מזהה משתמש או שעת מילוי עם התשובות. השינוי חל על תשובות חדשות בלבד.' },
];
const fqFields = sections => [
  { k: 'qtype', l: 'סוג השאלה', type: 'select', opts: QTYPES_FB },
  { k: 'section', l: 'חלק', hint: sections.length ? 'חלקים קיימים: ' + sections.join(' · ') : 'לדוגמה: חלק א\' - התרשמות כללית' },
  { k: 'prompt', l: 'נוסח השאלה', type: 'textarea', rows: 2, req: true },
  { k: 'options', l: 'אפשרויות (כל אפשרות בשורה)', type: 'textarea', rows: 5 },
  { k: 'placeholder', l: 'טקסט רמז בתיבת התשובה (לא חובה)' },
  { k: 'required', l: 'שאלת חובה', type: 'checkbox' }, { k: 'sort', l: 'מיקום (מספר)', type: 'number' },
];
BIND.feedback = () => {
  $('#create-fb')?.addEventListener('click', async () => { await run(() => store.insert('feedback_forms', { cohort_id: selCohort, title: 'משוב הקורס', mode: 'off', anonymous: true }), 'נוצר'); render(); });
  $('#copy-fb')?.addEventListener('click', () => copyFromCohort('feedback'));
  $('#fb-settings')?.addEventListener('click', async () => {
    const f = await getForm();
    const v = await formSheet('הגדרות המשוב', fbFields, f, { onChange: (el, x) => { $('[data-fk="external_url"]', el).hidden = x.mode !== 'external'; } });
    if (!v) return; await run(() => store.update('feedback_forms', f.id, v), 'נשמר'); render();
  });
  $('#fb-sections')?.addEventListener('click', async () => {
    const f = await getForm(); const qs = await store.list('feedback_questions', { eq: { form_id: f.id } });
    const { groupSections } = await import('./fbform.js');
    const secs = groupSections(f, qs).map(s => ({ title: s.title, intro: s.intro }));
    (f.sections || []).forEach(s => { if (!secs.find(x => x.title === s.title)) secs.push(s); });
    secs.push({ title: '', intro: '' });
    const fields = secs.flatMap((s, i) => [{ k: `t${i}`, l: `חלק ${i + 1} — כותרת`, hint: i === secs.length - 1 ? 'שורה ריקה להוספת חלק חדש' : 'שינוי הכותרת מעדכן גם את השאלות של החלק' }, { k: `n${i}`, l: `חלק ${i + 1} — הנחיה (כל שורה בנפרד)`, type: 'textarea', rows: 4 }]);
    const v = await formSheet('חלקים והנחיות', fields, Object.fromEntries(secs.flatMap((s, i) => [[`t${i}`, s.title], [`n${i}`, s.intro]])), { wide: true, sub: 'הסדר כאן הוא סדר החלקים בטופס.' });
    if (!v) return;
    const next = secs.map((s, i) => ({ old: s.title, title: (v[`t${i}`] || '').trim(), intro: (v[`n${i}`] || '').trim() })).filter(s => s.title);
    await run(async () => {
      for (const s of next) if (s.old && s.old !== s.title) for (const q of qs.filter(x => (x.section || '') === s.old)) await store.update('feedback_questions', q.id, { section: s.title });
      await store.update('feedback_forms', f.id, { sections: next.map(({ title, intro }) => ({ title, intro })) });
    }, 'נשמר');
    render();
  });
  $('#fb-preview-btn')?.addEventListener('click', async () => {
    const f = await getForm(); const qs = await store.list('feedback_questions', { eq: { form_id: f.id }, order: [['sort']] });
    const { feedbackFormHTML } = await import('./fbform.js');
    const intro = String(f.intro || '').split('\n').map(l => l.trim()).filter(Boolean);
    sheet(`<div class="tag amber" style="margin-bottom:8px;white-space:normal;line-height:1.4">תצוגה מקדימה למנהלת — לא נשמר דבר</div>
      <h3>${esc(f.title)}</h3>${intro.length ? `<div class="callout ok" style="margin:10px 0 14px"><span class="mark"></span><div>${intro.map(p => `<p>${esc(p)}</p>`).join('')}</div></div>` : ''}
      ${feedbackFormHTML(f, qs, { preview: true })}<div class="btnrow" style="margin-top:12px"><button class="btn ghost" data-close>סגירת התצוגה</button></div>`, { wide: true });
  });
  $('#add-fq')?.addEventListener('click', () => editFbQuestion(null));
};
// ניווט בחלקי התצוגה המקדימה
document.addEventListener('click', async e => { if (e.target.closest('#fb-preview')) { const m = await import('./fbform.js'); m.handleStepClick(e); } });
async function editFbQuestion(id) {
  const f = await getForm();
  const qs = await store.list('feedback_questions', { eq: { form_id: f.id }, order: [['sort']] });
  const q = qs.find(x => x.id === id);
  const sections = [...new Set([...(f.sections || []).map(s => s.title), ...qs.map(x => x.section).filter(Boolean)])];
  const last = qs[qs.length - 1];
  const v = await formSheet(id ? 'עריכת שאלה' : 'שאלה חדשה', fqFields(sections),
    q ? { ...q, options: (q.options || []).map(o => o.text).join('\n') } : { qtype: 'rating5', sort: qs.length ? Math.max(...qs.map(x => x.sort)) + 1 : 0, section: last?.section || '', options: last?.qtype === 'rating5' ? last.options.map(o => o.text).join('\n') : '' },
    { onChange: (el, x) => {
      const o = $('[data-fk="options"]', el), p = $('[data-fk="placeholder"]', el);
      o.hidden = !['single', 'multi', 'rating5'].includes(x.qtype); p.hidden = !['text', 'longtext'].includes(x.qtype);
      $('label', o).textContent = x.qtype === 'rating5' ? 'תיאור כל דרגה, מ-1 עד 5 (שורה לכל דרגה, לא חובה)' : 'אפשרויות (כל אפשרות בשורה)';
    } });
  if (!v) return;
  const lines = (v.options || '').split('\n').map(s => s.trim()).filter(Boolean);
  let options = [];
  if (['single', 'multi'].includes(v.qtype)) {
    options = lines.map((text, i) => ({ id: String.fromCharCode(97 + i), text }));
    if (options.length < 2) return toast('יש להזין לפחות 2 אפשרויות', true);
  } else if (v.qtype === 'rating5') {
    if (lines.length && lines.length !== 5) return toast('לסולם הדירוג יש להזין בדיוק 5 תיאורים (או להשאיר ריק)', true);
    options = lines.map((text, i) => ({ id: String(i + 1), text }));
  }
  const row = { form_id: f.id, qtype: v.qtype, section: v.section, prompt: v.prompt, options, required: !!v.required, sort: v.sort ?? qs.length,
    placeholder: ['text', 'longtext'].includes(v.qtype) ? v.placeholder : null };
  await run(() => id ? store.update('feedback_questions', id, row) : store.insert('feedback_questions', row), 'נשמר'); render();
}

async function copyFromCohort(kind) {
  const others = cohorts.filter(c => c.id !== selCohort);
  if (!others.length) return toast('אין מחזור אחר להעתקה ממנו', true);
  const v = await formSheet(kind === 'exam' ? 'העתקת מבחן ממחזור אחר' : 'העתקת משוב ממחזור אחר',
    [{ k: 'from', l: 'להעתיק מ־', type: 'select', opts: Object.fromEntries(others.map(c => [c.id, c.name])) }], {},
    { sub: 'יועתקו ההגדרות והשאלות. תוצאות ותשובות של המחזור הקודם אינן מועתקות ואינן נמחקות. המבחן/המשוב החדש יהיה סגור עד שתפתחי אותו.', okLabel: 'העתקה' });
  if (!v) return;
  await run(async () => {
    if (kind === 'exam') {
      const [src] = await store.list('exams', { eq: { cohort_id: v.from } }); if (!src) throw new Error('במחזור שנבחר אין מבחן');
      const { id, cohort_id, created_at, is_open, results_released, ...rest } = src;
      const e = await store.insert('exams', { ...rest, cohort_id: selCohort, is_open: false, results_released: false });
      const qs = await store.list('exam_questions', { eq: { exam_id: src.id }, order: [['sort']] });
      const keys = await store.list('exam_keys', { inList: ['question_id', qs.map(q => q.id)] });
      for (const q of qs) await store.rpc('save_exam_question', { p_exam: e.id, p_id: null, p_sort: q.sort, p_qtype: q.qtype, p_prompt: q.prompt, p_options: q.options, p_points: q.points, p_correct: keys.find(k => k.question_id === q.id)?.correct ?? null });
    } else {
      const [src] = await store.list('feedback_forms', { eq: { cohort_id: v.from } }); if (!src) throw new Error('במחזור שנבחר אין משוב');
      const { id, cohort_id, created_at, is_open, ...rest } = src;
      const f = await store.insert('feedback_forms', { ...rest, cohort_id: selCohort, is_open: false });
      const qs = await store.list('feedback_questions', { eq: { form_id: src.id } });
      await store.insertMany('feedback_questions', qs.map(({ id, form_id, ...q }) => ({ ...q, form_id: f.id })));
    }
  }, 'הועתק');
  render();
}

/* ---------- results ---------- */
// הערה: פרטי הנבחנים (שם, יחידה, ת"ז) הוזנו בטופס. בדיקת ת"ז היא בדיקת תקינות בלבד — לא אימות זהות.
// ת"ז לעולם לא נשלחת בכתובת או כפרמטר סינון: כל פעולה מזוהה לפי מזהה ההגשה.
const needsServer = () => store.mode === 'demo' ? '<div class="callout warn" style="margin-bottom:14px"><span class="mark"></span><div><p>תוצאות, מבחן חוזר וטופסי סיום זמינים לאחר החיבור למסד הנתונים.</p></div></div>' : '';
const fmtScore = v => v == null ? '—' : String(Math.round(Number(v) * 10) / 10);
const statusTag = s => s === 'counted' ? '<span class="tag">נספר</span>' : s === 'over_limit' ? '<span class="tag amber">חריגה — לא נספר</span>' : '<span class="tag gray">בוטל</span>';
async function peopleOf(examId) { try { return await store.rpc('exam_people', { p_exam: examId }); } catch (e) { if (/demo_unsupported/.test(e.message)) return []; throw e; } }

VIEWS.results = async () => {
  if (!cohorts.length) return `<div class="wrap">${head('chart', 'תוצאות מבחנים')}${noCohorts()}</div>`;
  const subs = await store.list('exam_submissions', { ...(selCohort !== '*' ? { eq: { cohort_id: selCohort } } : {}), order: [['submitted_at', false]] });
  const exams = selCohort !== '*' ? await store.list('exams', { eq: { cohort_id: selCohort } }) : [];
  const people = exams[0] ? await peopleOf(exams[0].id) : [];
  let starts = []; if (exams[0]) { try { starts = await store.rpc('exam_open_starts', { p_exam: exams[0].id }); } catch { starts = []; } }
  const counted = subs.filter(s => s.status === 'counted'), graded = counted.filter(s => s.score_pct != null);
  const avg = graded.length ? fmtScore(graded.reduce((a, s) => a + Number(s.score_pct), 0) / graded.length) : '—';
  const byPerson = Object.fromEntries(people.map(p => [p.id_number, p]));
  const importedN = subs.filter(s => s.import_batch).length;
  const imp = await importPanel();
  return `<div class="wrap">${head('chart', 'תוצאות מבחנים', 'כל ניסיון נשמר בנפרד ואינו נדרס. מגבלת הניסיונות נבדקת בשרת לפי ת״ז ומחזור.')}
    ${needsServer()}
    <div class="callout" style="margin-bottom:14px"><span class="mark"></span><div><p class="small">הפרטים (שם, יחידה, ת״ז) הוזנו על ידי הנבחנים בטופס. ת״ז נבדקה לתקינות בלבד — <b>זה אינו אימות זהות</b>.
      הגשה מעבר למספר הניסיונות המותר נשמרת כ״חריגה״ ואינה נספרת. מבחן חוזר מאשרים בכפתור ״אישור מבחן חוזר״.</p></div></div>
    ${imp}
    ${importedN ? `<p class="small muted">${importedN} מתוך ${subs.length} ההגשות כאן <span class="tag gray">מיובאות</span> מהמערכת הקודמת: הציון, המועד והתשובות נשמרו כפי שנרשמו שם, בלי חישוב מחדש ובלי קביעת מעבר או ציון קובע.</p>` : ''}
    <div class="toolbar">${cohortPicker(true)}<button class="btn ghost" id="export-res" ${subs.length ? '' : 'disabled'}>${icon('download')}ייצוא ל-Excel</button></div>
    <div class="stat"><div><div class="k">הגשות</div><div class="v">${subs.length}</div></div><div><div class="k">נבחנים (לפי ת״ז)</div><div class="v">${new Set(subs.map(s => s.cohort_id + s.id_number)).size}</div></div>
      <div><div class="k">ממוצע ניסיונות שנספרו</div><div class="v">${avg}</div></div><div><div class="k">עברו (ציון קובע)</div><div class="v">${people.filter(p => p.passed).length}</div></div>
      <div><div class="k">ממתינים לבדיקה ידנית</div><div class="v">${counted.filter(s => s.needs_manual && s.manual_points == null).length}</div></div></div>
    ${subs.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>שם</th><th>יחידה</th><th>ת״ז</th>${selCohort === '*' ? '<th>מחזור</th>' : ''}<th>ניסיון</th><th>מועד</th><th>סטטוס</th><th>ציון</th><th>ציון קובע</th><th></th></tr></thead><tbody>
      ${subs.map(s => { const p = byPerson[s.id_number];
        return `<tr><td><b>${esc(s.full_name)}</b></td><td>${s.unit ? esc(s.unit) : '<span class="muted">—</span>'}</td><td><span class="ltr">${esc(s.id_number)}</span></td>${selCohort === '*' ? `<td>${esc(cohortName(s.cohort_id))}</td>` : ''}
        <td>${s.attempt_no}</td><td>${esc(fmtDateTime(s.submitted_at))}</td><td>${statusTag(s.status)}${s.import_batch ? ' <span class="tag gray">מיובא</span>' : ''} ${flagTags(s)}</td>
        <td>${s.score_pct != null ? `<b>${fmtScore(s.score_pct)}</b> ${passTag(s)}` : s.needs_manual ? '<span class="tag amber">לבדיקה</span>' : '—'}</td>
        <td>${s.import_batch ? '<span class="muted" title="מבחן היסטורי — לא נקבע ציון קובע">—</span>' : p ? (p.pending ? 'ממתין' : `${fmtScore(p.final_score)} ${p.passed ? '✓' : ''}`) : '—'}</td>
        <td><button class="btn ghost sm" data-sub="${s.id}">פרטים</button></td></tr>`; }).join('')}</tbody></table></div>` : '<div class="empty"><b>אין עדיין הגשות</b></div>'}
    ${starts.length ? `<div class="sect-title">ניסיונות שהתחילו ולא הוגשו (${starts.length})</div>
    <p class="small muted">״בתהליך״ = הנבחן/ת עדיין יכול/ה להגיש. ״נסגר לפני הגשה״ = המבחן נסגר מיד; התשובות שנשמרו אוטומטית עד הסגירה מופיעות כאן ואינן נספרות כהגשה.</p>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>שם</th><th>יחידה</th><th>ת״ז</th><th>התחלה</th><th>מצב</th><th>שאלות שנענו</th><th>שמירה אחרונה</th></tr></thead><tbody>
      ${starts.map(t => `<tr><td><b>${esc(t.full_name)}</b></td><td>${esc(t.unit)}</td><td><span class="ltr">${esc(t.id_number)}</span></td><td>${esc(fmtDateTime(t.started_at))}</td>
        <td>${t.status === 'started' ? '<span class="tag amber">בתהליך</span>' : '<span class="tag gray">נסגר לפני הגשה</span>'}</td><td>${t.answered}</td><td>${t.draft_saved_at ? esc(fmtDateTime(t.draft_saved_at)) : '—'}</td></tr>`).join('')}</tbody></table></div>` : ''}</div>`;
};
// אצוות ייבוא: סיכום, רשומות שלא יובאו, וביטול אצווה (מנהלת בלבד)
const OUTCOME_HE = { skipped_test: 'רשומת בדיקה / הוחרגה', skipped_duplicate: 'כפילות זהה', skipped_pending: 'ממתין להחלטה על שיוך' };
async function importPanel() {
  let batches = []; try { batches = await store.list('import_batches', { order: [['created_at', false]] }); } catch { return ''; }
  if (!batches.length) return '';
  const out = [];
  for (const b of batches) {
    const recs = await store.list('import_records', { eq: { batch_id: b.id }, order: [['source_entity'], ['outcome']] });
    const notIn = recs.filter(r => OUTCOME_HE[r.outcome]);
    const cnt = k => recs.filter(r => r.outcome === k).length;
    out.push(`<details class="card pad" style="margin-bottom:14px"><summary><b>היסטוריה מיובאת</b> · ${esc(b.source)} · ${esc(fmtDateTime(b.created_at))}
      · יובאו ${cnt('imported')} רשומות · לא יובאו ${notIn.length}</summary>
      <p class="small muted" style="margin-top:8px">אצווה <span class="ltr">${esc(b.id)}</span>. כל רשומה מיובאת מסומנת ״מיובא״ ונושאת את מזהה המקור שלה. הרצה חוזרת אינה יוצרת כפילויות.</p>
      ${notIn.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>סוג</th><th>מועד</th><th>שם (כפי שנרשם)</th><th>סיבה</th></tr></thead><tbody>
        ${notIn.map(r => { const p = r.payload || {}; return `<tr><td>${r.source_entity === 'TestResult' ? 'ניסיון מבחן' : r.source_entity === 'Feedback' ? 'משוב (אנונימי)' : esc(r.source_entity)}</td>
          <td>${esc(fmtDateTime(p.completedAt || p.submittedAt || ''))}</td><td>${r.source_entity === 'TestResult' ? esc(`${p.firstName || ''} ${p.lastName || ''}`) : '—'}</td>
          <td>${esc(OUTCOME_HE[r.outcome])}</td></tr>`; }).join('')}</tbody></table></div>` : ''}
      <div class="btnrow" style="margin-top:10px"><button class="btn danger sm" data-undo-import="${esc(b.id)}">ביטול אצוות הייבוא</button>
      <span class="small muted">מוחק רק את מה שנוצר בייבוא הזה. לא ניתן אם נוספו נתונים אחרים למחזורים שנוצרו בו.</span></div></details>`);
  }
  return out.join('');
}
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-undo-import]'); if (!b) return;
  const v = await formSheet('ביטול אצוות ייבוא', [{ k: 'confirm', l: 'להמשך יש להקליד: ביטול', req: true }], {},
    { sub: 'כל המחזורים, המבחנים, ההגשות והמשובים שנוצרו בייבוא הזה יימחקו. נתונים שהוספת בעצמך לא יימחקו. הגיבוי הפרטי נשמר.', okLabel: 'ביטול הייבוא' });
  if (!v) return;
  if (v.confirm !== 'ביטול') return toast('לא בוצע — יש להקליד ״ביטול״', true);
  await run(() => store.rpc('import_undo', { p_batch: b.dataset.undoImport }), 'הייבוא בוטל');
  await loadCohorts(); render();
});

BIND.results = () => {
  $('#export-res')?.addEventListener('click', async () => {
    const subs = await store.list('exam_submissions', { ...(selCohort !== '*' ? { eq: { cohort_id: selCohort } } : {}), order: [['cohort_id'], ['full_name'], ['attempt_no']] });
    const examIds = [...new Set(subs.map(s => s.exam_id))];
    const qs = await store.list('exam_questions', { inList: ['exam_id', examIds], order: [['sort']] });
    const single = examIds.length === 1;
    const people = single ? Object.fromEntries((await peopleOf(examIds[0])).map(p => [p.id_number, p])) : {};
    const ansText = (q, a) => a == null ? '' : q.qtype === 'truefalse' ? (a === 'true' ? 'נכון' : 'לא נכון') : Array.isArray(a) ? a.map(x => q.options.find(o => o.id === x)?.text || x).join(' | ') : (q.options?.find(o => o.id === a)?.text || a);
    const header = ['מחזור', 'שם (כפי שהוזן)', 'יחידה', 'ת״ז (נבדקה לתקינות, לא אומתה)', 'ניסיון', 'סטטוס', 'מועד הגשה', 'ציון הניסיון', 'עבר בניסיון', 'ציון קובע', 'עבר (ציון קובע)', 'קוד אישור', 'נקודות אוטומטיות', 'נקודות ידניות', 'סה״כ נקודות', 'מקור', 'סימונים לבדיקה', 'משך (דקות)', ...(single ? qs.map((q, i) => `ש${i + 1}: ${q.prompt}`) : [])];
    const rows = subs.map(s => { const p = people[s.id_number];
      return [cohortName(s.cohort_id), s.full_name, s.unit, s.id_number, s.attempt_no, STATUS[s.status], fmtDateTime(s.submitted_at),
        s.score_pct ?? (s.needs_manual ? 'ממתין לבדיקה' : ''), s.passed === true ? 'כן' : s.passed === false ? 'לא' : '',
        p ? (p.pending ? 'ממתין' : p.final_score ?? '') : '', p ? (p.passed === true ? 'כן' : p.passed === false ? 'לא' : '') : '',
        s.receipt, s.auto_points, s.manual_points ?? '', s.total_points, s.import_batch ? 'מיובא מהמערכת הקודמת' : 'הגשה באתר',
        (s.review_flags || []).map(f => FLAG_HE[f] || f).join('; '), s.time_spent_sec != null ? Math.round(s.time_spent_sec / 6) / 10 : '', ...(single ? qs.map(q => ansText(q, s.answers?.[q.id])) : [])]; });
    await downloadXLSX(`תוצאות מבחן - ${selCohort === '*' ? 'כל המחזורים' : cohortName(selCohort)}.xlsx`, 'תוצאות', header, rows, [3, 11]);
  });
};
async function showSubmission(id) {
  const [s] = await store.list('exam_submissions', { eq: { id } });
  const qs = await store.list('exam_questions', { eq: { exam_id: s.exam_id }, order: [['sort']] });
  const keys = await store.list('exam_keys', { inList: ['question_id', qs.map(q => q.id)] });
  const p = (await peopleOf(s.exam_id)).find(x => x.id_number === s.id_number);
  const show = (q, a) => a == null ? '<span class="muted">לא נענתה</span>' : q.qtype === 'truefalse' ? (a === 'true' ? 'נכון' : 'לא נכון') : Array.isArray(a) ? a.map(x => esc(q.options.find(o => o.id === x)?.text || x)).join('<br>') : esc(q.options?.find(o => o.id === a)?.text || a);
  const openPts = qs.filter(q => q.qtype === 'open' || !keys.find(k => k.question_id === q.id)).reduce((t, q) => t + Number(q.points), 0);
  const el = sheet(`<h3>${esc(s.full_name)} · ניסיון ${s.attempt_no}</h3>
    ${s.import_batch ? `<div class="callout" style="margin:6px 0 10px"><span class="mark"></span><div><p class="small"><b>מיובא מהמערכת הקודמת.</b> הציון, המועד והתשובות נשמרו כפי שנרשמו שם${s.time_spent_sec != null ? ` · משך: ${Math.floor(s.time_spent_sec / 60)}:${String(s.time_spent_sec % 60).padStart(2, '0')}` : ''}. מספר הניסיון חושב לפי סדר ההגשות.</p>${flagTags(s) ? `<p>${flagTags(s)}</p>` : ''}</div></div>` : ''}
    <p class="sub">יחידה: ${s.unit ? esc(s.unit) : '—'} · ת״ז <span class="ltr">${esc(s.id_number)}</span> · ${esc(fmtDateTime(s.submitted_at))}<br>
    <span class="small">הפרטים הוזנו בטופס; ת״ז נבדקה לתקינות בלבד ואינה אימות זהות. קוד אישור <span class="ltr">${esc(s.receipt)}</span></span></p>
    <div class="stat"><div><div class="k">סטטוס</div><div class="v" style="font-size:1rem">${STATUS[s.status]}</div></div><div><div class="k">ציון הניסיון</div><div class="v">${fmtScore(s.score_pct)}</div></div>
      ${p && !s.import_batch ? `<div><div class="k">ציון קובע</div><div class="v">${p.pending ? 'ממתין' : fmtScore(p.final_score)}</div></div><div><div class="k">ניסיונות שנספרו / מותרים</div><div class="v">${p.attempts} / ${p.allowed}</div></div>` : ''}</div>
    <div class="btnrow" style="margin-bottom:10px">
      ${p && p.passed !== true && !s.import_batch ? `<button class="btn solid sm" data-retake>אישור מבחן חוזר</button>` : ''}
      ${s.status !== 'voided' ? '<button class="btn danger sm" data-status="voided">ביטול הניסיון</button>' : ''}
      ${s.status !== 'counted' ? '<button class="btn ghost sm" data-status="counted">ספירת הניסיון</button>' : ''}</div>
    ${s.status_note ? `<p class="small muted">הערה: ${esc(s.status_note)}</p>` : ''}
    ${qs.map((q, i) => { const k = keys.find(x => x.question_id === q.id)?.correct; return `<div class="q"><div class="qn">שאלה ${i + 1} · ${q.points} נק׳</div><div class="qp">${esc(q.prompt)}</div>
      <div>${show(q, s.answers?.[q.id])}</div>${k != null ? `<div class="small muted" style="margin-top:4px">תשובה נכונה: ${show(q, q.qtype === 'short' ? k.join(' / ') : k)}</div>` : ''}</div>`; }).join('')}
    ${s.needs_manual ? `<form id="grade" class="card pad" style="box-shadow:none;margin-top:12px"><div class="field"><label for="mp">ניקוד ידני לשאלות הפתוחות (מתוך ${openPts})</label>
      <input class="input" id="mp" type="number" min="0" max="${openPts}" step="0.5" value="${s.manual_points ?? ''}" required></div><button class="btn solid" type="submit">שמירת ניקוד</button></form>` : ''}
    <div class="btnrow" style="margin-top:14px"><button class="btn ghost" data-close>סגירה</button></div>`, { wide: true });
  $('#grade', el)?.addEventListener('submit', async e => {
    e.preventDefault(); const pts = Number($('#mp', el).value);
    if (!(pts >= 0 && pts <= openPts)) return toast(`הניקוד צריך להיות בין 0 ל-${openPts}`, true);
    await run(() => store.rpc('grade_manual', { p_submission: s.id, p_points: pts }), 'הניקוד נשמר'); el.close(); render();
  });
  $('[data-retake]', el)?.addEventListener('click', async () => {
    const v = await formSheet('אישור מבחן חוזר', [{ k: 'note', l: 'הערה (לא חובה)' }], {}, { sub: `${esc(s.full_name)} יוכל/תוכל להגיש ניסיון נוסף אחד. הניסיונות הקודמים נשמרים.`, okLabel: 'אישור' });
    if (!v) return;
    await run(() => store.rpc('grant_retake', { p_submission: s.id, p_note: v.note }), 'מבחן חוזר אושר'); el.close(); render();
  });
  $$('[data-status]', el).forEach(b => b.addEventListener('click', async () => {
    const st = b.dataset.status;
    const v = await formSheet(st === 'voided' ? 'ביטול הניסיון' : 'ספירת הניסיון', [{ k: 'note', l: 'סיבה / הערה' }], {},
      { sub: st === 'voided' ? 'הניסיון יישמר אך לא ייספר לציון ולמגבלת הניסיונות.' : 'הניסיון ייספר לציון ולמגבלת הניסיונות.', okLabel: 'אישור' });
    if (!v) return;
    await run(() => store.rpc('set_submission_status', { p_submission: s.id, p_status: st, p_note: v.note }), 'עודכן'); el.close(); render();
  }));
}

/* ---------- certificates ---------- */
async function certSettings() {
  const rows = await store.list('private_assets');
  const g = k => rows.find(r => r.key === k)?.value || {};
  return { settings: g('cert_settings'), signature: g('signature') };
}
VIEWS.certs = async () => {
  if (!cohorts.length || selCohort === '*') return `<div class="wrap">${head('award', 'טופסי סיום')}${noCohorts()}</div>`;
  const c = cohorts.find(x => x.id === selCohort);
  const [exam] = await store.list('exams', { eq: { cohort_id: selCohort } });
  const { settings, signature } = await certSettings();
  const people = exam ? await peopleOf(exam.id) : [];
  const eligible = people.filter(p => p.passed && !p.cert);
  const certState = p => {
    if (!p.cert) return p.passed ? '<span class="tag amber">זכאי/ת — טרם אושר</span>' : '<span class="tag gray">אין זכאות</span>';
    const outdated = !p.passed || Number(p.cert.final_score) !== Number(p.final_score);
    return `<span class="tag ok">הופק · גרסה ${p.cert.version}</span> ${outdated ? '<span class="tag wine">הציון השתנה מאז ההפקה</span>' : ''}`;
  };
  return `<div class="wrap">${head('award', 'טופסי סיום', 'טופס מופק רק אחרי אישורך, ורק למי שעבר לפי הציון הקובע. המשתתף/ת רואה אותו עם קוד האישור של הניסיון הקובע.')}
    ${needsServer()}<div class="toolbar">${cohortPicker()}</div>
    <div class="card pad" style="margin-bottom:16px"><div class="sect-title" style="margin-top:0">פרטי הטופס</div>
      <div class="formgrid">
        <div class="field"><span class="lbl">שם הקורס</span><div>${esc(settings.course_title || 'קורס קציני משא״ן ע״צ')}</div></div>
        <div class="field"><span class="lbl">מחזור ותאריכים</span><div>${esc(c.name)} · ${c.start_date ? esc(fmtRange(c.start_date, c.end_date)) : '<span class="req">אין תאריכים</span>'}</div></div>
        <div class="field"><span class="lbl">חותמת</span><div>${settings.signer_name ? esc(settings.signer_name) + ' · ' + esc(settings.signer_title || '') : '<span class="req">לא הוגדר</span>'}</div></div>
        <div class="field"><span class="lbl">קובץ חתימה</span><div>${signature.data_uri ? `<img src="${esc(signature.data_uri)}" alt="חתימה" style="max-height:44px;background:#fff;border:1px solid var(--line);border-radius:6px;padding:2px">` : '<span class="req">טרם הועלה — בטופס יופיע קו ריק לחתימה ידנית</span>'}</div></div>
      </div>
      <div class="btnrow"><button class="btn ghost sm" id="cert-settings">${icon('settings')}עריכת פרטי החותמת והחתימה</button><button class="btn solid sm" id="cert-sample">תצוגה מקדימה (דוגמה)</button></div></div>
    ${!exam ? '<div class="empty"><b>לא הוגדר מבחן למחזור הזה</b>טופס הסיום מבוסס על הציון הקובע במבחן.</div>' : `
    <div class="btnrow" style="margin-bottom:12px"><button class="btn solid" id="cert-all" ${eligible.length ? '' : 'disabled'}>אישור והפקה לכל הזכאים (${eligible.length})</button>
      <button class="btn ghost" id="cert-all-pdf" ${people.some(p => p.cert) ? '' : 'disabled'}>${icon('download')}הורדת כל הטפסים בתוקף (PDF אחד)</button></div>
    ${people.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>שם</th><th>יחידה</th><th>ציון קובע</th><th>מצב</th><th>טופס</th><th></th></tr></thead><tbody>
      ${people.map(p => `<tr><td><b>${esc(p.full_name)}</b></td><td>${esc(p.unit)}</td><td>${p.pending ? 'ממתין' : fmtScore(p.final_score)}</td>
        <td>${p.passed ? '<span class="tag ok">עבר/ה</span>' : p.pending ? '<span class="tag amber">ממתין</span>' : '<span class="tag wine">לא עבר/ה</span>'}</td><td>${certState(p)}</td>
        <td><div class="btnrow">${p.passed && !p.cert ? `<button class="btn ghost sm" data-cert-preview="${p.deciding_sub}">תצוגה</button><button class="btn solid sm" data-cert-issue="${p.deciding_sub}">אישור והפקה</button>` : ''}
          ${p.cert ? `<button class="btn ghost sm" data-cert-pdf="${p.cert.id}">${icon('download')}PDF</button><button class="btn danger sm" data-cert-revoke="${p.cert.id}">ביטול</button>` : ''}</div></td></tr>`).join('')}
      </tbody></table></div>` : '<div class="empty"><b>אין עדיין נבחנים</b></div>'}`}
    <p class="small muted" style="margin-top:14px">החתימה בטופס היא תמונה של חתימה בכתב יד — לא חתימה דיגיטלית מאומתת. ת״ז אינה מודפסת בטופס, אלא אם בוחרים בכך בעת ההפקה.</p></div>`;
};
async function previewSheet(d, watermark, title) {
  const { mountPreview } = await import('./cert.js');
  const el = sheet(`<h3>${esc(title)}</h3><div id="cprev" style="margin:10px 0 14px"></div><div class="btnrow"><button class="btn ghost" data-close>סגירה</button></div>`, { wide: true });
  mountPreview($('#cprev', el), d, { watermark });
}
function sampleData(c, settings, signature, extra = {}) {
  return { full_name: 'שם המשתתף/ת', final_score: null, cohort_name: c.name, start_date: c.start_date, end_date: c.end_date,
    course_title: settings.course_title || 'קורס קציני משא״ן ע״צ', signer_name: settings.signer_name, signer_title: settings.signer_title,
    signature: signature.data_uri, ...extra };
}
BIND.certs = () => {
  const c = cohorts.find(x => x.id === selCohort);
  $('#cert-sample')?.addEventListener('click', async () => { const { settings, signature } = await certSettings(); previewSheet(sampleData(c, settings, signature), 'דוגמה', 'תצוגה מקדימה של טופס הסיום'); });
  $('#cert-settings')?.addEventListener('click', async () => {
    const { settings, signature } = await certSettings();
    const v = await formSheet('פרטי החותמת והחתימה', [
      { k: 'course_title', l: 'שם הקורס בטופס', req: true },
      { k: 'signer_name', l: 'שם החותמת', req: true },
      { k: 'signer_title', l: 'תפקיד החותמת', req: true },
      { k: 'sig', l: 'קובץ חתימה בכתב יד (PNG או JPG, עד 500KB, רצוי רקע שקוף או לבן)', type: 'file', accept: '.png,.jpg,.jpeg' },
      { k: 'remove_sig', l: 'להסיר את קובץ החתימה הקיים', type: 'checkbox' },
    ], { course_title: settings.course_title || 'קורס קציני משא״ן ע״צ', signer_name: settings.signer_name, signer_title: settings.signer_title },
    { sub: 'הפרטים וקובץ החתימה נשמרים בטבלה פרטית במסד הנתונים — לא באתר הציבורי ולא ב-GitHub.' });
    if (!v) return;
    if (v.sig && v.sig.size > 500 * 1024) return toast('קובץ החתימה גדול מ-500KB', true);
    if (v.sig && !/^image\/(png|jpeg)$/.test(v.sig.type)) return toast('יש להעלות PNG או JPG', true);
    await run(async () => {
      const now = new Date().toISOString();
      await store.upsert('private_assets', { key: 'cert_settings', value: { course_title: v.course_title, signer_name: v.signer_name, signer_title: v.signer_title }, updated_at: now }, 'key');
      if (v.sig) {
        const data_uri = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(v.sig); });
        await store.upsert('private_assets', { key: 'signature', value: { data_uri, file_name: v.sig.name, uploaded_at: now }, updated_at: now }, 'key');
      } else if (v.remove_sig) await store.upsert('private_assets', { key: 'signature', value: {}, updated_at: now }, 'key');
    }, 'נשמר');
    render();
  });
  $('#cert-all')?.addEventListener('click', async () => {
    const v = await formSheet('אישור והפקה לכל הזכאים', [{ k: 'show_id', l: 'להדפיס ת״ז בטופס', type: 'checkbox', hint: 'ברירת המחדל: לא.' }], {},
      { sub: 'יופקו טפסים לכל מי שעבר לפי הציון הקובע ואין לו טופס בתוקף. מי שנכשל או ממתין לבדיקה — לא יקבל טופס.', okLabel: 'אישור והפקה' });
    if (!v) return;
    const [exam] = await store.list('exams', { eq: { cohort_id: selCohort } });
    const n = await run(() => store.rpc('issue_all_certificates', { p_exam: exam.id, p_show_id: !!v.show_id }));
    toast(`הופקו ${n} טפסים`); render();
  });
  $('#cert-all-pdf')?.addEventListener('click', async e => {
    const b = e.currentTarget; b.disabled = true;
    try {
      const [exam] = await store.list('exams', { eq: { cohort_id: selCohort } });
      const people = (await peopleOf(exam.id)).filter(p => p.cert);
      const list = []; for (const p of people) list.push(await store.rpc('admin_certificate', { p_cert: p.cert.id }));
      const m = await import('./cert.js'); await m.downloadPDF(list, `טופסי סיום - ${c.name}.pdf`);
    } catch (err) { toast(errText(err), true); } finally { b.disabled = false; }
  });
};
document.addEventListener('click', async e => {
  const t = e.target.closest('[data-cert-preview],[data-cert-issue],[data-cert-pdf],[data-cert-revoke]'); if (!t) return;
  const d = t.dataset, c = cohorts.find(x => x.id === selCohort);
  const [exam] = await store.list('exams', { eq: { cohort_id: selCohort } });
  const subKey = d.certPreview || d.certIssue, certKey = d.certPdf || d.certRevoke;
  const p = (await peopleOf(exam.id)).find(x => (subKey && x.deciding_sub === subKey) || (certKey && x.cert?.id === certKey));
  if (!p) return toast("הרשומה לא נמצאה. רעננו את הדף.", true);
  if (d.certPreview) {
    const { settings, signature } = await certSettings();
    return previewSheet(sampleData(c, settings, signature, { full_name: p.full_name, final_score: p.final_score }), 'טיוטה', `תצוגה לפני אישור · ${p.full_name}`);
  }
  if (d.certIssue) {
    const v = await formSheet(`אישור זכאות והפקה · ${p.full_name}`, [{ k: 'show_id', l: 'להדפיס ת״ז בטופס', type: 'checkbox', hint: 'ברירת המחדל: לא.' }], {},
      { sub: `ציון קובע: ${fmtScore(p.final_score)}. אחרי האישור הטופס יהיה זמין למשתתף/ת עם קוד האישור האישי.`, okLabel: 'אישור והפקה' });
    if (!v) return;
    await run(() => store.rpc('issue_certificate', { p_submission: d.certIssue, p_show_id: !!v.show_id }), 'הטופס הופק'); return render();
  }
  if (d.certPdf) {
    t.disabled = true;
    try { const cd = await store.rpc('admin_certificate', { p_cert: d.certPdf }); const m = await import('./cert.js'); await m.downloadPDF([cd], m.certFileName(cd)); }
    catch (err) { toast(errText(err), true); } finally { t.disabled = false; }
    return;
  }
  if (d.certRevoke) {
    const v = await formSheet(`ביטול טופס · ${p.full_name}`, [{ k: 'reason', l: 'סיבת הביטול', req: true }], {},
      { sub: 'הטופס יסומן כמבוטל, לא יהיה זמין למשתתף/ת, וההיסטוריה תישמר. אחרי הביטול אפשר להפיק גרסה מעודכנת.', okLabel: 'ביטול הטופס' });
    if (!v) return;
    await run(() => store.rpc('revoke_certificate', { p_cert: d.certRevoke, p_reason: v.reason }), 'הטופס בוטל'); render();
  }
});


/* ---------- feedback summary ---------- */
VIEWS.fbsummary = async () => {
  if (!cohorts.length) return `<div class="wrap">${head('chart', 'סיכום משובים')}${noCohorts()}</div>`;
  const f = await getForm();
  const top = `<div class="wrap">${head('chart', 'סיכום משובים')}<div class="toolbar">${cohortPicker()}${f ? `<button class="btn ghost" id="export-fb">${icon('download')}ייצוא ל-Excel</button>` : ''}</div>`;
  if (!f) return top + '<div class="empty"><b>לא הוגדר משוב למחזור הזה</b></div></div>';
  const [qs, rs] = await Promise.all([store.list('feedback_questions', { eq: { form_id: f.id }, order: [['sort']] }), store.list('feedback_responses', { eq: { form_id: f.id } })]);
  const blocks = qs.map((q, i) => {
    const vals = rs.map(r => r.answers?.[q.id]).filter(v => v != null && v !== '');
    let body = '';
    if (q.qtype === 'rating5') {
      const avg = vals.length ? (vals.reduce((a, b) => a + Number(b), 0) / vals.length).toFixed(2) : '—';
      body = `<p><b>ממוצע: ${avg}</b> <span class="muted small">(${vals.length} עונים)</span></p><table class="tbl">${[5, 4, 3, 2, 1].map(n => { const c = vals.filter(v => Number(v) === n).length; return `<tr><td style="width:40px">${n}</td><td><div class="bar"><i style="width:${vals.length ? c / vals.length * 100 : 0}%"></i></div></td><td class="n" style="width:50px">${c}</td></tr>`; }).join('')}</table>`;
    } else if (q.qtype === 'single' || q.qtype === 'multi') {
      const flat = vals.flat();
      body = `<table class="tbl">${(q.options || []).map(o => { const c = flat.filter(v => v === o.id).length; return `<tr><td>${esc(o.text)}</td><td style="width:40%"><div class="bar"><i style="width:${vals.length ? c / vals.length * 100 : 0}%"></i></div></td><td class="n" style="width:50px">${c}</td></tr>`; }).join('')}</table>`;
    } else {
      body = vals.length ? `<ul style="margin:0;padding-inline-start:20px">${rs.filter(r => r.answers?.[q.id]).map(r => `<li style="margin-bottom:6px">${esc(r.answers[q.id])}${!f.anonymous && r.full_name ? ` <span class="small muted">— ${esc(r.full_name)}</span>` : ''}</li>`).join('')}</ul>` : '<p class="muted">אין תשובות</p>';
    }
    return `<div class="card pad" style="margin-bottom:12px"><div class="qn" style="font-size:.78rem;font-weight:800;color:var(--blue)">${i + 1}${q.section ? ' · ' + esc(q.section) : ''}</div><h3 style="font-size:1.05rem;color:var(--deep);margin-bottom:10px">${esc(q.prompt)}</h3>${body}</div>`;
  }).join('');
  return top + `<div class="stat"><div><div class="k">משובים שהתקבלו</div><div class="v">${rs.length}</div></div><div><div class="k">סוג</div><div class="v" style="font-size:1rem">${f.anonymous ? 'אנונימי' : 'מזוהה'}</div></div></div>${blocks || '<div class="empty"><b>אין שאלות</b></div>'}</div>`;
};
BIND.fbsummary = () => {
  $('#export-fb')?.addEventListener('click', async () => {
    const f = await getForm();
    const [qs, rs] = await Promise.all([store.list('feedback_questions', { eq: { form_id: f.id }, order: [['sort']] }), store.list('feedback_responses', { eq: { form_id: f.id } })]);
    const txt = (q, a) => a == null ? '' : Array.isArray(a) ? a.map(x => q.options.find(o => o.id === x)?.text || x).join(' | ') : (q.options?.find(o => o.id === a)?.text ?? a);
    const header = ['מחזור', ...(f.anonymous ? [] : ['שם']), 'תאריך', ...qs.map(q => (q.section ? q.section + ' – ' : '') + q.prompt)];
    const rows = rs.map(r => [cohortName(f.cohort_id), ...(f.anonymous ? [] : [r.full_name || '']), fmtDate(r.submitted_on), ...qs.map(q => txt(q, r.answers?.[q.id]))]);
    await downloadXLSX(`משובים - ${cohortName(f.cohort_id)}.xlsx`, 'משובים', header, rows);
  });
};

/* ================= delegated actions ================= */
document.addEventListener('click', async e => {
  const t = e.target.closest('button,a'); if (!t) return;
  const d = t.dataset;
  if (d.act === 'logout') { await store.signOut(); location.hash = ''; boot(); return; }
  if (d.act === 'reset-demo') { e.preventDefault(); if (await confirmBox('לאפס את נתוני ההדגמה לנתוני ההתחלה?', 'איפוס', true)) { store.resetDemo(); location.reload(); } return; }
  if (d.activate) { await run(() => store.rpc('set_active_cohort', { p_cohort: d.activate }), 'המחזור הפעיל עודכן'); await loadCohorts(); render(); }
  if (d.editCohort) {
    const c = cohorts.find(x => x.id === d.editCohort);
    const v = await formSheet('עריכת מחזור', cohortFields(false), c); if (!v) return;
    await run(() => store.update('cohorts', c.id, { name: v.name, start_date: v.start_date, end_date: v.end_date }), 'נשמר');
    await loadCohorts(); render();
  }
  if (d.delCohort) {
    const c = cohorts.find(x => x.id === d.delCohort);
    const subs = await store.list('exam_submissions', { eq: { cohort_id: c.id } });
    const v = await formSheet(`מחיקת ${c.name}`, [{ k: 'confirm', l: `להקליד את שם המחזור לאישור: ${c.name}`, req: true }], {},
      { sub: `<b class="req">פעולה בלתי הפיכה.</b> יימחקו הלו״ז, ${subs.length} הגשות מבחן וכל המשובים של המחזור. מומלץ לייצא תוצאות לפני כן.`, okLabel: 'מחיקה לצמיתות' });
    if (!v) return; if (v.confirm !== c.name) return toast('השם אינו תואם — לא נמחק', true);
    await run(() => store.remove('cohorts', c.id), 'נמחק'); await loadCohorts(); render();
  }
  if (d.editSlot || d.dupSlot) {
    const items = await store.list('schedule_items', { eq: { cohort_id: selCohort } });
    const r = items.find(x => x.id === (d.editSlot || d.dupSlot));
    const { opts } = await presentationOptions();
    const v = await formSheet(d.editSlot ? 'עריכת שורה' : 'שכפול שורה', slotFields([...new Set(items.map(x => x.block).filter(Boolean))], opts), { ...r, start_time: hm(r.start_time), end_time: hm(r.end_time), resource_id: r.resource_id || '' });
    if (!v) return;
    await run(() => d.editSlot ? store.update('schedule_items', r.id, slotRow(v)) : store.insert('schedule_items', { ...slotRow(v), cohort_id: selCohort, sort: r.sort }), 'נשמר'); render();
  }
  if (d.presSlot) {
    const [r] = await store.list('schedule_items', { eq: { id: d.presSlot } });
    const { opts, list } = await presentationOptions();
    if (!list.length) return toast('עדיין לא הועלו מצגות. יש להעלות מצגת במסך ״חומרים וקישורים״.', true);
    const v = await formSheet(`מצגת לשיעור: ${r.topic}`, [{ k: 'resource_id', l: 'מצגת', type: 'select', opts }], { resource_id: r.resource_id || '' },
      { sub: 'באתר יופיע ליד השיעור אייקון שפותח את המצגת. בחירת ״ללא מצגת״ מסירה את השיוך.' });
    if (!v) return;
    await run(() => store.update('schedule_items', r.id, { resource_id: v.resource_id || null }), v.resource_id ? 'המצגת שויכה לשיעור' : 'השיוך הוסר'); render();
  }
  if (d.delSlot && await confirmBox('למחוק את השורה מהלו״ז?', 'מחיקה', true)) { await run(() => store.remove('schedule_items', d.delSlot), 'נמחק'); render(); }
  if (d.editRes) {
    const [r] = await store.list('resources', { eq: { id: d.editRes } });
    const fields = resFields(r.section).filter(f => f.k !== 'file');
    const v = await formSheet('עריכת פריט', fields, { ...r, cohort_id: r.cohort_id || '' }, { onChange: kindToggle }); if (!v) return;
    v.cohort_id ||= null; v.updated_at = new Date().toISOString();
    await run(() => store.update('resources', r.id, v), 'נשמר'); render();
  }
  if (d.upload) {
    const [r] = await store.list('resources', { eq: { id: d.upload } });
    const v = await formSheet(r.storage_path ? 'החלפת קובץ' : 'העלאת קובץ', [{ k: 'file', l: 'קובץ', type: 'file', accept: acceptFor(r.section), hint: `סוגים: ${extsFor(r.section).join(', ')} · עד ${MAX_MB}MB` }], {},
      { sub: `${esc(r.title)}. הקובץ יהיה פתוח לכל מי שנכנס לאתר. הקובץ הקודם יוחלף, העמוד באתר לא משתנה.`, okLabel: 'העלאה' });
    if (!v?.file) return;
    const bad = checkFile(r.section, v.file); if (bad) return failBox(bad);
    try { await uploadFor(r, v.file); toast('הקובץ הוחלף ונשמר'); } catch (e) { failBox(e.message); } render();
  }
  if (d.delRes) {
    const [r] = await store.list('resources', { eq: { id: d.delRes } });
    if (!(await confirmBox(`למחוק את "${r.title}" מהאתר?${r.storage_path ? ' גם הקובץ שהועלה יימחק מהאחסון.' : ''}`, 'מחיקה', true))) return;
    await run(async () => { await store.remove('resources', r.id); if (r.storage_path) await store.removeFile(r.storage_path).catch(() => {}); }, 'נמחק'); render();
  }
  if (d.editTerm) { const [t0] = await store.list('glossary_terms', { eq: { id: d.editTerm } }); const v = await formSheet('עריכת מונח', termFields, t0); if (!v) return; await run(() => store.update('glossary_terms', t0.id, v), 'נשמר'); render(); }
  if (d.delTerm && await confirmBox('למחוק את המונח?', 'מחיקה', true)) { await run(() => store.remove('glossary_terms', d.delTerm), 'נמחק'); render(); }
  if (d.editQ) editExamQuestion(d.editQ);
  if (d.delQ && await confirmBox('למחוק את השאלה? (הגשות קודמות נשמרות)', 'מחיקה', true)) { await run(() => store.remove('exam_questions', d.delQ), 'נמחק'); render(); }
  if (d.editFq) editFbQuestion(d.editFq);
  if (d.delFq && await confirmBox('למחוק את השאלה?', 'מחיקה', true)) { await run(() => store.remove('feedback_questions', d.delFq), 'נמחק'); render(); }
  if (d.sub) showSubmission(d.sub);
});
