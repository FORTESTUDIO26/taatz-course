// בדיקת התאריך העברי של האתר (docs/js/hebdate.js) מול ספריית hebcal, לכל יום בשנים 2025–2032.
// הרצה: cd tools && node hebdate-test.mjs
import { HDate, months } from '@hebcal/core';
import { gematria, hebParts, hebDate, hebRange } from '../docs/js/hebdate.js';

let bad = 0, n = 0;
const MONTH_NUM = { 'ניסן': months.NISAN, 'אייר': months.IYYAR, 'סיוון': months.SIVAN, 'תמוז': months.TAMUZ, 'אב': months.AV, 'אלול': months.ELUL,
  'תשרי': months.TISHREI, 'חשוון': months.CHESHVAN, 'כסלו': months.KISLEV, 'טבת': months.TEVET, 'שבט': months.SHVAT,
  'אדר': months.ADAR_I, 'אדר א׳': months.ADAR_I, 'אדר ב׳': months.ADAR_II };
for (let t = Date.UTC(2025, 0, 1); t <= Date.UTC(2032, 11, 31); t += 86400000) {
  const iso = new Date(t).toISOString().slice(0, 10), [Y, M, D] = iso.split('-').map(Number);
  const h = new HDate(new Date(Y, M - 1, D)), p = hebParts(iso); n++;
  const ref = h.renderGematriya(true).split(' ');   // [יום, חודש..., שנה]
  const ok = p.day === h.getDate() && p.year === h.getFullYear() && MONTH_NUM[p.month] === h.getMonth()
    && gematria(p.day) === ref[0] && gematria(p.year % 1000) === ref[ref.length - 1];
  if (!ok) { bad++; if (bad < 10) console.log('✗', iso, hebDate(iso), '| hebcal:', h.renderGematriya(true), p); }
}
const cases = [['2026-11-02', '2026-11-05', 'כ״ב–כ״ה בחשוון תשפ״ז'], ['2026-06-22', '2026-06-25', 'ז׳–י׳ בתמוז תשפ״ו'], ['2026-09-10', '2026-09-13', 'כ״ח באלול תשפ״ו – ב׳ בתשרי תשפ״ז']];
for (const [a, b, want] of cases) { const got = hebRange(a, b); if (got !== want) { bad++; console.log('✗ טווח', a, b, got, '≠', want); } else console.log('✓', a, '–', b, '→', got); }
console.log(`${n} ימים נבדקו מול hebcal, ${bad} אי־התאמות`);
process.exit(bad ? 1 : 0);
