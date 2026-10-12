// עזרי ממשק משותפים לאתר ולמסך הניהול
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// סמלים (קו פשוט, 24×24)
const P = {
  home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  syllabus: '<path d="M4 5h6a2 2 0 012 2v13a2 2 0 00-2-2H4z"/><path d="M20 5h-6a2 2 0 00-2 2v13a2 2 0 012-2h6z"/>',
  slides: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M12 16v4M8 20h8"/>',
  book: '<path d="M5 4h11a3 3 0 013 3v13H8a3 3 0 01-3-3z"/><path d="M5 17a3 3 0 013-3h11"/>',
  exam: '<path d="M9 4h6v3H9z"/><path d="M7 5H5v16h14V5h-2"/><path d="M8.5 13l2.5 2.5 4.5-5"/>',
  feedback: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 10h8M8 13h5"/>',
  social: '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.2 10.8l7.6-3.6M8.2 13.2l7.6 3.6"/>',
  glossary: '<path d="M4 19V5a2 2 0 012-2h12v18H6a2 2 0 01-2-2z"/><path d="M8 7h6M8 11h6"/>',
  booklet: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 12h6M9 16h6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  pin: '<path d="M12 21s7-6.2 7-11.5A7 7 0 005 9.5C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  person: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0114 0"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v6H4V6h6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  chev: '<path d="M6 9l6 6 6-6"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-1.8-.3 1.6 1.6 0 00-1 1.5V21a2 2 0 01-4 0v-.1a1.6 1.6 0 00-1-1.5 1.6 1.6 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 00.3-1.8 1.6 1.6 0 00-1.5-1H3a2 2 0 010-4h.1a1.6 1.6 0 001.5-1 1.6 1.6 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 001.8.3H9a1.6 1.6 0 001-1.5V3a2 2 0 014 0v.1a1.6 1.6 0 001 1.5 1.6 1.6 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00-.3 1.8V9a1.6 1.6 0 001.5 1H21a2 2 0 010 4h-.1a1.6 1.6 0 00-1.5 1z"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20a7 7 0 0114 0"/><path d="M16 4.5a3.5 3.5 0 010 7M18 14a6 6 0 014 6"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/>',
  logout: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>',
  instagram: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.3" cy="6.7" r=".6" fill="currentColor"/>',
  facebook: '<path d="M14 8h3V4h-3a4 4 0 00-4 4v3H7v4h3v6h4v-6h3l1-4h-4V8.5a.5.5 0 01.5-.5z"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3M9 21h6"/>',
  policy: '<path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  award: '<circle cx="12" cy="9" r="5.5"/><path d="M8.5 13.5L7 21l5-2.5 5 2.5-1.5-7.5"/>',
  link: '<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/>',
};
export const icon = (name, cls = '') =>
  `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;

// תאריכים בעברית
const tz = 'Asia/Jerusalem';
export const todayISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
export const nowHM = () => new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
const d = iso => new Date(iso + 'T12:00:00Z');
export const fmtDate = iso => iso ? new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(d(iso)) : '';
export const fmtDayLong = iso => new Intl.DateTimeFormat('he-IL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(d(iso));
export const fmtWeekday = iso => new Intl.DateTimeFormat('he-IL', { weekday: 'long', timeZone: 'UTC' }).format(d(iso));
export const fmtDM = iso => new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'numeric', timeZone: 'UTC' }).format(d(iso));
export const hm = t => (t || '').slice(0, 5);
export const fmtRange = (a, b) => `${fmtDate(a)}${b && b !== a ? ' – ' + fmtDate(b) : ''}`;
export const fmtDateTime = ts => ts ? new Intl.DateTimeFormat('he-IL', { dateStyle: 'short', timeStyle: 'short', timeZone: tz }).format(new Date(ts)) : '';

// הודעה קופצת
let toastT;
export function toast(msg, bad = false) {
  $('.toast')?.remove(); clearTimeout(toastT);
  const t = document.createElement('div'); t.className = 'toast' + (bad ? ' bad' : ''); t.setAttribute('role', 'status'); t.textContent = msg;
  document.body.appendChild(t); toastT = setTimeout(() => t.remove(), 3600);
}

// חלון (sheet). מחזיר את האלמנט; close() לסגירה.
export function sheet(html, { wide = false, onClose } = {}) {
  const el = document.createElement('div');
  el.className = 'sheet'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
  el.innerHTML = `<div class="sheet-bg"></div><div class="sheet-box${wide ? ' wide' : ''}">${html}</div>`;
  const prev = document.activeElement;
  const close = () => { el.remove(); document.removeEventListener('keydown', onKey); prev?.focus?.(); onClose?.(); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  el.querySelector('.sheet-bg').addEventListener('click', close);
  el.addEventListener('click', e => { if (e.target.closest('[data-close]')) close(); });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(el);
  setTimeout(() => (el.querySelector('input,select,textarea,button:not([data-close])') || el.querySelector('button'))?.focus(), 30);
  el.close = close;
  return el;
}

export function confirmBox(text, okLabel = 'אישור', danger = false) {
  return new Promise(res => {
    const el = sheet(`<h3>${esc(text)}</h3><div class="btnrow" style="margin-top:18px">
      <button class="btn ${danger ? 'danger' : 'solid'}" data-ok>${esc(okLabel)}</button><button class="btn ghost" data-close>ביטול</button></div>`,
      { onClose: () => res(false) });
    el.querySelector('[data-ok]').addEventListener('click', () => { res(true); el.close(); });
  });
}

// כתובת חיצונית בטוחה (http/https בלבד)
export const safeUrl = u => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : null; } catch { return null; } };

// ייצוא CSV שנפתח ב-Excel בעברית (UTF-8 עם BOM)
export function downloadCSV(filename, rows) {
  const cell = v => { const s = v == null ? '' : String(v); return /[",\n\r]/.test(s) || /^[=+\-@]/.test(s) ? '"' + (/^[=+\-@]/.test(s) ? "'" : '') + s.replace(/"/g, '""') + '"' : s; };
  const csv = '﻿' + rows.map(r => r.map(cell).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = filename; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

export const BLOCK_COLORS = 6;
export function blockClass(name, order) {
  const i = order.indexOf(name);
  return 'blk-' + ((i < 0 ? 0 : i) % BLOCK_COLORS);
}
export const isBreak = t => /^(הפסקה|ארוחת)/.test((t || '').trim());

export const FOOTER_TEXT = 'פותח ע״י מדור הדרכה מרכז תע״ץ';

export function demoBanner(store, extra = '') {
  if (store.mode !== 'demo') return;
  document.body.classList.add('has-demo');
  const b = document.createElement('div');
  b.className = 'demo-banner';
  b.innerHTML = `<b>תצוגת הדגמה</b> · לא מחובר למסד נתונים. שינויים נשמרים רק בדפדפן הזה, לא משותפים ולא מאובטחים. ${extra}`;
  document.body.prepend(b);
  const fit = () => document.documentElement.style.setProperty('--demo-h', b.offsetHeight + 'px');
  fit(); addEventListener('resize', fit);
  if (window.ResizeObserver) new ResizeObserver(fit).observe(b);
}

// בדיקת תקינות ת"ז (ספרת ביקורת). מחזיר 9 ספרות או null. בדיקת תקינות בלבד — לא אימות זהות. השרת בודק שוב.
export function normIlId(v) {
  const s = String(v ?? '').replace(/[\s-]/g, '');
  if (!/^\d{5,9}$/.test(s)) return null;
  const d = s.padStart(9, '0');
  if (d === '000000000') return null;
  let sum = 0;
  for (let i = 0; i < 9; i++) { let x = +d[i] * (i % 2 ? 2 : 1); sum += x > 9 ? x - 9 : x; }
  return sum % 10 === 0 ? d : null;
}

// טווח תאריכים בעברית: "2–5 בנובמבר 2026"
export function fmtHebRange(a, b) {
  if (!a) return '';
  const da = new Date(a + 'T12:00:00Z'), db = new Date((b || a) + 'T12:00:00Z');
  const month = x => new Intl.DateTimeFormat('he-IL', { month: 'long', timeZone: 'UTC' }).format(x);
  const day = x => x.getUTCDate(), yr = x => x.getUTCFullYear();
  if (!b || a === b) return `${day(da)} ב${month(da)} ${yr(da)}`;
  if (yr(da) === yr(db) && da.getUTCMonth() === db.getUTCMonth()) return `${day(da)}–${day(db)} ב${month(da)} ${yr(da)}`;
  if (yr(da) === yr(db)) return `${day(da)} ב${month(da)} – ${day(db)} ב${month(db)} ${yr(da)}`;
  return `${day(da)} ב${month(da)} ${yr(da)} – ${day(db)} ב${month(db)} ${yr(db)}`;
}

// טעינת ספרייה חיצונית (cdnjs) רק כשצריך
const loaded = {};
export function loadScript(src) {
  return loaded[src] ||= new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = src; s.crossOrigin = 'anonymous';
    s.onload = res; s.onerror = () => rej(new Error('לא ניתן לטעון רכיב נדרש. בדקו את החיבור לאינטרנט.'));
    document.head.appendChild(s);
  });
}
export const LIBS = {
  jspdf: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  xlsx: 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
};

// ייצוא ל-Excel (xlsx) מימין לשמאל. עמודות שמסומנות כטקסט (כמו ת"ז) נשמרות כטקסט ושומרות אפסים מובילים.
export async function downloadXLSX(filename, sheetName, header, rows, textCols = []) {
  await loadScript(LIBS.xlsx);
  const X = window.XLSX;
  const ws = X.utils.aoa_to_sheet([header, ...rows]);
  for (let r = 1; r <= rows.length; r++) for (const c of textCols) {
    const ref = X.utils.encode_cell({ r, c }); if (ws[ref]) { ws[ref].t = 's'; ws[ref].v = String(ws[ref].v); ws[ref].z = '@'; }
  }
  ws['!cols'] = header.map((h, i) => ({ wch: Math.min(60, Math.max(10, String(h).length + 2, ...rows.map(r => String(r[i] ?? '').length + 2))) }));
  const wb = X.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };
  X.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  X.writeFile(wb, filename);
}
