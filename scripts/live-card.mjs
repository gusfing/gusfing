// Renders assets for the "live" panel on the profile README from public GitHub activity.
import { mkdirSync, writeFileSync } from 'node:fs';

const USER = process.env.GH_USER || 'gusfing';
const TOKEN = process.env.GITHUB_TOKEN;
const OUT = process.argv[2] || 'live';
const TZ = 'Asia/Kolkata';
const SLEEP_FROM = 4, SLEEP_TO = 11; // local hours

const api = async (path) => {
  const r = await fetch(`https://api.github.com/${path}`, {
    headers: { Accept: 'application/vnd.github+json', ...(TOKEN && { Authorization: `Bearer ${TOKEN}` }) },
  });
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
};

const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);
const dayKey = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);

function ago(ms) {
  const m = Math.round(ms / 60000);
  if (m < 60) return m <= 1 ? 'just now' : `${m} minutes ago`;
  const h = Math.round(m / 60);
  if (h < 24) return h === 1 ? 'an hour ago' : `${h} hours ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

const now = new Date();
let events = [];
for (let page = 1; page <= 3; page++) {
  const batch = await api(`users/${USER}/events/public?per_page=100&page=${page}`).catch(() => []);
  events.push(...batch);
  if (batch.length < 100) break;
}
const pushes = events.filter((e) => e.type === 'PushEvent');

// Last shipped: newest push outside the profile repo itself.
let last = null;
for (const e of pushes) {
  if (e.repo.name.toLowerCase() === `${USER}/${USER}`.toLowerCase()) continue;
  let message = '';
  try {
    const c = await api(`repos/${e.repo.name}/commits/${e.payload.head}`);
    message = c.commit.message.split('\n')[0];
  } catch {}
  last = { repo: e.repo.name.split('/')[1], message, at: new Date(e.created_at) };
  break;
}

// Last 30 local days with at least one public push.
const shipped = new Set(pushes.map((e) => dayKey(new Date(e.created_at))));
const days = [...Array(30)].map((_, i) => dayKey(new Date(now - (29 - i) * 864e5)));
const active = days.map((d) => shipped.has(d));
const count = active.filter(Boolean).length;

const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now).map((p) => [p.type, p.value]));
const hour = +parts.hour;
const asleep = hour >= SLEEP_FROM && hour < SLEEP_TO;
const clock = `${parts.hour}:${parts.minute}`;

const themes = {
  dark: { bg: '#0d1117', line: '#30363d', ink: '#f0f6fc', muted: '#9198a1', accent: '#4493f8', empty: '#151b23', sleep: '#8b949e' },
  light: { bg: '#ffffff', line: '#d1d9e0', ink: '#1f2328', muted: '#59636e', accent: '#0969da', empty: '#eff2f5', sleep: '#818b98' },
};
const sans = "-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Helvetica,Arial,sans-serif";
const mono = "ui-monospace,SFMono-Regular,'SF Mono',Menlo,Consolas,monospace";

const headline = last ? `Last shipped to ${esc(last.repo)}` : 'Quiet on public repos lately';
const detail = last ? esc(clip(last.message || 'new commits', 62)) : 'Working in private repos.';
const when = last ? ago(now - last.at) : '';
const big = asleep ? 'Asleep' : 'Building';
const status = asleep ? `back at ${String(SLEEP_TO).padStart(2, '0')}:00  ·  as of ${clock} IST` : `awake  ·  as of ${clock} IST`;

mkdirSync(OUT, { recursive: true });
for (const [name, t] of Object.entries(themes)) {
  const cell = 14, gap = 4, gx = 64;
  const strip = active.map((on, i) => `<rect x="${gx + i * (cell + gap)}" y="176" width="${cell}" height="${cell}" rx="3" fill="${on ? t.accent : t.empty}"/>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="236" viewBox="0 0 1280 236" role="img" aria-label="${headline}. ${detail}. ${big}, ${status}. Shipped on ${count} of the last 30 days.">
<rect x="0.5" y="0.5" width="1279" height="235" rx="12" fill="${t.bg}" stroke="${t.line}"/>
<circle cx="70" cy="52" r="4" fill="${asleep ? t.sleep : t.accent}"/>
<text x="84" y="57" font-family="${mono}" font-size="13" letter-spacing="1.5" fill="${t.muted}">LIVE · REDRAWN EVERY HOUR</text>
<text x="64" y="102" font-family="${sans}" font-size="30" font-weight="600" letter-spacing="-0.6" fill="${t.ink}">${headline}</text>
<text x="64" y="136" font-family="${mono}" font-size="16" fill="${t.muted}">${detail}${when ? `  ·  ${when}` : ''}</text>
${strip}
<text x="${gx + 30 * (cell + gap) + 12}" y="188" font-family="${sans}" font-size="15" fill="${t.muted}">shipped ${count} of the last 30 days</text>
<line x1="880" y1="40" x2="880" y2="196" stroke="${t.line}"/>
<text x="1216" y="57" text-anchor="end" font-family="${mono}" font-size="13" letter-spacing="1.5" fill="${t.muted}">INDIA · IST</text>
<text x="1216" y="128" text-anchor="end" font-family="${sans}" font-size="52" font-weight="600" letter-spacing="-1.5" fill="${asleep ? t.sleep : t.ink}">${big}</text>
<text x="1216" y="168" text-anchor="end" font-family="${sans}" font-size="16" fill="${t.muted}">${status}</text>
</svg>`;
  writeFileSync(`${OUT}/live-${name}.svg`, svg);
}
console.log(JSON.stringify({ last, count, clock, asleep }));
