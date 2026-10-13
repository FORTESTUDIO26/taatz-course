// "הוספה למסך הבית": קיצור דרך לאתר (ללא חנות אפליקציות). אין חלון אוטומטי — רק כפתור בתחתית הדף.
// אין service worker ואין שמירה מקומית של תוכן: כל פתיחה טוענת את האתר העדכני מהאינטרנט.
import { sheet, toast } from './ui.js';

let deferred = null;   // אירוע ההתקנה של Chrome/Edge באנדרואיד (כשהדפדפן מאפשר)
addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; });
addEventListener('appinstalled', () => { deferred = null; document.querySelectorAll('[data-install]').forEach(b => b.closest('.install-row')?.remove()); });

const ua = navigator.userAgent || '';
const isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isIOSSafari = isIOS && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA|Instagram|FBAN|FBAV/.test(ua);
const isAndroid = /Android/.test(ua);
export const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

const NOTE = '<p class="small muted" style="margin-top:10px">זהו קיצור דרך לאתר הקורס — אין צורך בהורדה מחנות אפליקציות. האתר נטען מהאינטרנט בכל פתיחה, ולכן נדרש חיבור לרשת.</p>';
const steps = list => `<ol class="install-steps">${list.map(s => `<li>${s}</li>`).join('')}</ol>`;

export function installHTML() {
  if (isStandalone()) return '';
  return `<div class="install-row"><button type="button" class="btn ghost sm" data-install>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M12 8v6M9 11h6"/></svg>
    הוספה למסך הבית</button></div>`;
}

function instructions() {
  let body;
  if (isIOSSafari) body = steps(['לחצו על כפתור <b>השיתוף</b> <span aria-hidden="true">(ריבוע עם חץ למעלה)</span> בתחתית Safari.', 'גללו ובחרו <b>״הוספה למסך הבית״</b>.', 'אשרו בלחיצה על <b>״הוסף״</b>.']);
  else if (isIOS) body = `<p>באייפון, הוספה למסך הבית נעשית מ-Safari:</p>${steps(['פתחו את כתובת האתר ב-<b>Safari</b>.', 'לחצו על כפתור <b>השיתוף</b>.', 'בחרו <b>״הוספה למסך הבית״</b> ← <b>״הוסף״</b>.'])}`;
  else if (isAndroid) body = steps(['בדפדפן Chrome, פתחו את <b>התפריט ⋮</b> בפינה.', 'בחרו <b>״הוספה למסך הבית״</b> או <b>״התקנת אפליקציה״</b>.', 'אשרו בלחיצה על <b>״הוספה״</b>.']);
  else body = `<p>במחשב אפשר לשמור קיצור דרך דרך Chrome או Edge: בתפריט הדפדפן בוחרים <b>״התקנה״</b> / <b>״התקנת האתר כאפליקציה״</b>, או פשוט מוסיפים את האתר למועדפים.</p>
    <p>בטלפון: באנדרואיד — תפריט ⋮ ← ״הוספה למסך הבית״. באייפון — Safari ← שיתוף ← ״הוספה למסך הבית״.</p>`;
  sheet(`<h3>הוספה למסך הבית</h3>${body}${NOTE}<div class="btnrow" style="margin-top:12px"><button class="btn ghost" data-close>סגירה</button></div>`);
}

export async function handleInstallClick(e) {
  if (!e.target.closest('[data-install]')) return false;
  if (deferred) {
    const ev = deferred; deferred = null;
    try { ev.prompt(); const r = await ev.userChoice; if (r?.outcome === 'accepted') toast('האתר נוסף למסך הבית'); }
    catch { instructions(); }
  } else instructions();
  return true;
}
