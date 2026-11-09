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
  dark:  { bg: "#0d1117", text: "#f0f6fc", muted: "#9198a1", line: "#e6edf3", line2: "#ffffff", up: "#3fb950", down: "#f85149",
           cell: "#ffffff", cellOp: [0.035, 0.07, 0.11, 0.16, 0.22], rule: "#3d444d", pillBg: "#151b23", pillBorder: "#3d444d" },
  light: { bg: "#ffffff", text: "#1f2328", muted: "#59636e", line: "#57606a", line2: "#1f2328", up: "#1a7f37", down: "#cf222e",
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

// ---------- ventures shown on the graph ----------
// start/end are YYYY-MM-DD. Leave end null if you're still on it.
// logo: path (from repo root) to a square PNG/JPG/SVG; it gets embedded into the graph.
const VENTURES = [
  { name: "PermitBug", start: "2026-04-01", end: "2026-09-01", color: "#f7931e", logo: "assets/logos/permitbug.png" },
  { name: "Rallo",     start: "2026-07-01", end: null,         color: "#d4ec2c", logo: "assets/logos/rallo.png" },
];

import { readFileSync, existsSync } from "node:fs";
function logoData(path) {
  const p = new URL(`../${path}`, import.meta.url);
  if (!path || !existsSync(p)) return null;
  const ext = path.split(".").pop().toLowerCase();
  const mime = ext === "svg" ? "image/svg+xml" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : "image/png";
  return `data:${mime};base64,${readFileSync(p).toString("base64")}`;
}

function graphSvg(s, th, id) {
  const W = 840, days = s.window, n = days.length;
  const top = 124, chH = 150, chB = top + chH;
  const laneTop = chB + 40, laneH = 30, laneGap = 10;
  const lanesH = VENTURES.length * (laneH + laneGap);
  const statsY = laneTop + lanesH + 22;
  const H = statsY + 62;

  const t0 = new Date(days[0].date).getTime(), t1 = new Date(days[n - 1].date).getTime();
  const xOf = (date) => Math.max(0, Math.min(W, ((new Date(date).getTime() - t0) / (t1 - t0)) * W));

  // 10-day rolling average, smoothed curve + gradient area
  const roll = days.map((_, i) => {
    const w = days.slice(Math.max(0, i - 9), i + 1);
    return w.reduce((a, d) => a + d.count, 0) / w.length;
  });
  const rmax = Math.max(1, ...roll);
  const yOf = (v) => chB - 3 - (v / rmax) * (chH - 14);
  const PW = W - 12;
  const pts = roll.map((v, i) => [(i / (n - 1)) * PW, yOf(v)]);
  let line = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < n; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], mx = (x0 + x1) / 2;
    line += ` C${mx.toFixed(1)},${y0.toFixed(1)} ${mx.toFixed(1)},${y1.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
  }
  const area = `${line} L${PW},${chB} L0,${chB} Z`;
  const [ex, ey] = pts[n - 1];
  const yAtDate = (date) => pts[Math.min(n - 1, Math.round((xOf(date) / W) * (n - 1)))][1];

  // horizontal guides + month labels
  let guides = "";
  for (let k = 1; k <= 3; k++) {
    const y = top + (chH * k) / 4;
    guides += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="${th.rule}" stroke-opacity=".5" stroke-dasharray="1 5"/>`;
  }
  let months = "";
  days.forEach((d, i) => {
    if (d.date.endsWith("-01")) {
      const x = (i / (n - 1)) * W;
      const label = new Date(d.date + "T12:00:00Z").toLocaleString("en-US", { month: "short", timeZone: "UTC" });
      months += `<text x="${x.toFixed(1)}" y="${chB + 20}" font-size="11" fill="${th.muted}" text-anchor="middle">${label}</text>`;
    }
  });

  // ventures: marker on the curve + lane underneath
  let defs = "", markers = "", lanes = "";
  VENTURES.forEach((v, i) => {
    const sx = xOf(v.start), exv = v.end ? xOf(v.end) : W;
    const ly = laneTop + i * (laneH + laneGap), cyL = ly + laneH / 2;
    const logo = logoData(v.logo);
    const clip = `c-${id}-${i}`;
    defs += `<clipPath id="${clip}"><circle cx="${sx + laneH / 2}" cy="${cyL}" r="${laneH / 2 - 3}"/></clipPath>`;
    defs += `<linearGradient id="lg-${id}-${i}" x1="0" x2="1"><stop offset="0" stop-color="${v.color}" stop-opacity=".35"/><stop offset="1" stop-color="${v.color}" stop-opacity="${v.end ? .35 : .04}"/></linearGradient>`;

    const my = yAtDate(v.start);
    markers += `<line x1="${sx}" y1="${my}" x2="${sx}" y2="${ly}" stroke="${v.color}" stroke-opacity=".55" stroke-dasharray="3 3"/>`;
    markers += `<circle cx="${sx}" cy="${my}" r="9" fill="${v.color}" fill-opacity=".18"/><circle cx="${sx}" cy="${my}" r="4" fill="${v.color}" stroke="${th.bg}" stroke-width="1.5"/>`;

    const bw = Math.max(laneH, exv - sx);
    const startLbl = new Date(v.start + "T12:00:00Z").toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
    const endLbl = v.end ? new Date(v.end + "T12:00:00Z").toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }) : "now";
    const nameX = sx + laneH + 6;
    const meta = `${startLbl} → ${endLbl}`;
    // put the label outside the bar if the bar is too short
    const inside = bw > 190;
    lanes += `<rect x="${sx}" y="${ly}" width="${bw}" height="${laneH}" rx="${laneH / 2}" fill="url(#lg-${id}-${i})" stroke="${v.color}" stroke-opacity=".6"/>`;
    lanes += logo
      ? `<circle cx="${sx + laneH / 2}" cy="${cyL}" r="${laneH / 2 - 2}" fill="${th.bg}"/><image href="${logo}" x="${sx + 3}" y="${ly + 3}" width="${laneH - 6}" height="${laneH - 6}" clip-path="url(#${clip})" preserveAspectRatio="xMidYMid slice"/>`
      : `<circle cx="${sx + laneH / 2}" cy="${cyL}" r="${laneH / 2 - 3}" fill="${v.color}"/><text x="${sx + laneH / 2}" y="${cyL + 4.5}" font-size="13" font-weight="700" fill="${th.bg}" text-anchor="middle">${esc(v.name[0])}</text>`;
    const tx = inside ? nameX : sx + bw + 10;
    lanes += `<text x="${tx}" y="${cyL + 4.5}" font-size="13" font-weight="700" fill="${th.text}">${esc(v.name)}<tspan font-weight="400" fill="${th.muted}" dx="8" font-size="11.5">${meta}</tspan></text>`;
    if (!v.end) lanes += `<circle class="live" cx="${W - 12}" cy="${cyL}" r="3.5" fill="${v.color}"/>`;
  });

  const chg = s.change === null ? "" : (() => {
    const up = s.change >= 0, txt = `${up ? "▲" : "▼"} ${fmt(Math.abs(Math.round(s.change)))}% vs last year`;
    const w = txt.length * 6.9 + 22, c = up ? th.up : th.down;
    return `<rect x="0" y="78" width="${w}" height="24" rx="12" fill="${c}" fill-opacity=".14"/><text x="11" y="94.5" font-size="12.5" font-weight="600" fill="${c}">${txt}</text>`;
  })();

  const stat = (x, label, val) =>
    `<text x="${x}" y="${statsY + 18}" font-size="11" fill="${th.muted}" letter-spacing=".6">${label.toUpperCase()}</text>` +
    `<text x="${x}" y="${statsY + 44}" font-size="20" font-weight="700" fill="${th.text}">${val}</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}">
<defs>
  <linearGradient id="ar-${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${th.line}" stop-opacity=".38"/><stop offset="1" stop-color="${th.line}" stop-opacity="0"/></linearGradient>
  <linearGradient id="ln-${id}" x1="0" x2="1"><stop offset="0" stop-color="${th.line}" stop-opacity=".45"/><stop offset=".6" stop-color="${th.line}"/><stop offset="1" stop-color="${th.line2}"/></linearGradient>
  ${defs}
</defs>
<style>
  .ln { stroke-dasharray:5000; stroke-dashoffset:5000; animation: draw 2.4s ease-out forwards; }
  .ar { opacity:0; animation: fade 1s ease-out 1.2s forwards; }
  .end { opacity:0; animation: fade .3s ease-out 2.3s forwards; }
  .live { animation: blink 1.6s ease-in-out infinite; }
  @keyframes draw { to { stroke-dashoffset:0; } }
  @keyframes fade { to { opacity:1; } }
  @keyframes blink { 50% { opacity:.25; } }
</style>
<text x="0" y="18" font-size="11" font-weight="600" fill="${th.muted}" letter-spacing="1.5">SHIPPING LOG · LAST 12 MONTHS</text>
<text x="${W}" y="18" font-size="11" fill="${th.muted}" text-anchor="end">updated ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</text>
<text x="${W}" y="36" font-size="11" fill="${th.muted}" text-anchor="end">Business student who builds things</text>
<text x="0" y="66" font-size="38" font-weight="800" fill="${th.text}" letter-spacing="-1">${fmt(s.thisYear)}<tspan font-size="14" font-weight="400" fill="${th.muted}" dx="10" letter-spacing="0">contributions</tspan></text>
${chg}
${guides}
<line x1="0" y1="${chB}" x2="${W}" y2="${chB}" stroke="${th.rule}"/>
${months}
<path class="ar" d="${area}" fill="url(#ar-${id})"/>
<path class="ln" d="${line}" fill="none" stroke="url(#ln-${id})" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
${markers}
<g class="end"><circle cx="${ex}" cy="${ey}" r="10" fill="${th.line2}" fill-opacity=".2"/><circle cx="${ex}" cy="${ey}" r="4.5" fill="${th.line2}"/></g>
${lanes}
<line x1="0" y1="${statsY}" x2="${W}" y2="${statsY}" stroke="${th.rule}"/>
${stat(0, "All time", fmt(s.allTime))}
${stat(210, "Last 90 days", fmt(s.last90))}
${stat(420, "Daily avg · 90d", fmt(s.avg90))}
${stat(630, "Best day", fmt(s.best))}
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
  writeFileSync(new URL(`graph-${name}.svg`, OUT), graphSvg(s, th, name));
  for (const l of LINKS) writeFileSync(new URL(`pill-${l.id}-${name}.svg`, OUT), pillSvg(l, th));
}
console.log(`${fmt(s.thisYear)} contributions in the last year · all time ${fmt(s.allTime)} · best day ${s.best}`);
