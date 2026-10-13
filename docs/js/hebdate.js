// תאריך עברי באותיות (כ״ב בחשוון תשפ״ז) — מחושב בלוח העברי המובנה בדפדפן (Intl), ונבדק מול ספריית hebcal
// (tools/hebdate-test.mjs). ללא תלות חיצונית באתר.

const ONES = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'];
const TENS = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'];
const HUNDREDS = ['', 'ק', 'ר', 'ש', 'ת'];

// מספר (1–999) באותיות עם גרש/גרשיים: 22 → כ״ב, 15 → ט״ו, 787 → תשפ״ז
export function gematria(n) {
  let s = '', h = Math.floor(n / 100) % 10;
  while (h > 4) { s += 'ת'; h -= 4; }
  s += HUNDREDS[h];
  const r = n % 100;
  s += r === 15 ? 'טו' : r === 16 ? 'טז' : TENS[Math.floor(r / 10)] + ONES[r % 10];
  return s.length > 1 ? s.slice(0, -1) + '״' + s.slice(-1) : s + '׳';
}

const fmt = new Intl.DateTimeFormat('he-u-ca-hebrew', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
// iso = 'YYYY-MM-DD' (תאריך לוח, בלי שעה)
export function hebParts(iso) {
  const p = Object.fromEntries(fmt.formatToParts(new Date(`${String(iso).slice(0, 10)}T12:00:00Z`)).map(x => [x.type, x.value]));
  return { day: Number(p.day), month: p.month, year: Number(p.year) };
}
export const hebDate = iso => { const p = hebParts(iso); return `${gematria(p.day)} ב${p.month} ${gematria(p.year % 1000)}`; };

// טווח תאריכים: כ״ב–כ״ה בחשוון תשפ״ז · כ״ח בחשוון – ב׳ בכסלו תשפ״ז · כ״ט באלול תשפ״ו – א׳ בתשרי תשפ״ז
export function hebRange(start, end) {
  if (!end || end === start) return hebDate(start);
  const a = hebParts(start), b = hebParts(end), y = n => gematria(n % 1000);
  if (a.year !== b.year) return `${hebDate(start)} – ${hebDate(end)}`;
  if (a.month !== b.month) return `${gematria(a.day)} ב${a.month} – ${gematria(b.day)} ב${b.month} ${y(b.year)}`;
  return `${gematria(a.day)}–${gematria(b.day)} ב${a.month} ${y(a.year)}`;
}
