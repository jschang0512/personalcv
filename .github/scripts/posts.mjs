// Helpers for scheduled / instant blog publishing (run by GitHub Actions).
//
//   node posts.mjs due <lastBuildISO>   -> prints posts whose publish time is in (lastBuild, now]
//   node posts.mjs publish-now <path>   -> sets date to now and published: true in that post
//
// Post dates are written by Pages CMS as "yyyy-MM-dd HH:mm" in the site timezone (Asia/Taipei).
import fs from 'node:fs';
import path from 'node:path';

const TZ_OFFSET = '+08:00'; // must match `timezone` in _config.yml
const POSTS_DIR = '_posts';

function splitFrontMatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/.exec(text);
  if (!m) return null;
  return { fm: m[1], rest: text.slice(m[0].length), eol: text.includes('\r\n') ? '\r\n' : '\n' };
}

function field(fm, key) {
  const m = new RegExp('^' + key + ':[ \\t]*(.*)$', 'm').exec(fm);
  return m ? m[1].trim().replace(/^(['"])(.*)\1$/, '$2') : undefined;
}

function parseDate(value) {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?\s*(Z|[+-]\d{2}:?\d{2})?$/.exec(value);
  if (!m) return null;
  const [, y, mo, d, h = '00', mi = '00', s = '00', tz] = m;
  const offset = tz ? (tz === 'Z' ? 'Z' : tz.replace(/^([+-]\d{2})(\d{2})$/, '$1:$2')) : TZ_OFFSET;
  const t = new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}${offset}`);
  return isNaN(t) ? null : t;
}

function nowInSiteTz() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date());
  const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

function listPosts() {
  if (!fs.existsSync(POSTS_DIR)) return [];
  return fs.readdirSync(POSTS_DIR)
    .filter(f => /\.(md|markdown|html)$/i.test(f))
    .map(f => {
      const file = path.join(POSTS_DIR, f);
      const parsed = splitFrontMatter(fs.readFileSync(file, 'utf8'));
      if (!parsed) return null;
      const published = field(parsed.fm, 'published');
      const fromName = /^(\d{4}-\d{2}-\d{2})-/.exec(f);
      return {
        file,
        title: field(parsed.fm, 'title') || f,
        published: published !== 'false',
        date: parseDate(field(parsed.fm, 'date')) || (fromName ? parseDate(fromName[1]) : null)
      };
    })
    .filter(Boolean);
}

function due(lastBuildIso) {
  const since = new Date(lastBuildIso || 0);
  const now = new Date();
  const hits = listPosts().filter(p => p.published && p.date && p.date > since && p.date <= now);
  hits.forEach(p => console.log(`${p.date.toISOString()}  ${p.file}  ${p.title}`));
  return hits.length;
}

function publishNow(target) {
  const rel = path.posix.normalize(String(target || '').replace(/\\/g, '/'));
  if (!rel.startsWith(POSTS_DIR + '/') || rel.includes('..') || !/\.(md|markdown|html)$/i.test(rel)) {
    throw new Error(`Refusing to edit "${target}": not a post in ${POSTS_DIR}/`);
  }
  if (!fs.existsSync(rel)) throw new Error(`Post not found: ${rel} (save it in Pages CMS first)`);
  const text = fs.readFileSync(rel, 'utf8');
  const parsed = splitFrontMatter(text);
  if (!parsed) throw new Error(`No front matter in ${rel}`);
  const stamp = nowInSiteTz();
  let fm = parsed.fm;
  const set = (key, value) => {
    const re = new RegExp('^' + key + ':.*$', 'm');
    fm = re.test(fm) ? fm.replace(re, `${key}: ${value}`) : fm + parsed.eol + `${key}: ${value}`;
  };
  set('date', `"${stamp}"`);
  set('published', 'true');
  fs.writeFileSync(rel, `---${parsed.eol}${fm}${parsed.eol}---${parsed.eol}${parsed.rest}`);
  console.log(`Published ${rel} at ${stamp} (Asia/Taipei)`);
}

const [cmd, arg] = process.argv.slice(2);
if (cmd === 'due') {
  const n = due(arg);
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `count=${n}\n`);
} else if (cmd === 'publish-now') {
  publishNow(arg);
} else {
  console.error('usage: posts.mjs due <lastBuildISO> | publish-now <path>');
  process.exit(2);
}
