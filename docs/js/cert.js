// טופס סיום קורס: עיצוב ממותג (A4 לרוחב), מצויר על canvas — אותה תמונה בתצוגה ובקובץ ה-PDF.
// הקובץ נוצר בדפדפן בזמן ההורדה ואינו נשמר באחסון.
// החתימה היא תמונה של חתימה בכתב יד שהמנהלת העלתה — לא חתימה דיגיטלית מאומתת.
import { fmtHebRange, fmtDate, loadScript, LIBS } from './ui.js';
import { hebRange } from './hebdate.js';

const W = 1123, H = 794; // A4 לרוחב ב-96dpi
const C = { deep: '#003652', navy: '#074B7A', navy2: '#0A4979', blue: '#2070A0', amber: '#FFB75C', ink: '#0D2534', muted: '#5B7080', line: '#D9E3EC', tint: '#F4F8FB' };
const FONT = "Assistant, 'Segoe UI', Arial, sans-serif";
const score = v => v == null || v === '' ? '—' : (Math.round(Number(v) * 10) / 10).toString();

const imgCache = {};
const loadImg = src => imgCache[src] ||= new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
async function ready() {
  try { await Promise.all(['300', '400', '600', '700', '800'].map(w => document.fonts.load(`${w} 40px Assistant`, 'אבג'))); } catch { /* fallback fonts */ }
}

// ---------- תעודת גמר לפי תבנית המנהלת (A4 לאורך) ----------
// התבנית (תמונת רקע של ה-PDF המקורי) נשמרת באזור המוגן במסד הנתונים ואינה חלק מהאתר.
// כל המידות בנקודות PDF (595.5×842.25), כפי שנמדדו בתבנית.
const TP = { W: 595.5, H: 842.25, blue: '#0A4A7A', ink: '#000000', muted: '#5B7080' };
const LTR = s => `⁦${s}⁩`;   // בידוד כיווניות למספרים (2–5, ת״ז)
const gregRange = (a, b) => fmtHebRange(a, b).replace(/(\d+)–(\d+)/, (m, p, q) => LTR(`${p}–${q}`));
async function drawTemplateCert(d, { watermark = '', scale = 300 / 72, signatureSlot = false } = {}) {
  await ready();
  const [bg, sig] = await Promise.all([loadImg(d.template), d.signature ? loadImg(d.signature) : null]);
  if (!bg) throw new Error('cert_template_missing');
  const cv = document.createElement('canvas');
  cv.width = Math.round(TP.W * scale); cv.height = Math.round(TP.H * scale);
  const x = cv.getContext('2d');
  x.drawImage(bg, 0, 0, cv.width, cv.height);
  x.scale(scale, scale);
  x.direction = 'rtl';
  const text = (s, pt, weight, color, cx, y, { align = 'center', maxW = 0 } = {}) => {
    let size = pt; x.font = `${weight} ${size}px ${FONT}`;
    while (maxW && x.measureText(s).width > maxW && size > 8) { size -= .5; x.font = `${weight} ${size}px ${FONT}`; }
    x.fillStyle = color; x.textAlign = align; x.textBaseline = 'alphabetic'; x.fillText(s, cx, y);
  };
  // הסרת "דרגה" והחלפת "מ.א / מ.ע" ב"תעודת זהות" (הרקע שם לבן)
  x.fillStyle = '#fff'; x.fillRect(226, 441, 49, 25); x.fillRect(357, 440, 85, 26);
  text('תעודת זהות', 20, 300, TP.ink, 436, 461, { align: 'right' });
  // פרטי המשתתף/ת מעל הקו
  text(d.full_name || '', 21, 700, TP.blue, 92, 416, { maxW: 148 });
  if (d.id_number) text(LTR(String(d.id_number)), 21, 700, TP.blue, 399, 416, { maxW: 110 });
  // תאריכי הקורס (לועזי ועברי) מתחת ל"שנערך בין התאריכים"
  if (d.start_date) {
    text(gregRange(d.start_date, d.end_date), 22, 600, TP.blue, 241, 670, { maxW: 400 });
    text(hebRange(d.start_date, d.end_date), 22, 600, TP.blue, 241, 698, { maxW: 400 });
  }
  // מחזור וציון — שורה קטנה מתחת לתאריכים
  const extra = [d.cohort_name, d.final_score != null && d.final_score !== '' ? `ציון המבחן: ${LTR(score(d.final_score))}` : ''].filter(Boolean).join(' · ');
  if (extra && d.showExtra !== false) text(extra, 13.5, 400, TP.muted, 241, 724, { maxW: 400 });
  // חתימה בכתב יד (רק אם הועלה קובץ) מעל שם החותם שבתבנית
  if (sig) { const r = Math.min(170 / sig.width, 42 / sig.height); x.drawImage(sig, 112 - sig.width * r / 2, 777 - sig.height * r, sig.width * r, sig.height * r); }
  else if (signatureSlot) {
    x.save(); x.setLineDash([3, 3]); x.strokeStyle = '#9FB3C4'; x.lineWidth = .8; x.strokeRect(27, 735, 170, 42); x.restore();
    text('מקום לחתימה', 10, 400, '#9FB3C4', 112, 760);
  }
  // מספר תעודה, גרסה ותאריך הפקה — קטן, בתחתית
  const meta = [d.cert_no ? `מס׳ תעודה ${LTR(d.cert_no)}` : '', d.version > 1 ? `גרסה ${d.version}` : '', d.issued_at ? `הופקה ${LTR(fmtDate(String(d.issued_at).slice(0, 10)))}` : ''].filter(Boolean).join(' · ');
  if (meta) text(meta, 8, 400, TP.muted, 458, 831, { align: 'right' });
  if (watermark) { x.save(); x.translate(TP.W * .42, TP.H * .5); x.rotate(-30 * Math.PI / 180); text(watermark, 110, 800, 'rgba(132,0,50,.10)', 0, 35); x.restore(); }
  return cv;
}

export async function drawCert(d, opts = {}) {
  if (d.template) return drawTemplateCert(d, opts);
  const { watermark = '', scale = 2 } = opts;
  await ready();
  const [logo, sig] = await Promise.all([loadImg(new URL('../assets/logo-512.png', import.meta.url).href), d.signature ? loadImg(d.signature) : null]);
  const cv = document.createElement('canvas');
  cv.width = Math.round(W * scale); cv.height = Math.round(H * scale);
  const x = cv.getContext('2d');
  x.scale(scale, scale);
  x.direction = 'rtl';
  const text = (s, px, weight, color, cx, y, { align = 'center', maxW = 0, spacing = 0 } = {}) => {
    let size = px;
    x.font = `${weight} ${size}px ${FONT}`;
    if ('letterSpacing' in x) x.letterSpacing = spacing ? `${spacing}px` : '0px';
    while (maxW && x.measureText(s).width > maxW && size > 14) { size -= 1; x.font = `${weight} ${size}px ${FONT}`; }
    x.fillStyle = color; x.textAlign = align; x.textBaseline = 'alphabetic';
    x.fillText(s, cx, y);
    return x.measureText(s).width;
  };

  // רקע ומסגרות
  x.fillStyle = '#fff'; x.fillRect(0, 0, W, H);
  x.strokeStyle = C.deep; x.lineWidth = 14; x.strokeRect(7, 7, W - 14, H - 14);
  x.strokeStyle = C.amber; x.lineWidth = 2; x.strokeRect(23, 23, W - 46, H - 46);
  // פס צד ממותג
  const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, C.deep); g.addColorStop(.55, C.navy); g.addColorStop(1, C.blue);
  x.fillStyle = g; x.fillRect(W - 150, 0, 150, H);
  x.fillStyle = C.amber; x.fillRect(W - 158, 0, 8, H);
  x.fillStyle = '#fff'; x.beginPath(); x.arc(W - 75, 110, 51, 0, Math.PI * 2); x.fill();
  if (logo) x.drawImage(logo, W - 75 - 42, 110 - 42, 84, 84);
  text('מרכז תע״ץ', 15, 700, '#CFE4F1', W - 75, H - 74);
  text('מדור הדרכה', 13, 700, C.amber, W - 75, H - 52);

  // סימן מים (דוגמה / טיוטה)
  if (watermark) {
    x.save(); x.translate(W * .42, H / 2); x.rotate(-18 * Math.PI / 180);
    text(watermark, 120, 800, 'rgba(132,0,50,.10)', 0, 40); x.restore();
  }

  // תוכן
  const cx = (70 + (W - 200)) / 2, maxW = (W - 200) - 70 - 40;
  let y = 100;
  text('מרכז תעסוקת עובדי צה״ל', 17, 700, C.blue, cx, y, { spacing: 5 });
  y += 78; text('טופס סיום קורס', 54, 800, C.deep, cx, y, { maxW });
  y += 30; x.fillStyle = C.amber; x.fillRect(cx - 45, y, 90, 4);
  y += 56; text('מאשרים בזאת כי', 21, 400, C.muted, cx, y);
  y += 64; text(d.full_name || '', 46, 800, C.navy, cx, y, { maxW });
  if (d.id_number) { y += 30; text(`ת״ז ${d.id_number}`, 17, 400, C.muted, cx, y); }
  y += 52; text('השלים/ה את', 21, 400, C.muted, cx, y);
  y += 50; text(d.course_title || 'קורס קציני משא״ן ע״צ', 32, 800, C.deep, cx, y, { maxW });
  y += 42; text(`${d.cohort_name || ''}${d.start_date ? ' · ' + fmtHebRange(d.start_date, d.end_date) : ''}`, 21, 400, C.ink, cx, y, { maxW });
  // תיבת ציון
  x.font = `700 19px ${FONT}`; const lw = x.measureText('ציון המבחן').width;
  x.font = `800 34px ${FONT}`; const sw = x.measureText(score(d.final_score)).width;
  const bw = lw + sw + 18 + 56, bh = 58, by = y + 28, bx = cx - bw / 2;
  x.fillStyle = C.tint; x.strokeStyle = C.line; x.lineWidth = 2;
  x.beginPath(); x.roundRect ? x.roundRect(bx, by, bw, bh, 14) : x.rect(bx, by, bw, bh); x.fill(); x.stroke();
  text('ציון המבחן', 19, 700, C.muted, bx + bw - 28, by + 36, { align: 'right' });
  text(score(d.final_score), 34, 800, C.deep, bx + 28, by + 41, { align: 'left' });

  // חתימה
  const sx = 70, sWidth = 300, lineY = H - 128;
  if (sig) {
    const r = Math.min(240 / sig.width, 78 / sig.height);
    x.drawImage(sig, sx + (sWidth - sig.width * r) / 2, lineY - 6 - sig.height * r, sig.width * r, sig.height * r);
  }
  x.fillStyle = C.ink; x.fillRect(sx, lineY, sWidth, 2);
  text(d.signer_name || '', 19, 800, C.deep, sx + sWidth / 2, lineY + 30, { maxW: sWidth });
  text(d.signer_title || '', 16, 400, C.muted, sx + sWidth / 2, lineY + 54, { maxW: sWidth });

  // מספר טופס ותאריך הפקה
  const rx = W - 200;
  if (d.cert_no) text(`מס׳ טופס: ${d.cert_no}${d.version > 1 ? ` · גרסה ${d.version}` : ''}`, 13, 400, C.muted, rx, lineY + 30, { align: 'right' });
  if (d.issued_at) text(`תאריך הפקה: ${fmtDate(String(d.issued_at).slice(0, 10))}`, 13, 400, C.muted, rx, lineY + 52, { align: 'right' });
  return cv;
}

// תצוגה מוקטנת בתוך אלמנט (רספונסיבי)
export async function mountPreview(host, d, opts = {}) {
  host.innerHTML = '<p class="muted small">מכין תצוגה…</p>';
  const cv = await drawCert(d, { ...opts, scale: d.template ? 2.2 : 1.6 });
  cv.style.cssText = 'width:100%;height:auto;display:block;border-radius:10px;box-shadow:0 10px 30px -14px rgba(0,54,82,.45)' + (d.template ? ';max-width:560px;margin-inline:auto' : '');
  cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', `טופס סיום קורס – ${d.full_name || ''}`);
  host.innerHTML = ''; host.appendChild(cv);
}

// הפקת PDF (עמוד לכל טופס)
export async function downloadPDF(list, filename, opts = {}) {
  await loadScript(LIBS.jspdf);
  const { jsPDF } = window.jspdf;
  const pdf = await buildPDF(list, opts);
  pdf.save(filename);
}
// מסמך PDF (עמוד לכל תעודה): תבנית המנהלת — A4 לאורך ב-300dpi; העיצוב הקודם — A4 לרוחב
export async function buildPDF(list, opts = {}) {
  await loadScript(LIBS.jspdf);
  const { jsPDF } = window.jspdf;
  const portrait = !!list[0]?.template, orient = portrait ? 'portrait' : 'landscape';
  const pdf = new jsPDF({ orientation: orient, unit: 'mm', format: 'a4', compress: true });
  for (let i = 0; i < list.length; i++) {
    const cv = await drawCert(list[i], { ...opts, scale: list[i].template ? 300 / 72 : 2.5 });
    if (i) pdf.addPage('a4', orient);
    pdf.addImage(cv.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, portrait ? 210 : 297, portrait ? 297 : 210);
  }
  pdf.setProperties({ title: portrait ? 'תעודת גמר' : 'טופס סיום קורס', creator: 'מדור הדרכה מרכז תע״ץ' });
  return pdf;
}
export const certFileName = d => `${d.template ? 'תעודת גמר' : 'טופס סיום'} - ${String(d.full_name || 'משתתף').replace(/[\\/:*?"<>|]/g, '')} - ${d.cohort_name || ''}.pdf`;
