// Builds the contribution graph + link pills for the GitHub profile README.
// Runs daily via .github/workflows/update-graph.yml. No dependencies (Node 20+).
//
//   GITHUB_TOKEN=... node scripts/build.mjs        -> real data
//   node scripts/build.mjs --sample                -> fake data, for previewing

import { writeFileSync, mkdirSync } from "node:fs";

// ---------- edit these ----------
const USER = "Nimay25";
const LINKS = [
  { id: "email",    icon: "mail",     label: "nimayanki@gmail.com", href: "mailto:nimayanki@gmail.com" },
  { id: "linkedin", icon: "linkedin", label: "Nimay Ankireddypalli", href: "https://www.linkedin.com/in/nimayankireddypalli/" },
  { id: "rallo",    icon: "globe",    label: "rallocoach.com",       href: "https://rallocoach.com" },
];
// --------------------------------

const OUT = new URL("../assets/", import.meta.url);
mkdirSync(OUT, { recursive: true });

const THEMES = {
  dark:  { bg: "#0d1117", text: "#f0f6fc", muted: "#9198a1", line: "#3fb950", up: "#3fb950", down: "#f85149",
           cell: "#ffffff", cellOp: [0.035, 0.07, 0.11, 0.16, 0.22], rule: "#3d444d", pillBg: "#151b23", pillBorder: "#3d444d" },
  light: { bg: "#ffffff", text: "#1f2328", muted: "#59636e", line: "#1a7f37", up: "#1a7f37", down: "#cf222e",
           cell: "#1f2328", cellOp: [0.03, 0.06, 0.1, 0.15, 0.2], rule: "#d1d9e0", pillBg: "#f6f8fa", pillBorder: "#d1d9e0" },
};

// ---------- data ----------
async function gql(query, variables) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${process.env.GITHUB_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

async function fetchDays() {
  const { user } = await gql(`query($u:String!){ user(login:$u){ createdAt } }`, { u: USER });
  const start = new Date(user.createdAt);
  const now = new Date();
  const days = new Map();
  // GitHub only allows one year per contributionsCollection call
  for (let from = new Date(start); from < now; ) {
    const to = new Date(Math.min(now, new Date(from).setFullYear(from.getFullYear() + 1)));
    const d = await gql(
      `query($u:String!,$f:DateTime!,$t:DateTime!){ user(login:$u){ contributionsCollection(from:$f,to:$t){
         contributionCalendar{ weeks{ contributionDays{ date contributionCount } } } } } }`,
      { u: USER, f: from.toISOString(), t: to.toISOString() });
    for (const w of d.user.contributionsCollection.contributionCalendar.weeks)
      for (const day of w.contributionDays) days.set(day.date, day.contributionCount);
    from = to;
  }
  return [...days.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date, count }));
}

function sampleDays() {
  // quiet for a while, then ramps up hard over the last few months
  const out = [];
  const end = new Date();
  for (let i = 729; i >= 0; i--) {
    const d = new Date(end); d.setDate(d.getDate() - i);
    const t = (729 - i) / 729;
    const base = t < 0.6 ? 0.6 : Math.pow((t - 0.6) / 0.4, 2.2) * 60;
    const noise = Math.random() < 0.3 ? 0 : Math.random() * base * 1.6;
    out.push({ date: d.toISOString().slice(0, 10), count: Math.round(noise) });
  }
  return out;
}

// ---------- stats ----------
function stats(days) {
  const sum = (a) => a.reduce((s, d) => s + d.count, 0);
  const last365 = days.slice(-365), prev365 = days.slice(-730, -365), last90 = days.slice(-90);
  const thisYear = sum(last365), lastYear = sum(prev365);
  return {
    thisYear,
    change: lastYear > 0 ? ((thisYear - lastYear) / lastYear) * 100 : null,
    allTime: sum(days),
    last90: sum(last90),
    avg90: Math.round(sum(last90) / 90),
    best: Math.max(0, ...days.map((d) => d.count)),
    window: last365,
  };
}

// ---------- svg helpers ----------
const fmt = (n) => n.toLocaleString("en-US");
const FONT = `-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans',Helvetica,Arial,sans-serif`;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

function graphSvg(s, th) {
  const W = 840, H = 300;
  const cx = 0, cy = 92, cw = W, ch = 128;        // chart box
  const days = s.window;

  // faint heatmap grid behind the line (53 weeks x 7 days)
  const cols = Math.ceil(days.length / 7), gap = 3;
  const cell = (cw - gap * (cols - 1)) / cols;
  const rowH = (ch - gap * 6) / 7;
  const max = Math.max(1, ...days.map((d) => d.count));
  let grid = "";
  days.forEach((d, i) => {
    const c = Math.floor(i / 7), r = i % 7;
    const lvl = d.count === 0 ? 0 : Math.min(4, 1 + Math.floor((d.count / max) * 4));
    grid += `<rect x="${(cx + c * (cell + gap)).toFixed(1)}" y="${(cy + r * (rowH + gap)).toFixed(1)}" width="${cell.toFixed(1)}" height="${rowH.toFixed(1)}" rx="2" fill="${th.cell}" fill-opacity="${th.cellOp[lvl]}"/>`;
  });

  // 7-day rolling average -> smooth line
  const roll = days.map((_, i) => {
    const w = days.slice(Math.max(0, i - 6), i + 1);
    return w.reduce((a, d) => a + d.count, 0) / w.length;
  });
  const rmax = Math.max(1, ...roll);
  const pts = roll.map((v, i) => [cx + (i / (roll.length - 1)) * cw, cy + ch - 2 - (v / rmax) * (ch - 8)]);
  let path = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], mx = (x0 + x1) / 2;
    path += ` C${mx.toFixed(1)},${y0.toFixed(1)} ${mx.toFixed(1)},${y1.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
  }
  const [ex, ey] = pts[pts.length - 1];

  const change = s.change === null ? "" :
    `<text x="0" y="68" font-size="15" font-weight="600" fill="${s.change >= 0 ? th.up : th.down}">${s.change >= 0 ? "+" : ""}${fmt(Math.round(s.change))}%<tspan fill="${th.muted}" font-weight="400" dx="8">vs previous year</tspan></text>`;

  const stat = (x, label, val) =>
    `<text x="${x}" y="${cy + ch + 34}" font-size="12" fill="${th.muted}">${label}</text>` +
    `<text x="${x}" y="${cy + ch + 58}" font-size="19" font-weight="600" fill="${th.text}">${val}</text>`;

  const lineLen = 4000;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}">
<style>
  .ln { stroke-dasharray:${lineLen}; stroke-dashoffset:${lineLen}; animation: draw 2.2s ease-out forwards; }
  .dot { opacity:0; animation: pop .3s ease-out 2.1s forwards; }
  @keyframes draw { to { stroke-dashoffset:0; } }
  @keyframes pop { to { opacity:1; } }
</style>
<text x="0" y="40" font-size="42" font-weight="700" fill="${th.text}" letter-spacing="-1">${fmt(s.thisYear)}<tspan font-size="15" font-weight="400" fill="${th.muted}" dx="10" letter-spacing="0">contributions in the last year</tspan></text>
${change}
${grid}
<line x1="0" y1="${cy + ch}" x2="${W}" y2="${cy + ch}" stroke="${th.rule}" stroke-dasharray="2 4"/>
<path class="ln" d="${path}" fill="none" stroke="${th.line}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>
<circle class="dot" cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" r="4.5" fill="${th.line}"/>
<line x1="0" y1="${cy + ch + 14}" x2="${W}" y2="${cy + ch + 14}" stroke="${th.rule}"/>
${stat(0, "All Time", fmt(s.allTime))}
${stat(210, "Last 90 Days", fmt(s.last90))}
${stat(420, "Daily Average, 90 Days", fmt(s.avg90))}
${stat(630, "Best Day", fmt(s.best))}
</svg>`;
}

const ICONS = {
  mail: `<path d="M1.75 3h12.5c.97 0 1.75.78 1.75 1.75v6.5A1.75 1.75 0 0 1 14.25 13H1.75A1.75 1.75 0 0 1 0 11.25v-6.5C0 3.78.78 3 1.75 3ZM1.5 5.6v5.65c0 .14.11.25.25.25h12.5c.14 0 .25-.11.25-.25V5.6L8.4 9.3a.75.75 0 0 1-.8 0Zm.6-1.1L8 7.78l5.9-3.28Z"/>`,
  linkedin: `<path d="M13.6 1H2.4C1.6 1 1 1.6 1 2.4v11.2c0 .8.6 1.4 1.4 1.4h11.2c.8 0 1.4-.6 1.4-1.4V2.4c0-.8-.6-1.4-1.4-1.4ZM5.2 12.9H3.1V6.2h2.1v6.7ZM4.1 5.3a1.2 1.2 0 1 1 0-2.4 1.2 1.2 0 0 1 0 2.4Zm8.8 7.6h-2.1V9.6c0-.8 0-1.8-1.1-1.8s-1.3.9-1.3 1.8v3.3H6.3V6.2h2v.9c.3-.5 1-1.1 2.1-1.1 2.2 0 2.6 1.5 2.6 3.4v3.5Z"/>`,
  globe: `<path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM5.78 8.75a9.64 9.64 0 0 0 1.36 4.65c.26.03.53.05.8.05.27 0 .54-.02.8-.05a9.64 9.64 0 0 0 1.36-4.65Zm4.82 0a11.1 11.1 0 0 1-.96 4.37 6.5 6.5 0 0 0 3.8-4.37Zm-8.04 0a6.5 6.5 0 0 0 3.8 4.37 11.1 11.1 0 0 1-.96-4.37Zm3.22-1.5h4.44A9.64 9.64 0 0 0 8.86 2.6a6.6 6.6 0 0 0-1.72 0 9.64 9.64 0 0 0-1.36 4.65Zm4.82 0h2.84a6.5 6.5 0 0 0-3.8-4.37c.53 1.17.87 2.67.96 4.37Zm-8.04 0h2.84c.09-1.7.43-3.2.96-4.37a6.5 6.5 0 0 0-3.8 4.37Z"/>`,
};

function pillSvg(link, th) {
  const textW = Math.ceil(link.label.length * 7.4);
  const W = 16 + 16 + 8 + textW + 16, H = 32;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}">
<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="${H / 2 - .5}" fill="${th.pillBg}" stroke="${th.pillBorder}"/>
<g transform="translate(14 8)" fill="${th.muted}">${ICONS[link.icon]}</g>
<text x="38" y="20.5" font-size="13" font-weight="600" fill="${th.text}">${esc(link.label)}</text>
</svg>`;
}

// ---------- main ----------
const days = process.argv.includes("--sample") ? sampleDays() : await fetchDays();
const s = stats(days);
for (const [name, th] of Object.entries(THEMES)) {
  writeFileSync(new URL(`graph-${name}.svg`, OUT), graphSvg(s, th));
  for (const l of LINKS) writeFileSync(new URL(`pill-${l.id}-${name}.svg`, OUT), pillSvg(l, th));
}
console.log(`${fmt(s.thisYear)} contributions in the last year · all time ${fmt(s.allTime)} · best day ${s.best}`);
