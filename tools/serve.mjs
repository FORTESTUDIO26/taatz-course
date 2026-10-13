// שרת מקומי לבדיקה: node tools/serve.mjs  → http://localhost:5173
// /__tools/ מגיש קבצי בדיקה מתיקיית tools, ו-/__sql/ את קובצי ההקמה (רק מקומית, לא חלק מהאתר המתפרסם).
// /__sql/ מתיר קריאה מ-supabase.com כדי לטעון את הקבצים לעורך ה-SQL בזמן ההקמה.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = fileURLToPath(new URL('.', import.meta.url));
const root = join(here, '..', 'docs');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };
const port = Number(process.env.PORT || 5173);
http.createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let base = root, cors = {};
  if (p.startsWith('/__tools/')) { base = here; p = p.slice('/__tools'.length); }
  if (p.startsWith('/__sql/')) {
    base = join(here, '..', 'supabase'); p = p.slice('/__sql'.length);
    cors = { 'access-control-allow-origin': 'https://supabase.com', 'access-control-allow-private-network': 'true', 'access-control-allow-methods': 'GET' };
    if (req.method === 'OPTIONS') { res.writeHead(204, cors).end(); return; }
  }
  if (p.endsWith('/')) p += 'index.html';
  const file = normalize(join(base, p));
  if (!file.startsWith(normalize(base))) { res.writeHead(403).end(); return; }
  try { const b = await readFile(file); res.writeHead(200, { 'content-type': types[extname(file)] || 'text/plain; charset=utf-8', 'cache-control': 'no-store', ...cors }).end(b); }
  catch { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('404'); }
}).listen(port, () => console.log(`http://localhost:${port}`));
