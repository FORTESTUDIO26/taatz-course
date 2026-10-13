// טופס משוב בחלקים (שלב אחר שלב), משותף לאתר ולתצוגה המקדימה בניהול
import { esc, $, $$ } from './ui.js';

// מקבץ את השאלות לפי חלקים, בסדר שהוגדר בטופס (form.sections), ואחר כך חלקים שלא הוגדרו
export function groupSections(form, questions) {
  const qs = [...questions].sort((a, b) => a.sort - b.sort);
  const defs = Array.isArray(form.sections) ? form.sections : [];
  const names = [...new Set([...defs.map(s => s.title), ...qs.map(q => q.section || '')])];
  return names.map(n => ({ title: n, intro: defs.find(s => s.title === n)?.intro || '', questions: qs.filter(q => (q.section || '') === n) }))
    .filter(s => s.questions.length);
}

function questionHTML(q, num) {
  const name = `q_${q.id}`, opts = q.options || [];
  const req = q.required ? ' <span class="req" aria-hidden="true">*</span>' : '';
  let body = '';
  if (q.qtype === 'rating5') {
    const lab = n => opts.find(o => String(o.id) === String(n))?.text || '';
    body = `<div class="rating stars">${[1, 2, 3, 4, 5].map(n => `<label><input type="radio" name="${name}" value="${n}" aria-label="${n} מתוך 5${lab(n) ? ' – ' + esc(lab(n)) : ''}">
      <span class="st" aria-hidden="true">★</span>${lab(n) ? `<small>${esc(lab(n))}</small>` : ''}</label>`).join('')}</div>`;
  } else if (q.qtype === 'single' || q.qtype === 'multi') {
    body = opts.map(o => `<label class="choice"><input type="${q.qtype === 'single' ? 'radio' : 'checkbox'}" name="${name}" value="${esc(o.id)}"><span>${esc(o.text)}</span></label>`).join('');
  } else if (q.qtype === 'text') {
    body = `<input class="input" name="${name}" maxlength="300" placeholder="${esc(q.placeholder || '')}" aria-label="${esc(q.prompt)}">`;
  } else {
    body = `<textarea class="input" name="${name}" maxlength="4000" placeholder="${esc(q.placeholder || '')}" aria-label="${esc(q.prompt)}"></textarea>`;
  }
  return `<fieldset class="q" style="border:0;margin:0;padding-inline:0" data-q="${esc(q.id)}" data-type="${q.qtype}" data-req="${q.required ? 1 : 0}">
    <legend class="qp">${num}. ${esc(q.prompt)}${req}</legend>${body}<div class="q-err err" role="alert"></div></fieldset>`;
}

export function feedbackFormHTML(form, questions, { preview = false } = {}) {
  const secs = groupSections(form, questions);
  let num = 0;
  const steps = secs.map((s, i) => `<section class="fb-step" data-step="${i}" ${i ? 'hidden' : ''} aria-labelledby="fbs-${i}">
      ${s.title ? `<h2 class="fb-sec" id="fbs-${i}">${esc(s.title)}</h2>` : `<h2 class="sr" id="fbs-${i}">חלק ${i + 1}</h2>`}
      ${s.intro ? `<div class="fb-intro">${s.intro.split('\n').map(l => l.trim()).filter(Boolean).map(l => `<p>${esc(l)}</p>`).join('')}</div>` : ''}
      ${s.questions.map(q => questionHTML(q, ++num)).join('')}</section>`).join('');
  const n = secs.length;
  return `<form id="${preview ? 'fb-preview' : 'fb-form'}" class="card pad fb-form" data-form="${esc(form.id || '')}" data-steps="${n}" novalidate>
    ${n > 1 ? `<div class="fb-progress" aria-live="polite"><div class="fb-progress-t"><span data-step-label>חלק 1 מתוך ${n}</span></div>
      <div class="bar" style="height:8px"><i data-step-bar style="width:${Math.round(100 / n)}%"></i></div></div>` : ''}
    ${steps || '<p class="muted">טרם הוגדרו שאלות.</p>'}
    <div class="err" id="fb-err" role="alert"></div>
    <div class="btnrow fb-nav" style="margin-top:14px">
      <button type="button" class="btn ghost" data-fb-prev hidden>חזור</button>
      <button type="button" class="btn solid" data-fb-next ${n > 1 ? '' : 'hidden'}>הבא</button>
      <button type="submit" class="btn solid" data-fb-send ${n > 1 ? 'hidden' : ''} ${preview || !n ? 'disabled' : ''}>${preview ? 'שליחה (מושבת בתצוגה מקדימה)' : 'שליחת המשוב'}</button>
    </div></form>`;
}

// בדיקת שאלות חובה בחלק הנוכחי. מחזירה true אם תקין.
export function validateStep(stepEl) {
  let ok = true, first = null;
  for (const fs of $$('[data-q]', stepEl)) {
    const err = $('.q-err', fs); err.textContent = '';
    if (fs.dataset.req !== '1') continue;
    const t = fs.dataset.type, name = `q_${fs.dataset.q}`;
    const has = ['rating5', 'single', 'multi'].includes(t) ? !!$(`input[name="${name}"]:checked`, fs) : !!$(`[name="${name}"]`, fs).value.trim();
    if (!has) { ok = false; err.textContent = t === 'multi' ? 'יש לבחור לפחות אפשרות אחת.' : t === 'rating5' ? 'יש לבחור דירוג.' : t === 'single' ? 'יש לבחור תשובה.' : 'יש לענות על שאלה זו.'; first ||= fs; }
  }
  if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
  return ok;
}

// ניווט בין החלקים (הבא / חזור). מחזיר true אם הטיפול בוצע.
export function handleStepClick(e) {
  const btn = e.target.closest('[data-fb-next],[data-fb-prev]'); if (!btn) return false;
  const form = btn.closest('form'); const steps = $$('.fb-step', form); const n = steps.length;
  let i = steps.findIndex(s => !s.hidden);
  // בתצוגה המקדימה אפשר לדפדף בלי לענות
  if (btn.hasAttribute('data-fb-next')) { if (form.id !== 'fb-preview' && !validateStep(steps[i])) return true; i = Math.min(n - 1, i + 1); } else i = Math.max(0, i - 1);
  showStep(form, i);
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return true;
}

// מציג את החלק i ומעדכן כפתורים ופס התקדמות
export function showStep(form, i) {
  const steps = $$('.fb-step', form); const n = steps.length;
  steps.forEach((s, k) => { s.hidden = k !== i; });
  $('[data-fb-prev]', form).hidden = i === 0;
  $('[data-fb-next]', form).hidden = i === n - 1;
  $('[data-fb-send]', form).hidden = i !== n - 1;
  const l = $('[data-step-label]', form), b = $('[data-step-bar]', form);
  if (l) l.textContent = `חלק ${i + 1} מתוך ${n}`; if (b) b.style.width = Math.round((i + 1) / n * 100) + '%';
}
