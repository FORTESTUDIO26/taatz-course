import { createStore, errText } from './store.js';
import { installHTML, handleInstallClick } from './install.js';
import { esc, $, $$, icon, toast, confirmBox, safeUrl, todayISO, nowHM, fmtDayLong, fmtWeekday, fmtDM, hm, fmtRange, fmtDateTime,
  blockClass, isBreak, FOOTER_TEXT, demoBanner, normIlId } from './ui.js';

const SECTIONS = {
  presentations:   { title: 'מצגות הקורס', icon: 'slides', lede: 'המצגות שהוצגו בשיעורי הקורס.' },
  course_booklets: { title: 'חוברות הקורס', icon: 'booklet', lede: 'חוברות הלימוד של הקורס.' },
  info_booklets:   { title: 'חוברות מידע', icon: 'info', lede: 'חוברות מידע וחומרי עזר לעבודה השוטפת.' },
  book:            { title: 'ספר קצין משא״ן ע״צ', icon: 'book', lede: 'הספר המקצועי של קצין משא״ן ע״צ.' },
  podcasts:        { title: 'פודקאסטים', icon: 'mic', lede: 'פרקי הפודקאסט של הקורס.' },
};
const NAV = [
  { group: null, items: [{ r: '', t: 'דף הבית', i: 'home' }] },
  { group: 'הקורס', items: [
    { r: 'schedule', t: 'לו״ז הקורס', i: 'calendar', d: 'ימים, שעות, נושאים, מרצים ומיקום' },
    { r: 'presentations', t: 'מצגות', i: 'slides', d: 'מצגות השיעורים' },
    { r: 'course-booklets', t: 'חוברות הקורס', i: 'booklet', d: 'חוברות הלימוד' },
    { r: 'info-booklets', t: 'חוברות מידע', i: 'info', d: 'חומרי עזר לעבודה' },
    { r: 'book', t: 'ספר קצין משא״ן ע״צ', i: 'book', d: 'הספר המקצועי' },
    { r: 'podcasts', t: 'פודקאסטים', i: 'mic', d: 'פרקים להאזנה' },
    { r: 'glossary', t: 'מילון מונחים', i: 'glossary', d: 'מונחים ומושגים מקצועיים' },
  ] },
  { group: 'הערכה', items: [
    { r: 'exam', t: 'מבחן הקורס', i: 'exam', d: 'מבחן מסכם' },
    { r: 'feedback', t: 'משוב הקורס', i: 'feedback', d: 'נשמח לשמוע מכם' },
    { r: 'certificate', t: 'טופס סיום קורס', i: 'award', d: 'לאחר אישור צוות הקורס' },
  ] },
];
const ROUTE_SEC = { presentations: 'presentations', 'course-booklets': 'course_booklets', 'info-booklets': 'info_booklets', book: 'book', podcasts: 'podcasts' };
const DRAFT_LABEL = 'לו״ז ראשוני – כפוף לעדכון';

let store, data = {};

async function load() {
  const [settingsRows, cohorts, resources, glossary] = await Promise.all([
    store.list('site_settings'),
    store.list('cohorts', { eq: { is_active: true } }),
    store.list('resources', { order: [['sort'], ['title']] }),
    store.list('glossary_terms', { order: [['sort'], ['term']] }),
  ]);
  const settings = Object.fromEntries(settingsRows.map(r => [r.key, r.value]));
  const cohort = cohorts[0] || null;
  const schedule = cohort ? await store.list('schedule_items', { eq: { cohort_id: cohort.id }, order: [['day_date'], ['start_time'], ['sort']] }) : [];
  data = { settings, cohort, schedule, glossary,
    resources: resources.filter(r => r.is_published && (!r.cohort_id || r.cohort_id === cohort?.id)) };
}

/* ---------------- shell ---------------- */
function renderShell() {
  const s = data.settings;
  $('#hdr-title').textContent = s.course_title || 'קורס קציני משא״ן ע״צ';
  $('#hdr-sub').textContent = [s.org_name || 'מרכז תע״ץ', data.cohort?.name].filter(Boolean).join(' · ');
  const route = currentRoute();
  $('#side-nav').innerHTML = NAV.map(g => `${g.group ? `<div class="side-grp">${esc(g.group)}</div>` : ''}${g.items.map(it =>
    `<a class="nav-item${route === it.r ? ' is-on' : ''}" href="#/${it.r}" ${route === it.r ? 'aria-current="page"' : ''}>${icon(it.i)}<span>${esc(it.t)}</span></a>`).join('')}`).join('');
  $('#foot').innerHTML = `${installHTML()}${footLinks()}<div>${FOOTER_TEXT}</div>`;
}
// אזור הקישורים — כל הקישורים נפתחים בלשונית חדשה
const LINKS = [
  { k: 'policy_url', t: 'אתר המדיניות של מרכז תע״ץ', d: 'הוראות ונהלי מדיניות', i: 'policy' },
  { k: 'instagram_url', t: 'אינסטגרם', d: 'עובדי צה״ל באינסטגרם', i: 'instagram' },
  { k: 'facebook_url', t: 'פייסבוק', d: 'הקבוצה בפייסבוק', i: 'facebook' },
];
function footLinks() {
  const items = LINKS.map(l => ({ ...l, u: safeUrl(data.settings[l.k]) })).filter(l => l.u);
  if (!items.length) return '';
  return `<nav class="foot-links" aria-label="קישורים">${items.map(l => `<a href="${esc(l.u)}" target="_blank" rel="noopener noreferrer">${icon(l.i)}<span>${esc(l.t)}</span><span class="sr"> (נפתח בלשונית חדשה)</span></a>`).join('')}</nav>`;
}
const head = (ic, eyebrow, title, lede) => `<div class="scr-head"><div class="scr-icon">${icon(ic)}</div><div>
  ${eyebrow ? `<div class="eyebrow">${esc(eyebrow)}</div>` : ''}<h1>${esc(title)}</h1>${lede ? `<p class="lede">${esc(lede)}</p>` : ''}</div></div>`;
const soon = (title, text = 'החומר יעלה בהמשך.') => `<div class="empty"><b>${esc(title)}</b>${esc(text)}</div>`;
const draftNote = () => data.cohort && !data.cohort.schedule_approved
  ? `<div class="callout warn" style="margin-bottom:16px" role="note"><span class="mark"></span><div><h4>${DRAFT_LABEL}</h4>
     <p>הנושאים, השעות, המרצים והמיקומים עדיין לא אושרו למחזור הזה ועשויים להשתנות.</p></div></div>` : '';

/* ---------------- views ---------------- */
const VIEWS = {
  '': viewHome, schedule: viewSchedule, presentations: viewSection, 'course-booklets': viewSection, 'info-booklets': viewSection,
  book: viewSection, podcasts: viewSection, glossary: viewGlossary, exam: viewExam, feedback: viewFeedback, certificate: viewCertificate,

};

function viewHome() {
  const s = data.settings, c = data.cohort;
  const tiles = NAV.slice(1).flatMap(g => g.items).map((it, i) => `<a class="tile" href="#/${it.r}" style="animation-delay:${i * 35}ms">
    <span class="ic">${icon(it.i)}</span>${it.r === 'schedule' && c && !c.schedule_approved ? '<span class="tag amber corner">ראשוני</span>' : ''}
    <h3>${esc(it.t)}</h3><p>${esc(it.d || '')}</p></a>`).join('');
  return `<section class="hero"><div class="hero-in"><img class="hero-logo" src="assets/logo-512.png" alt="סמל מרכז תע״ץ" width="138" height="138">
      <div><div class="eyebrow">${esc(s.org_name || 'מרכז תע״ץ')}</div><h1>${esc(s.course_title || 'קורס קציני משא״ן ע״צ')}</h1>
      ${s.home_intro ? `<p class="sub">${esc(s.home_intro)}</p>` : ''}
      ${c ? `<span class="pill"><span class="dot"></span>${esc(c.name)}${c.start_date ? ' · ' + esc(fmtRange(c.start_date, c.end_date)) : ''}</span>` : ''}</div></div></section>
    <div class="wrap">${welcomeHTML()}${nowCard()}<div class="sect-title">כל תכני הקורס</div><div class="tiles">${tiles}</div></div>`;
}

// "דבר מדור ההדרכה": טקסט נגיש; פתיחה וצמצום באותו עמוד
function welcomeHTML() {
  const w = data.settings.welcome, c = data.cohort;
  if (!w || !c || c.show_welcome === false) return '';
  const lines = t => String(t || '').split('\n').map(x => x.trim()).filter(Boolean);
  const body = lines(w.body);
  return `<section class="welcome" aria-labelledby="welcome-h">
    <div class="eyebrow">דבר מדור ההדרכה</div>
    ${w.title ? `<h2 id="welcome-h">${esc(w.title)}</h2>` : '<h2 id="welcome-h" class="sr">דבר מדור ההדרכה</h2>'}
    <div class="welcome-text">${lines(w.intro).map(p => `<p>${esc(p)}</p>`).join('')}</div>
    ${body.length || w.signature ? `<div id="welcome-more" class="welcome-text" hidden>${body.map(p => `<p>${esc(p)}</p>`).join('')}
      <div class="welcome-sign">${w.closing ? `<span>${esc(w.closing)}</span>` : ''}${w.signature ? `<b>${esc(w.signature)}</b>` : ''}</div></div>
    <button class="btn ghost sm welcome-toggle" type="button" aria-expanded="false" aria-controls="welcome-more" data-welcome>לקריאת הברכה המלאה</button>` : ''}
  </section>`;
}
function nowCard() {
  const today = todayISO(), t = nowHM();
  const items = data.schedule.filter(r => r.day_date === today && !isBreak(r.topic));
  const cur = items.find(r => hm(r.start_time) <= t && t < hm(r.end_time));
  const r = cur || items.find(r => hm(r.start_time) > t);
  if (!r) return '';
  return `<a class="card now-card" href="#/schedule" style="text-decoration:none;color:inherit"><div>
    <div class="eyebrow">${cur ? 'עכשיו בקורס' : 'השיעור הבא היום'}${data.cohort.schedule_approved ? '' : ' · ' + DRAFT_LABEL}</div>
    <div class="when"><span class="ltr">${esc(hm(r.start_time))}–${esc(hm(r.end_time))}</span> · <span class="what">${esc(r.topic)}</span></div>
    <div class="meta">${[r.lecturer, r.location].filter(Boolean).map(esc).join(' · ')}</div></div></a>`;
}

let selDay = null;
function viewSchedule() {
  const c = data.cohort;
  if (!c) return `<div class="wrap">${head('calendar', '', 'לו״ז הקורס')}${soon('אין כרגע מחזור פעיל', 'הלו״ז יפורסם עם פתיחת המחזור.')}</div>`;
  const days = [...new Set(data.schedule.map(r => r.day_date))];
  const today = todayISO();
  if (!days.includes(selDay)) selDay = days.includes(today) ? today : days[0];
  const blocks = [...new Set(data.schedule.map(r => r.block).filter(Boolean))];
  const chips = days.map((d, i) => `<button class="day-chip" role="tab" aria-selected="${d === selDay}" data-day="${d}">
    ${d === today ? '<span class="today">היום</span>' : ''}<b>יום ${i + 1}</b><span>${esc(fmtWeekday(d).replace('יום ', ''))} · <span class="num">${esc(fmtDM(d))}</span></span></button>`).join('');
  const t = nowHM();
  const presUrl = id => { const p = id && data.resources.find(x => x.id === id); return p ? (p.kind === 'link' ? safeUrl(p.url) : store.fileUrl(p)) : null; };
  const rows = data.schedule.filter(r => r.day_date === selDay).map((r, i) => {
    const brk = isBreak(r.topic), pu = presUrl(r.resource_id);
    const now = selDay === today && hm(r.start_time) <= t && t < hm(r.end_time);
    return `<div class="slot${brk ? ' brk' : ''}${now ? ' now' : ''}" style="animation-delay:${i * 25}ms">
      <div class="time"><span class="ltr">${esc(hm(r.start_time))}–${esc(hm(r.end_time))}</span></div>
      <div class="slot-body"><div class="topic-row"><div class="topic">${esc(r.topic)}${now ? ' <span class="tag amber">עכשיו</span>' : ''}</div>
        ${pu ? `<a class="slot-pres" href="${esc(pu)}" target="_blank" rel="noopener" aria-label="פתיחת מצגת השיעור: ${esc(r.topic)} (נפתח בלשונית חדשה)" title="פתיחת מצגת השיעור">${icon('slides')}</a>` : ''}</div>
      ${brk ? (r.location ? `<div class="meta"><span>${icon('pin')}${esc(r.location)}</span></div>` : '') : `<div class="meta">
        ${r.lecturer ? `<span>${icon('person')}${esc(r.lecturer)}</span>` : ''}${r.location ? `<span>${icon('pin')}${esc(r.location)}</span>` : ''}</div>
        ${r.block ? `<span class="tag ${blockClass(r.block, blocks)}">${esc(r.block)}</span>` : ''}`}</div></div>`;
  }).join('');
  return `<div class="wrap">${head('calendar', c.name, c.schedule_approved ? 'לו״ז הקורס' : DRAFT_LABEL, c.start_date ? fmtRange(c.start_date, c.end_date) : '')}${draftNote()}
    ${days.length ? `<div class="days" role="tablist" aria-label="ימי הקורס">${chips}</div>
    <div class="day-head"><h2>${esc(fmtDayLong(selDay))}</h2>${c.schedule_approved ? '' : `<span class="tag amber">${DRAFT_LABEL}</span>`}</div><div class="slots">${rows}</div>` : soon('הלו״ז יעלה בהמשך')}</div>`;
}

function resItem(r, i) {
  const url = r.kind === 'link' ? safeUrl(r.url) : store.fileUrl(r);
  const ext = r.kind === 'file' && r.file_name ? r.file_name.split('.').pop().toUpperCase() : '';
  const audio = url && r.kind === 'file' && /^(MP3|M4A|AAC|WAV|OGG|OPUS)$/.test(ext);
  const video = url && r.kind === 'file' && /^(MP4|M4V|WEBM|MOV)$/.test(ext);
  const ic = r.kind === 'link' ? 'link' : r.section === 'presentations' ? 'slides' : r.section === 'podcasts' ? 'mic' : 'booklet';
  return `<div class="res${url ? '' : ' soon'}" style="animation-delay:${i * 25}ms;${audio || video ? 'flex-wrap:wrap' : ''}"><span class="ic">${icon(ic)}</span>
    <div class="grow"><div class="t">${esc(r.title)}</div>${r.description ? `<div class="d">${esc(r.description)}</div>` : ''}${url && ext && !audio && !video ? `<div class="d">${esc(ext)}</div>` : ''}</div>
    ${video ? `<video controls playsinline preload="metadata" src="${esc(url)}" style="width:100%;max-height:70vh;border-radius:10px;background:#000"></video>`
      : audio ? `<audio controls preload="none" src="${esc(url)}" style="width:100%"></audio>`
      : `<div class="act">${url ? `<a class="btn ghost sm" href="${esc(url)}" target="_blank" rel="noopener">${icon(r.kind === 'link' ? 'external' : 'download')}פתיחה</a>` : '<span class="tag gray">יעלה בהמשך</span>'}</div>`}</div>`;
}
function viewSection(route) {
  const key = ROUTE_SEC[route], meta = SECTIONS[key];
  const list = data.resources.filter(r => r.section === key);
  return `<div class="wrap">${head(meta.icon, '', meta.title, meta.lede)}
    ${list.length ? `<div class="res-list">${list.map(resItem).join('')}</div>` : soon('יעלה בהמשך', 'החומרים יתווספו כאן בהמשך.')}</div>`;
}

function viewGlossary() {
  const g = data.glossary, gu = safeUrl(data.settings.glossary_url);
  const linkCard = `<div class="res${gu ? '' : ' soon'}" style="margin-bottom:16px"><span class="ic">${icon('glossary')}</span><div class="grow"><div class="t">מילון המונחים של הקורס</div></div>
    <div class="act">${gu ? `<a class="btn solid sm" href="${esc(gu)}" target="_blank" rel="noopener noreferrer">${icon('external')}פתיחת המילון<span class="sr"> (נפתח בלשונית חדשה)</span></a>` : '<span class="tag gray">יעלה בהמשך</span>'}</div></div>`;
  return `<div class="wrap">${head('glossary', '', 'מילון מונחים', 'מונחים ומושגים מקצועיים מעולם משא״ן ע״צ.')}${linkCard}
    ${!g.length ? '' : g.length ? `<div class="search">${icon('search')}<input id="gq" type="search" placeholder="חיפוש מונח…" aria-label="חיפוש מונח"></div><div id="glist">${glossList(g)}</div>`
      : ''}</div>`;
}
const glossList = g => g.length ? g.map(t => `<details class="acc"><summary>${esc(t.term)}${t.category ? ` <span class="tag">${esc(t.category)}</span>` : ''}${icon('chev', 'chev')}</summary>
  <div class="body"><p>${esc(t.definition)}</p></div></details>`).join('') : '<div class="empty"><b>לא נמצאו מונחים</b>נסו מילה אחרת.</div>';


/* ---------------- exam ---------------- */
const EXAM_CLOSED = 'המבחן אינו פתוח כעת';
const receiptBox = () => `<div class="card pad" style="margin-top:22px"><div class="eyebrow">בדיקת תוצאה</div>
  <p class="small muted">אחרי ההגשה מתקבל קוד אישור אישי. אפשר להזין אותו כאן כדי לראות את התוצאה, כשהיא מפורסמת.</p>
  <form id="receipt-form" class="btnrow"><input class="input ltr" id="rc" style="max-width:240px" placeholder="קוד אישור" aria-label="קוד אישור" autocomplete="off" autocapitalize="characters" spellcheck="false" required>
  <button class="btn ghost" type="submit">בדיקה</button></form><div id="rc-out" style="margin-top:10px" role="status"></div></div>`;
// קוד ההתחלה נשמר רק בלשונית הזו (לחזרה לניסיון אחרי רענון); לא נשמרים פרטים אישיים בדפדפן
const tokKey = id => `taatz-exam-start-${id}`;
const getTok = id => { try { return sessionStorage.getItem(tokKey(id)); } catch { return null; } };
const setTok = (id, t) => { try { t ? sessionStorage.setItem(tokKey(id), t) : sessionStorage.removeItem(tokKey(id)); } catch { /* not critical */ } };
let examRun = null; // { examId, token, timer, closed }

async function viewExam() {
  examRun = null;
  const c = data.cohort;
  const h = head('exam', '', 'מבחן הקורס');
  if (!c) return `<div class="wrap">${h}${soon(EXAM_CLOSED, '')}</div>`;
  const [exam] = await store.list('exams', { eq: { cohort_id: c.id } });
  if (!exam || exam.mode === 'off') return `<div class="wrap">${h}${soon(EXAM_CLOSED, '')}</div>`;
  if (exam.mode === 'external') {
    const u = safeUrl(exam.external_url);
    return `<div class="wrap">${head('exam', c.name, exam.title)}${u && exam.is_open ? `<div class="card pad stack">${exam.instructions ? `<p>${esc(exam.instructions)}</p>` : ''}
      <a class="btn solid" href="${esc(u)}" target="_blank" rel="noopener">${icon('external')}מעבר למבחן</a></div>` : soon(EXAM_CLOSED, '')}</div>`;
  }
  const withReceipt = exam.show_results !== 'never' ? receiptBox() : '';
  // חזרה לניסיון שכבר התחיל (גם בזמן ארכה אחרי סגירה מתונה)
  const tok = getTok(exam.id);
  if (tok) {
    try {
      const d = await store.rpc('get_exam_draft', { p_token: tok });
      if (d.status === 'started' && d.can_submit) return examQuestionsHTML(exam, c, tok, d.questions, d.answers || {}, d.grace_until, withReceipt);
      setTok(exam.id, null);
      if (d.status === 'closed_unsubmitted' || !d.can_submit) return `<div class="wrap">${head('exam', c.name, exam.title)}
        <div class="callout warn"><span class="mark"></span><div><h4>${EXAM_CLOSED}</h4><p>המבחן נסגר לפני שהניסיון הוגש. התשובות שנשמרו עד הסגירה שמורות אצל צוות הקורס.</p></div></div>${withReceipt}</div>`;
    } catch { setTok(exam.id, null); }
  }
  if (!exam.is_open) return `<div class="wrap">${head('exam', c.name, exam.title)}${soon(EXAM_CLOSED, '')}${withReceipt}</div>`;
  return `<div class="wrap">${head('exam', c.name, exam.title)}
    ${exam.instructions ? `<div class="callout" style="margin-bottom:16px"><span class="mark"></span><div><p>${esc(exam.instructions)}</p></div></div>` : ''}
    <form id="exam-start" class="card pad" data-exam="${esc(exam.id)}" novalidate autocomplete="off">
      <div class="eyebrow">פרטי הנבחן/ת</div>
      <div class="formgrid">
        <div class="field"><label for="ex-name">שם מלא <span class="req">*</span></label><input class="input" id="ex-name" required minlength="2" maxlength="80" autocomplete="name"></div>
        <div class="field"><label for="ex-unit">יחידה <span class="req">*</span></label><input class="input" id="ex-unit" required maxlength="80" autocomplete="off"></div>
        <div class="field"><label for="ex-id">מספר תעודת זהות <span class="req">*</span></label><input class="input ltr" id="ex-id" required inputmode="numeric" maxlength="10" autocomplete="off" spellcheck="false">
          <span class="hint">9 ספרות, כולל ספרת ביקורת.</span></div>
      </div>
      <p class="small muted">אחרי ההתחלה התשובות נשמרות אוטומטית במהלך המבחן.</p>
      <div class="err" id="exam-err" role="alert"></div><div class="btnrow"><button class="btn solid" type="submit">התחלת המבחן</button></div></form>${withReceipt}</div>`;
}

function examQuestionsHTML(exam, c, token, qs, answers, graceUntil, withReceipt) {
  examRun = { examId: exam.id, token, timer: null, closed: false };
  const grace = graceUntil && !exam.is_open ? `<div class="callout warn" id="grace-note" style="margin-bottom:16px"><span class="mark"></span><div><h4>המבחן נסגר להתחלות חדשות</h4>
    <p>אפשר לסיים ולהגיש עד <b class="ltr">${esc(new Date(graceUntil).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }))}</b>.</p></div></div>` : '';
  setTimeout(() => restoreAnswers(answers), 0);
  return `<div class="wrap">${head('exam', c.name, exam.title)}${grace}<div id="exam-closed-note"></div>
    <form id="exam-form" class="card pad" data-exam="${esc(exam.id)}" novalidate autocomplete="off">
      ${(qs || []).sort((a, b) => a.sort - b.sort).map((q, i) => questionHTML(q, i, 'exam')).join('')}
      <div class="small muted" id="autosave" role="status" aria-live="polite"></div>
      <div class="err" id="exam-err" role="alert"></div><div class="btnrow" style="margin-top:14px"><button class="btn solid" type="submit">הגשת המבחן</button></div></form>${withReceipt}</div>`;
}
function restoreAnswers(answers) {
  const form = $('#exam-form'); if (!form) return;
  for (const [qid, v] of Object.entries(answers || {})) {
    const fs = form.querySelector(`[data-q="${CSS.escape(qid)}"]`); if (!fs) continue;
    const vals = Array.isArray(v) ? v.map(String) : [String(v)];
    $$('input[type=radio],input[type=checkbox]', fs).forEach(i => { i.checked = vals.includes(i.value); });
    const t = fs.querySelector('input.input,textarea'); if (t) t.value = String(v);
  }
}
async function startExam(form) {
  const err = $('#exam-err'); err.textContent = '';
  const name = $('#ex-name').value.trim(), unit = $('#ex-unit').value.trim(), idRaw = $('#ex-id').value;
  const bad = (msg, el) => { err.textContent = msg; el.focus(); };
  if (name.length < 2) return bad('יש להזין שם מלא.', $('#ex-name'));
  if (!unit) return bad('יש להזין יחידה.', $('#ex-unit'));
  if (!normIlId(idRaw)) return bad('מספר תעודת הזהות אינו תקין. יש להקליד 9 ספרות.', $('#ex-id'));
  const btn = $('button[type=submit]', form); btn.disabled = true;
  try {
    const r = await store.rpc('start_exam', { p_exam: form.dataset.exam, p_name: name, p_unit: unit, p_id: idRaw });
    setTok(form.dataset.exam, r.token);
    form.reset();
    render(); scrollTo({ top: 0 });
  } catch (e) {
    btn.disabled = false;
    err.textContent = /exam_closed/.test(e.message) ? EXAM_CLOSED + '. ' + 'רעננו את הדף לבדיקה חוזרת.' : errText(e);
  }
}
function examClosedNow(msg) {
  if (!examRun || examRun.closed) return;
  examRun.closed = true; clearTimeout(examRun.timer);
  const n = $('#exam-closed-note');
  if (n) n.innerHTML = `<div class="callout key" style="margin-bottom:16px" role="alert"><span class="mark"></span><div><h4>${EXAM_CLOSED}</h4>
    <p>${esc(msg || 'המבחן נסגר על ידי צוות הקורס. התשובות שנשמרו עד הסגירה שמורות אצל צוות הקורס.')}</p></div></div>`;
  $$('#exam-form input, #exam-form textarea, #exam-form button').forEach(x => { x.disabled = true; });
  setTok(examRun.examId, null);
  n?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
async function saveDraft() {
  if (!examRun || examRun.closed) return;
  const form = $('#exam-form'); if (!form) return;
  const st = $('#autosave');
  try {
    const r = await store.rpc('save_exam_draft', { p_token: examRun.token, p_answers: collect(form).out });
    if (st) st.textContent = `התשובות נשמרו אוטומטית · ${new Date(r.saved_at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}`;
  } catch (e) {
    if (/exam_closed|bad_token/.test(e.message)) examClosedNow();
    else if (st) st.textContent = 'השמירה האוטומטית נכשלה (בעיית חיבור). התשובות עדיין בדף — נסו שוב בעוד רגע.';
  }
}
function scheduleSave() { if (!examRun || examRun.closed) return; clearTimeout(examRun.timer); examRun.timer = setTimeout(saveDraft, 1200); }

function questionHTML(q, i, kind) {
  const name = `q_${q.id}`, opts = q.options || [];
  let body = '';
  if (q.qtype === 'single' || q.qtype === 'multi') body = opts.map(o => `<label class="choice"><input type="${q.qtype === 'single' ? 'radio' : 'checkbox'}" name="${name}" value="${esc(o.id)}"><span>${esc(o.text)}</span></label>`).join('');
  else if (q.qtype === 'truefalse') body = [['true', 'נכון'], ['false', 'לא נכון']].map(([v, t]) => `<label class="choice"><input type="radio" name="${name}" value="${v}"><span>${t}</span></label>`).join('');
  else if (q.qtype === 'short' || q.qtype === 'text') body = `<input class="input" name="${name}" maxlength="300" aria-label="תשובה">`;
  else if (q.qtype === 'open' || q.qtype === 'longtext') body = `<textarea class="input" name="${name}" maxlength="4000" aria-label="תשובה"></textarea>`;
  else if (q.qtype === 'rating5') body = `<div class="rating">${[1, 2, 3, 4, 5].map(n => `<label><input type="radio" name="${name}" value="${n}">${n}<small>${n === 1 ? 'במידה מועטה' : n === 5 ? 'במידה רבה' : '&nbsp;'}</small></label>`).join('')}</div>`;
  const label = kind === 'exam' ? `שאלה ${i + 1}${q.points != null ? ` · ${q.points} נק׳` : ''}${q.qtype === 'multi' ? ' · ניתן לבחור כמה תשובות' : ''}` : (q.section || '');
  return `<fieldset class="q" style="border:0;margin:0;padding-inline:0" data-q="${esc(q.id)}" data-type="${q.qtype}" data-req="${q.required ? 1 : 0}">
    ${label ? `<div class="qn">${esc(label)}</div>` : ''}<legend class="qp">${esc(q.prompt)}${q.required ? ' <span class="req">*</span>' : ''}</legend>${body}</fieldset>`;
}
function collect(form) {
  const out = {}, missing = [];
  for (const fs of $$('[data-q]', form)) {
    const id = fs.dataset.q, t = fs.dataset.type, name = `q_${id}`;
    let v = null;
    if (t === 'multi') { const a = $$(`input[name="${name}"]:checked`, fs).map(x => x.value); v = a.length ? a : null; }
    else if (['single', 'truefalse', 'rating5'].includes(t)) v = $(`input[name="${name}"]:checked`, fs)?.value ?? null;
    else { const s = $(`[name="${name}"]`, fs).value.trim(); v = s || null; }
    if (t === 'rating5' && v != null) v = Number(v);
    if (v != null) out[id] = v; else if (fs.dataset.req === '1') missing.push(fs);
  }
  return { out, missing };
}

async function submitExam(form) {
  if (!examRun) return;
  const err = $('#exam-err'); err.textContent = '';
  const { out } = collect(form);
  const total = $$('[data-q]', form).length, answered = Object.keys(out).length;
  if (!(await confirmBox(answered < total ? `ענית על ${answered} מתוך ${total} שאלות. להגיש בכל זאת?` : 'להגיש את המבחן? לא ניתן לשנות תשובות אחרי ההגשה.', 'הגשה'))) return;
  const btn = $('button[type=submit]', form); btn.disabled = true;
  clearTimeout(examRun.timer);
  try {
    const r = await store.rpc('submit_exam', { p_token: examRun.token, p_answers: out });
    setTok(examRun.examId, null); examRun = null;
    const scoreTxt = r.score_pct != null ? `<div class="stat"><div><div class="k">ציון</div><div class="v num">${r.score_pct}</div></div>
      <div><div class="k">תוצאה</div><div class="v">${r.passed ? 'עבר/ה' : 'לא עבר/ה'}</div></div></div>`
      : `<p>${r.show_results === 'never' ? 'התוצאות יימסרו על ידי צוות הקורס.' : r.show_results === 'after_close' ? 'התוצאה תפורסם בהמשך.' : r.pending_manual ? 'חלק מהשאלות ייבדקו ידנית, והתוצאה תפורסם בהמשך.' : 'התוצאה תימסר על ידי צוות הקורס.'}</p>`;
    $('#view').innerHTML = `<div class="wrap">${head('exam', '', 'המבחן הוגש')}<div class="card pad stack"><div class="callout ok"><span class="mark"></span><div><h4>ההגשה נקלטה. תודה!</h4></div></div>
      <div class="stat"><div><div class="k">קוד האישור האישי שלך</div><div class="v ltr" style="letter-spacing:.1em">${esc(r.receipt)}</div></div></div>
      <p class="small">כדאי לשמור את הקוד (צילום מסך או העתקה). הוא משמש לצפייה בתוצאה ובטופס הסיום האישי, ואינו נשמר במכשיר.</p>
      <div class="btnrow"><button class="btn ghost sm" data-copy="${esc(r.receipt)}">${icon('copy')}העתקת הקוד</button></div>
      ${scoreTxt}<a class="btn ghost" href="#/">חזרה לדף הבית</a></div></div>`;
    scrollTo({ top: 0 });
  } catch (e) {
    if (/exam_closed|bad_token/.test(e.message)) return examClosedNow('ההגשה לא נקלטה כי המבחן נסגר על ידי צוות הקורס. התשובות שנשמרו עד הסגירה שמורות אצל צוות הקורס.');
    err.textContent = errText(e); btn.disabled = false;
  }
}
async function checkReceipt() {
  const o = $('#rc-out'); o.textContent = '';
  try {
    const r = await store.rpc('exam_result', { p_receipt: $('#rc').value });
    o.innerHTML = r.visible && r.score_pct != null
      ? `<b>ציון ${r.score_pct}</b> · ${r.passed ? '<span class="tag ok">עבר/ה</span>' : '<span class="tag wine">לא עבר/ה</span>'}`
      : r.pending_manual ? 'ההגשה נקלטה וממתינה לבדיקה.' : `ההגשה נקלטה (${esc(fmtDateTime(r.submitted_at))}). התוצאה עוד לא פורסמה.`;
  } catch (e) { o.innerHTML = `<span class="err">${esc(errText(e))}</span>`; }
}

/* ---------------- certificate ---------------- */
function viewCertificate() {
  return `<div class="wrap">${head('award', '', 'טופס סיום קורס', 'טופס הסיום זמין לאחר אישור צוות הקורס.')}
    <div class="card pad"><p>להצגת הטופס יש להזין את קוד האישור האישי שהתקבל בסיום המבחן.</p>
      <form id="cert-form" class="btnrow"><input class="input ltr" id="cc" style="max-width:240px" placeholder="קוד אישור" aria-label="קוד אישור" autocomplete="off" autocapitalize="characters" spellcheck="false" required>
      <button class="btn solid" type="submit">הצגת הטופס</button></form><div id="cc-out" style="margin-top:12px" role="status"></div></div>
    <div id="cert-area" style="margin-top:18px"></div></div>`;
}
let shownCert = null;
async function openCertificate() {
  const o = $('#cc-out'), area = $('#cert-area'); o.textContent = ''; area.innerHTML = ''; shownCert = null;
  try {
    const r = await store.rpc('get_certificate', { p_receipt: $('#cc').value });
    if (!r.available) { o.innerHTML = 'טופס הסיום עדיין לא זמין. הוא יופק לאחר אישור צוות הקורס.'; return; }
    shownCert = r.certificate;
    const { mountPreview } = await import('./cert.js');
    area.innerHTML = `<div class="btnrow" style="margin-bottom:12px"><button class="btn solid" data-cert-pdf>${icon('download')}הורדת PDF</button></div><div id="cert-prev"></div>`;
    mountPreview($('#cert-prev'), shownCert);
  } catch (e) { o.innerHTML = `<span class="err">${esc(errText(e))}</span>`; }
}

/* ---------------- feedback ---------------- */
const FB_CLOSED = 'המשוב אינו פתוח כעת';
const FB_SENT = id => `taatz-fb-sent-${id}`;
const sentHere = id => { try { return localStorage.getItem(FB_SENT(id)) === '1'; } catch { return false; } };
async function viewFeedback() {
  const c = data.cohort;
  const h = head('feedback', '', 'משוב הקורס');
  if (!c) return `<div class="wrap">${h}${soon(FB_CLOSED, '')}</div>`;
  const [f] = await store.list('feedback_forms', { eq: { cohort_id: c.id } });
  if (!f || f.mode === 'off') return `<div class="wrap">${h}${soon(FB_CLOSED, '')}</div>`;
  if (f.mode === 'external') {
    const u = safeUrl(f.external_url);
    return `<div class="wrap">${head('feedback', c.name, f.title)}${u && f.is_open ? `<div class="card pad stack">${f.intro ? `<p>${esc(f.intro)}</p>` : ''}
      <a class="btn solid" href="${esc(u)}" target="_blank" rel="noopener">${icon('external')}מעבר לטופס המשוב</a></div>` : soon(FB_CLOSED, '')}</div>`;
  }
  if (!f.is_open) return `<div class="wrap">${head('feedback', c.name, f.title)}${soon(FB_CLOSED, '')}</div>`;
  if (sentHere(f.id) && !location.hash.includes('again')) return `<div class="wrap">${head('feedback', c.name, f.title)}<div class="callout ok"><span class="mark"></span><div>
    <h4>המשוב נשלח מהמכשיר הזה. תודה!</h4><p class="small"><a href="#/feedback?again">מילוי משוב נוסף ממכשיר משותף</a></p></div></div></div>`;
  const qs = await store.list('feedback_questions', { eq: { form_id: f.id }, order: [['sort']] });
  const { feedbackFormHTML } = await import('./fbform.js');
  const intro = String(f.intro || '').split('\n').map(l => l.trim()).filter(Boolean);
  const anonNote = f.anonymous && !/אנונימי/.test(f.intro || '') ? '<p class="small"><b>המשוב אנונימי:</b> לא נשמרים שם או פרטים מזהים עם התשובות.</p>' : '';
  return `<div class="wrap">${head('feedback', c.name, f.title)}
    ${intro.length || anonNote ? `<div class="callout${f.anonymous ? ' ok' : ''}" style="margin-bottom:16px"><span class="mark"></span><div>${intro.map(p => `<p>${esc(p)}</p>`).join('')}${anonNote}</div></div>` : ''}
    ${f.anonymous ? '' : `<div class="field"><label for="fb-name">שם (לא חובה)</label><input class="input" id="fb-name" autocomplete="name" maxlength="80" form="fb-form"></div>`}
    ${feedbackFormHTML(f, qs)}</div>`;
}
async function submitFeedback(form) {
  const { validateStep, showStep } = await import('./fbform.js');
  const steps = $$('.fb-step', form);
  for (const [k, s] of steps.entries()) if (!validateStep(s)) { showStep(form, k); $('#fb-err').textContent = 'יש לענות על שאלות החובה המסומנות בכוכבית.'; return; }
  const { out } = collect(form);
  const btn = $('button[type=submit]', form); btn.disabled = true;
  try {
    await store.rpc('submit_feedback', { p_form: form.dataset.form, p_name: $('#fb-name')?.value || null, p_answers: out });
    try { localStorage.setItem(FB_SENT(form.dataset.form), '1'); } catch { /* not critical */ }
    $('#view').innerHTML = `<div class="wrap">${head('feedback', '', 'תודה!')}<div class="callout ok"><span class="mark"></span><div><h4>המשוב התקבל.</h4><p>תודה על הזמן ועל השיתוף.</p></div></div></div>`;
    scrollTo({ top: 0 });
  } catch (e) {
    if (/feedback_closed/.test(e.message)) { $('#view').innerHTML = `<div class="wrap">${head('feedback', '', 'משוב הקורס')}${soon(FB_CLOSED, '')}</div>`; return; }
    $('#fb-err').textContent = errText(e); btn.disabled = false;
  }
}

// ניווט בין חלקי המשוב
let fbMod = null; import('./fbform.js').then(m => { fbMod = m; });
const fbStep = e => !!fbMod?.handleStepClick(e);

/* ---------------- router ---------------- */
const currentRoute = () => decodeURIComponent(location.hash.replace(/^#\/?/, '').split('?')[0]);
async function render() {
  const route = currentRoute();
  const fn = VIEWS[route] || viewHome;
  renderShell();
  const v = $('#view');
  v.classList.remove('view'); void v.offsetWidth; v.classList.add('view');
  v.innerHTML = '<div class="wrap" style="padding-top:40px"><p class="muted">טוען…</p></div>';
  try { v.innerHTML = await fn(route); }
  catch (e) { v.innerHTML = `<div class="wrap" style="padding-top:30px"><div class="callout key"><span class="mark"></span><div><h4>לא ניתן לטעון את העמוד</h4><p>${esc(errText(e))}</p></div></div></div>`; }
  const title = NAV.flatMap(g => g.items).find(i => i.r === route)?.t;
  document.title = (title && route ? title + ' | ' : '') + (data.settings.course_title || 'קורס קציני משא״ן ע״צ');
  closeNav();
}
function openNav() { $('#side').classList.add('open'); $('#scrim').classList.add('on'); $('#burger').setAttribute('aria-expanded', 'true'); }
function closeNav() { $('#side').classList.remove('open'); $('#scrim').classList.remove('on'); $('#burger')?.setAttribute('aria-expanded', 'false'); }

document.addEventListener('click', e => {
  if (e.target.closest('[data-install]')) { handleInstallClick(e); return; }
  if (e.target.closest('#fb-form') && fbStep(e)) return;
  // לחיצה על קישור לעמוד הנוכחי טוענת אותו מחדש (למשל אחרי הגשת מבחן)
  const a = e.target.closest('a[href^="#/"]');
  if (a && a.getAttribute('href') === location.hash) { e.preventDefault(); render(); scrollTo({ top: 0 }); return; }
  const cp = e.target.closest('[data-copy]');
  if (cp) { navigator.clipboard?.writeText(cp.dataset.copy).then(() => toast('הקוד הועתק'), () => toast('לא ניתן להעתיק. אפשר לצלם את המסך.', true)); return; }
  if (e.target.closest('[data-cert-pdf]') && shownCert) {
    const b = e.target.closest('[data-cert-pdf]'); b.disabled = true;
    import('./cert.js').then(m => m.downloadPDF([shownCert], m.certFileName(shownCert))).catch(err => toast(errText(err), true)).finally(() => { b.disabled = false; });
    return;
  }
  const wb = e.target.closest('[data-welcome]');
  if (wb) { const more = $('#welcome-more'); const open = more.hidden; more.hidden = !open; wb.setAttribute('aria-expanded', String(open)); wb.textContent = open ? 'צמצום הברכה' : 'לקריאת הברכה המלאה'; if (!open) wb.closest('.welcome').scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
  const day = e.target.closest('[data-day]');
  if (day) { selDay = day.dataset.day; $('#view').innerHTML = viewSchedule(); }
});
document.addEventListener('submit', e => {
  if (e.target.id === 'exam-start') { e.preventDefault(); startExam(e.target); }
  if (e.target.id === 'exam-form') { e.preventDefault(); submitExam(e.target); }
  if (e.target.id === 'fb-form') { e.preventDefault(); submitFeedback(e.target); }
  if (e.target.id === 'receipt-form') { e.preventDefault(); checkReceipt(); }
  if (e.target.id === 'cert-form') { e.preventDefault(); openCertificate(); }
});
// שמירה אוטומטית של תשובות המבחן
document.addEventListener('change', e => { if (e.target.closest('#exam-form')) scheduleSave(); });
document.addEventListener('input', e => {
  if (e.target.closest('#exam-form')) scheduleSave();
  if (e.target.id === 'gq') {
    const q = e.target.value.trim();
    $('#glist').innerHTML = glossList(data.glossary.filter(t => !q || t.term.includes(q) || t.definition.includes(q) || (t.category || '').includes(q)));
  }
});

(async function start() {
  $('#burger').addEventListener('click', () => $('#side').classList.contains('open') ? closeNav() : openNav());
  $('#scrim').addEventListener('click', closeNav);
  try {
    store = await createStore();
    demoBanner(store, '<a href="admin.html" style="color:inherit">למסך הניהול</a>');
    await load();
  } catch (e) {
    $('#view').innerHTML = `<div class="wrap" style="padding-top:30px"><div class="callout key"><span class="mark"></span><div><h4>לא ניתן לטעון את האתר</h4><p>${esc(errText(e))}</p></div></div></div>`;
    return;
  }
  addEventListener('hashchange', () => { if (location.hash && !location.hash.startsWith('#/')) return; render(); scrollTo({ top: 0 }); });
  render();
})();
