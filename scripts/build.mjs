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
           cell: "#ffffff", cellOp: [0.035, 0.07, 0.11, 0.16, 0.22], rule: "#3d444d", pillBg: "#151b23", pillBorder: "#3d444d",
           base: "#58a6ff", inkShade: 0, white: "#ffffff", card: "#0a0e16", orbOp: .48, frostTop: .07, frostBot: .015, sheen: .09,
           grain: .06, rimTop: .55, rimMid: .05, rimBot: .28, edge: "#ffffff", edgeOp: .04, laneOp: .32, laneSheen: .22,
           areaOp: .8, areaFade: .55, areaSheen: .28, glowOp: .65, specOp: .55,
           bandOp: .16, beamOp: .35, crack: "#ffffff", crackOp: .22 },
  light: { bg: "#ffffff", text: "#1f2328", muted: "#59636e", line: "#57606a", line2: "#1f2328", up: "#1a7f37", down: "#cf222e",
           cell: "#1f2328", cellOp: [0.03, 0.06, 0.1, 0.15, 0.2], rule: "#d1d9e0", pillBg: "#f6f8fa", pillBorder: "#d1d9e0",
           base: "#0969da", inkShade: .22, white: "#ffffff", card: "#f4f7fb", orbOp: .38, frostTop: .6, frostBot: .3, sheen: .55,
           grain: .05, rimTop: 1, rimMid: .55, rimBot: .9, edge: "#1f2328", edgeOp: .1, laneOp: .3, laneSheen: .6,
           areaOp: .45, areaFade: .75, areaSheen: .5, glowOp: .35, specOp: .7,
           bandOp: .16, beamOp: .9, crack: "#1f2328", crackOp: .16 },
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
  { name: "PermitBug", start: "2026-03-01", end: "2026-09-01", color: "#f7931e", logo: "assets/logos/permitbug.png" },
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

// blend hex `a` toward hex `b` by t (0..1)
const mix = (a, b, t) => {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const A = p(a), B = p(b);
  return "#" + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, "0")).join("");
};

function graphSvg(s, th, id) {
  const P = 30, R = 28;                                   // glass padding + corner radius
  const W = 840, days = s.window, n = days.length;
  const top = 124, chH = 150, chB = top + chH;
  const laneTop = chB + 40, laneH = 30, laneGap = 10;
  const lanesH = VENTURES.length * (laneH + laneGap);
  const statsY = laneTop + lanesH + 22;
  const H = statsY + 62;
  const OW = W + P * 2, OH = H + P * 2;

  // intro timeline, in seconds: the laser carves the curve from T0 to T1, everything settles by TOTAL
  const T0 = 0.7, T1 = 6.2, TOTAL = 7.2;

  const t0 = new Date(days[0].date).getTime(), t1 = new Date(days[n - 1].date).getTime();
  const xOf = (date) => Math.max(0, Math.min(W, ((new Date(date).getTime() - t0) / (t1 - t0)) * W));
  const ink = (c) => (th.inkShade ? mix(c, "#000000", th.inkShade) : c);
  const f = (v) => (+v).toFixed(2);

  // centered, triangle-weighted average (about 3 weeks wide) so bursts read as waves, not blocks
  const SMOOTH = 12;
  const roll = days.map((_, i) => {
    let sum = 0, wsum = 0;
    for (let k = -SMOOTH; k <= SMOOTH; k++) {
      const d = days[i + k];
      if (!d) continue;
      const w = SMOOTH + 1 - Math.abs(k);
      sum += d.count * w; wsum += w;
    }
    return sum / wsum;
  });
  const rmax = Math.max(1, ...roll);
  // square-root scale: quieter stretches stay visible next to big spikes (no y-axis, so heights are relative),
  // then a light second pass so the curve eases into the baseline instead of meeting it in a sharp point
  const sq = roll.map((v) => Math.sqrt(v / rmax));
  const soft = sq.map((_, i) => {
    let sum = 0, wsum = 0;
    for (let k = -5; k <= 5; k++) {
      if (sq[i + k] === undefined) continue;
      const w = 6 - Math.abs(k);
      sum += sq[i + k] * w; wsum += w;
    }
    return sum / wsum;
  });
  const smax = Math.max(1e-9, ...soft);
  const PW = W - 12;
  const pts = soft.map((v, i) => [(i / (n - 1)) * PW, chB - 3 - (v / smax) * (chH - 14)]);
  let line = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < n; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], mx = (x0 + x1) / 2;
    line += ` C${mx.toFixed(1)},${y0.toFixed(1)} ${mx.toFixed(1)},${y1.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
  }
  const area = `${line} L${PW},${chB} L0,${chB} Z`;
  const [ex, ey] = pts[n - 1];
  const idxAtX = (x) => Math.min(n - 1, Math.max(0, Math.round((x / W) * (n - 1))));
  const yAtDate = (date) => pts[idxAtX(xOf(date))][1];

  // arc length along the curve, so every effect fires exactly when the laser head gets there
  const cum = [0];
  for (let i = 1; i < n; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = cum[n - 1] || 1;
  const tAtIdx = (i) => T0 + (cum[i] / total) * (T1 - T0);
  const tAtX = (x) => tAtIdx(idxAtX(x));
  const kt = (ts) => ts.map((t) => (t / TOTAL).toFixed(4)).join(";");
  const anim = (attr, vals, ts) => `<animate attributeName="${attr}" dur="${TOTAL}s" values="${vals.join(";")}" keyTimes="${kt(ts)}" calcMode="linear" fill="freeze"/>`;
  const during = (on = 1) => anim("opacity", [0, 0, on, on, 0, 0], [0, T0 - .01, T0, T1, T1 + .35, TOTAL]);
  const draw = anim("stroke-dashoffset", [1000, 1000, 0, 0], [0, T0, T1, TOTAL]);

  // x position of the laser head over time (sampled), used for the scan beam and the area reveal
  const sampT = [0], sampX = [0];
  for (let j = 0; j <= 80; j++) {
    const i = Math.round((j / 80) * (n - 1)), t = tAtIdx(i);
    if (t > sampT[sampT.length - 1] + 1e-3) { sampT.push(t); sampX.push(pts[i][0].toFixed(1)); }
  }
  sampT.push(TOTAL); sampX.push(PW);

  // the spectrum: base blue drifts into each venture's color as it starts
  const vs = [...VENTURES].sort((a, b) => a.start.localeCompare(b.start));
  const off = (x) => Math.max(0, Math.min(1, x)).toFixed(3);
  let spec = `<stop offset="0" stop-color="${th.base}"/>`;
  vs.forEach((v, i) => {
    const o = xOf(v.start) / W;
    if (i > 0) spec += `<stop offset="${off(Math.max(xOf(vs[i - 1].start) / W, o - 0.07))}" stop-color="${ink(vs[i - 1].color)}"/>`;
    spec += `<stop offset="${off(o)}" stop-color="${ink(v.color)}"/>`;
  });
  const last = vs.length ? ink(vs[vs.length - 1].color) : th.base;
  spec += `<stop offset="1" stop-color="${last}"/>`;

  // laser head color follows the era it is cutting through
  const hcT = [0], hcV = [th.base];
  vs.forEach((v) => {
    const t = tAtX(xOf(v.start));
    hcT.push(Math.max(hcT[hcT.length - 1] + .01, t - .25)); hcV.push(hcV[hcV.length - 1]);
    hcT.push(Math.max(hcT[hcT.length - 1] + .01, t)); hcV.push(ink(v.color));
  });
  hcT.push(TOTAL); hcV.push(last);
  const headColor = anim("fill", hcV, hcT);

  // deterministic jagged cracks radiating from an impact point
  const cracks = (cx, cy, seed, reach) => {
    let r = seed >>> 0;
    const rnd = () => ((r = (r * 1664525 + 1013904223) >>> 0) / 4294967296);
    let d = "";
    const count = 7;
    for (let k = 0; k < count; k++) {
      let a = (k / count) * Math.PI * 2 + rnd() * .6, x = cx, y = cy;
      d += `M${f(x)},${f(y)}`;
      const segs = 3 + Math.floor(rnd() * 2), len = reach * (.55 + rnd() * .6);
      let mid = null;
      for (let q = 0; q < segs; q++) {
        a += (rnd() - .5) * .8;
        x += Math.cos(a) * len / segs; y += Math.sin(a) * len / segs;
        d += ` L${f(x)},${f(y)}`;
        if (q === 1) mid = [x, y, a];
      }
      if (mid && rnd() > .35) {
        const ba = mid[2] + (rnd() > .5 ? 1 : -1) * (.6 + rnd() * .5), bl = len * .35;
        d += ` M${f(mid[0])},${f(mid[1])} L${f(mid[0] + Math.cos(ba) * bl)},${f(mid[1] + Math.sin(ba) * bl)}`;
      }
    }
    return d;
  };
  const impact = (cx, cy, color, t, seed, big = false) =>
    `<circle class="flash" style="animation-delay:${f(t)}s" cx="${f(cx)}" cy="${f(cy)}" r="${big ? 34 : 24}" fill="#fff" filter="url(#lz-${id})"/>` +
    `<circle class="ring" style="animation-delay:${f(t)}s" cx="${f(cx)}" cy="${f(cy)}" r="9" fill="none" stroke="${color}" stroke-width="2"/>` +
    `<circle class="ring" style="animation-delay:${f(t + .12)}s" cx="${f(cx)}" cy="${f(cy)}" r="6" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="1"/>` +
    `<path class="crack" style="animation-delay:${f(t)}s" pathLength="1" d="${cracks(cx, cy, seed, big ? 52 : 40)}" fill="none" stroke="${th.crack}" stroke-width=".9" stroke-linecap="round"/>`;

  // eras: BEFORE, then each venture, each lights up as the laser enters it
  const eras = [{ name: "BEFORE", from: 0, to: vs.length ? xOf(vs[0].start) : W, color: th.base }]
    .concat(vs.map((v) => ({ name: v.name.toUpperCase(), from: xOf(v.start), to: v.end ? xOf(v.end) : W, color: ink(v.color) })));
  let eraSvg = "";
  eras.forEach((e, i) => {
    const t = i === 0 ? T0 : tAtX(e.from);
    eraSvg += `<g class="era" style="animation-delay:${f(t)}s"><rect x="${f(e.from)}" y="${top - 4}" width="${f(Math.max(2, e.to - e.from))}" height="${chH + 4}" fill="url(#eb-${id}-${i})"/>` +
      `<line x1="${f(e.from)}" y1="${top - 4}" x2="${f(e.from)}" y2="${chB}" stroke="${e.color}" stroke-opacity=".35"/>` +
      `<text x="${f(e.from + 7)}" y="${top - 10}" font-size="9.5" font-weight="700" letter-spacing="1.8" fill="${e.color}">${esc(e.name)}</text></g>`;
  });
  const eraDefs = eras.map((e, i) => `<linearGradient id="eb-${id}-${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${e.color}" stop-opacity="0"/><stop offset="1" stop-color="${e.color}" stop-opacity="${th.bandOp}"/></linearGradient>`).join("");

  // horizontal guides + month labels (each month lights up as the laser passes it)
  let guides = "";
  for (let k = 1; k <= 3; k++) {
    const y = top + (chH * k) / 4;
    guides += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="${th.rule}" stroke-opacity=".45" stroke-dasharray="1 5"/>`;
  }
  let months = "";
  days.forEach((d, i) => {
    if (d.date.endsWith("-01")) {
      const x = (i / (n - 1)) * W;
      const label = new Date(d.date + "T12:00:00Z").toLocaleString("en-US", { month: "short", timeZone: "UTC" });
      months += `<text class="mo" style="animation-delay:${f(tAtIdx(i) - .1)}s" x="${x.toFixed(1)}" y="${chB + 20}" font-size="11" fill="${th.muted}" text-anchor="middle">${label}</text>`;
    }
  });

  // ventures: marker + impact on the curve, glass lane underneath
  let defs = "", markers = "", lanes = "", orbs = "", impacts = "";
  const shakes = [];
  orbs += `<circle class="o o0" cx="${P + 60}" cy="${P + 120}" r="170" fill="${th.base}"/>`;
  VENTURES.forEach((v, i) => {
    const c = ink(v.color);
    const sx = xOf(v.start), exv = v.end ? xOf(v.end) : W;
    const ly = laneTop + i * (laneH + laneGap), cyL = ly + laneH / 2;
    const logo = logoData(v.logo);
    const clip = `c-${id}-${i}`;
    const t = tAtX(sx), my = yAtDate(v.start);
    shakes.push(t);
    orbs += `<circle class="o o${i + 1}" cx="${P + (sx + exv) / 2}" cy="${P + (i % 2 ? top + 70 : top - 10)}" r="${170 - i * 20}" fill="${v.color}"/>`;
    defs += `<clipPath id="${clip}"><circle cx="${sx + laneH / 2}" cy="${cyL}" r="${laneH / 2 - 3}"/></clipPath>`;
    defs += `<linearGradient id="lg-${id}-${i}" x1="0" x2="1"><stop offset="0" stop-color="${v.color}" stop-opacity="${th.laneOp}"/><stop offset="1" stop-color="${v.color}" stop-opacity="${v.end ? th.laneOp : .04}"/></linearGradient>`;

    impacts += impact(sx, my, c, t, 977 * (i + 3) + 13);
    markers += `<line class="drop" style="animation-delay:${f(t + .1)}s" x1="${sx}" y1="${my}" x2="${sx}" y2="${ly}" stroke="${c}" stroke-opacity=".6" stroke-dasharray="3 3"/>`;
    markers += `<g class="pop" style="animation-delay:${f(t)}s"><circle cx="${sx}" cy="${my}" r="11" fill="${c}" fill-opacity=".25" filter="url(#gl-${id})"/><circle cx="${sx}" cy="${my}" r="4.5" fill="${c}" stroke="${th.white}" stroke-opacity=".9" stroke-width="1.5"/></g>`;

    const bw = Math.max(laneH, exv - sx);
    const startLbl = new Date(v.start + "T12:00:00Z").toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
    const endLbl = v.end ? new Date(v.end + "T12:00:00Z").toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }) : "now";
    const inside = bw > 190;
    let lane = `<rect x="${sx}" y="${ly}" width="${bw}" height="${laneH}" rx="${laneH / 2}" fill="url(#lg-${id}-${i})"/>`;
    lane += `<rect x="${sx + 1}" y="${ly + 1}" width="${bw - 2}" height="${laneH / 2}" rx="${laneH / 2 - 1}" fill="url(#lsh-${id})"/>`;
    lane += `<rect x="${sx + .5}" y="${ly + .5}" width="${bw - 1}" height="${laneH - 1}" rx="${laneH / 2 - .5}" fill="none" stroke="${c}" stroke-opacity=".7"/>`;
    lane += `<g class="pop" style="animation-delay:${f(t + .25)}s">` + (logo
      ? `<circle cx="${sx + laneH / 2}" cy="${cyL}" r="${laneH / 2 - 2}" fill="${th.bg}"/><image href="${logo}" x="${sx + 3}" y="${ly + 3}" width="${laneH - 6}" height="${laneH - 6}" clip-path="url(#${clip})" preserveAspectRatio="xMidYMid slice"/>`
      : `<circle cx="${sx + laneH / 2}" cy="${cyL}" r="${laneH / 2 - 3}" fill="${v.color}"/><text x="${sx + laneH / 2}" y="${cyL + 4.5}" font-size="13" font-weight="700" fill="${th.bg}" text-anchor="middle">${esc(v.name[0])}</text>`) + `</g>`;
    const tx = inside ? sx + laneH + 6 : sx + bw + 10;
    lane += `<text x="${tx}" y="${cyL + 4.5}" font-size="13" font-weight="700" fill="${th.text}">${esc(v.name)}<tspan font-weight="400" fill="${th.muted}" dx="8" font-size="11.5">${startLbl} → ${endLbl}</tspan></text>`;
    if (!v.end) lane += `<circle class="live" cx="${W - 12}" cy="${cyL}" r="3.5" fill="${c}"/>`;
    lanes += `<g class="lane" style="animation-delay:${f(t + .15)}s">${lane}</g>`;
  });
  impacts += impact(ex, ey, last, T1, 4242, true);
  shakes.push(T1);

  const chg = s.change === null ? "" : (() => {
    const up = s.change >= 0, txt = `${up ? "▲" : "▼"} ${fmt(Math.abs(Math.round(s.change)))}% vs last year`;
    const w = txt.length * 6.9 + 22, c = up ? th.up : th.down;
    return `<g class="rise" style="animation-delay:${f(T1 + .25)}s"><rect x=".5" y="78.5" width="${w}" height="24" rx="12" fill="${c}" fill-opacity=".14" stroke="${c}" stroke-opacity=".35"/><text x="11" y="95" font-size="12.5" font-weight="600" fill="${c}">${txt}</text></g>`;
  })();

  const stat = (x, label, val, k) =>
    `<g class="rise" style="animation-delay:${f(T1 + .3 + k * .09)}s"><text x="${x}" y="${statsY + 18}" font-size="11" fill="${th.muted}" letter-spacing=".6">${label.toUpperCase()}</text>` +
    `<text x="${x}" y="${statsY + 44}" font-size="20" font-weight="700" fill="${th.text}">${val}</text></g>`;

  const numW = String(fmt(s.thisYear)).length * 23;
  const shakeCss = shakes.map((t, i) => `shake ${i === shakes.length - 1 ? .5 : .32}s ease-out ${f(t)}s`).join(", ");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${OW}" height="${OH}" viewBox="0 0 ${OW} ${OH}" font-family="${FONT}">
<defs>
  <clipPath id="card-${id}"><rect width="${OW}" height="${OH}" rx="${R}"/></clipPath>
  <clipPath id="rev-${id}"><rect x="-4" y="${top - 30}" width="${PW + 8}" height="${chH + 40}">${anim("width", sampX.map((x) => +x + 8), sampT)}</rect></clipPath>
  <filter id="orb-${id}" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="55"/></filter>
  <filter id="gl-${id}" x="-20%" y="-60%" width="140%" height="220%"><feGaussianBlur stdDeviation="5"/></filter>
  <filter id="lz-${id}" x="-150%" y="-150%" width="400%" height="400%"><feGaussianBlur stdDeviation="7"/></filter>
  <filter id="soft-${id}" x="-50%" y="-500%" width="200%" height="1100%"><feGaussianBlur stdDeviation="1.2"/></filter>
  <filter id="grain-${id}"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="table" tableValues="0 ${th.grain}"/></feComponentTransfer></filter>
  <linearGradient id="frost-${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="${th.frostTop}"/><stop offset="1" stop-color="#fff" stop-opacity="${th.frostBot}"/></linearGradient>
  <linearGradient id="sheen-${id}" x1="0" y1="0" x2=".35" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="${th.sheen}"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient>
  <linearGradient id="rim-${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="${th.rimTop}"/><stop offset=".35" stop-color="#fff" stop-opacity="${th.rimMid}"/><stop offset=".7" stop-color="#fff" stop-opacity="${th.rimMid}"/><stop offset="1" stop-color="#fff" stop-opacity="${th.rimBot}"/></linearGradient>
  <linearGradient id="lsh-${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="${th.laneSheen}"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
  <linearGradient id="sp-${id}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${W}" y2="0">${spec}</linearGradient>
  <linearGradient id="num-${id}" x1="0" y1="0" x2="1" y2="0">${spec}</linearGradient>
  <linearGradient id="afade-${id}" gradientUnits="userSpaceOnUse" x1="0" y1="${top}" x2="0" y2="${chB}"><stop offset="0" stop-color="${th.card}" stop-opacity="0"/><stop offset="1" stop-color="${th.card}" stop-opacity="${th.areaFade}"/></linearGradient>
  <linearGradient id="ash-${id}" gradientUnits="userSpaceOnUse" x1="0" y1="${top}" x2="0" y2="${chB}"><stop offset="0" stop-color="#fff" stop-opacity="${th.areaSheen}"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient>
  <linearGradient id="beam-${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".55" stop-color="#fff" stop-opacity="${th.beamOp}"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
  ${eraDefs}
  ${defs}
</defs>
<style>
  .card { animation: cardIn .7s cubic-bezier(.2,.8,.2,1) both; }
  .orbs { animation: bloom ${T1}s ease-in both; }
  .hdr { animation: rise .6s ease-out .15s both; }
  .num { transform-box: fill-box; transform-origin: 0% 70%; animation: slam .7s cubic-bezier(.2,1.4,.3,1) ${f(T1 + .05)}s both; }
  .rise { animation: rise .55s cubic-bezier(.2,.8,.2,1) both; }
  .era { animation: era .9s ease-out both; }
  .mo { animation: mo .5s ease-out both; }
  .pop { transform-box: fill-box; transform-origin: center; animation: pop .55s cubic-bezier(.2,1.6,.4,1) both; }
  .lane { animation: lane .6s cubic-bezier(.2,.8,.2,1) both; }
  .drop { animation: fade .4s ease-out both; }
  .flash { opacity: 0; transform-box: fill-box; transform-origin: center; animation: flash .7s ease-out both; }
  .ring { opacity: 0; transform-box: fill-box; transform-origin: center; animation: ring 1s cubic-bezier(.1,.7,.3,1) both; }
  .crack { stroke-dasharray: 1; stroke-opacity: ${th.crackOp}; animation: crack 1.4s cubic-bezier(.1,.8,.2,1) both; }
  .shk { animation: ${shakeCss}; }
  .ar { animation: fade 1s ease-out ${f(T1)}s both; }
  .end { animation: pop .6s cubic-bezier(.2,1.6,.4,1) ${f(T1)}s both; transform-box: fill-box; transform-origin: center; }
  .pulse { opacity: 0; transform-box: fill-box; transform-origin: center; animation: pulse 2.2s ease-out ${f(T1 + .6)}s infinite; }
  .live { animation: blink 1.6s ease-in-out infinite; }
  .o { transform-box: fill-box; transform-origin: center; }
  .o0 { animation: d0 14s ease-in-out infinite; }
  .o1 { animation: d1 17s ease-in-out infinite; }
  .o2 { animation: d2 12s ease-in-out infinite; }
  .o3 { animation: d0 19s ease-in-out infinite reverse; }
  @keyframes cardIn { from { opacity: 0; transform: translateY(10px) scale(.985); } }
  @keyframes bloom { from { opacity: .12; } }
  @keyframes rise { from { opacity: 0; transform: translateY(8px); } }
  @keyframes slam { 0% { opacity: 0; transform: scale(1.6); filter: blur(6px); } 55% { opacity: 1; transform: scale(.96); filter: blur(0); } 100% { transform: scale(1); } }
  @keyframes era { 0% { opacity: 0; } 25% { opacity: 1; filter: brightness(2.2); } 100% { opacity: 1; } }
  @keyframes mo { from { opacity: 0; transform: translateY(5px); } }
  @keyframes pop { 0% { opacity: 0; transform: scale(0); } 100% { opacity: 1; transform: scale(1); } }
  @keyframes lane { from { opacity: 0; transform: translateX(-18px); } }
  @keyframes fade { from { opacity: 0; } }
  @keyframes flash { 0% { opacity: 0; transform: scale(.2); } 12% { opacity: .95; } 100% { opacity: 0; transform: scale(1.7); } }
  @keyframes ring { 0% { opacity: 0; transform: scale(.4); } 2% { opacity: .95; transform: scale(.5); } 100% { opacity: 0; transform: scale(7); } }
  @keyframes crack { 0% { stroke-dashoffset: 1; stroke-opacity: 1; } 22% { stroke-dashoffset: 0; stroke-opacity: 1; } 100% { stroke-dashoffset: 0; stroke-opacity: ${th.crackOp}; } }
  @keyframes shake { 0%,100% { transform: translate(0,0); } 15% { transform: translate(-3px,2px); } 35% { transform: translate(3px,-2px); } 55% { transform: translate(-2px,1px); } 75% { transform: translate(1px,-1px); } }
  @keyframes pulse { 0% { transform: scale(.6); opacity: .8; } 100% { transform: scale(3); opacity: 0; } }
  @keyframes blink { 50% { opacity: .25; } }
  @keyframes d0 { 50% { transform: translate(60px,30px) scale(1.15); } }
  @keyframes d1 { 50% { transform: translate(-50px,-25px) scale(.9); } }
  @keyframes d2 { 50% { transform: translate(-40px,35px) scale(1.12); } }
  @media (prefers-reduced-motion: reduce) { * { animation-duration: .01s !important; animation-delay: 0s !important; animation-iteration-count: 1 !important; } }
</style>
<g class="card">
<g clip-path="url(#card-${id})">
  <rect width="${OW}" height="${OH}" fill="${th.card}"/>
  <g class="orbs"><g filter="url(#orb-${id})" opacity="${th.orbOp}">${orbs}</g></g>
  <rect width="${OW}" height="${OH}" fill="url(#frost-${id})"/>
  <rect width="${OW}" height="${OH}" filter="url(#grain-${id})"/>
  <rect width="${OW}" height="${OH}" fill="url(#sheen-${id})"/>
</g>
<rect x=".5" y=".5" width="${OW - 1}" height="${OH - 1}" rx="${R - .5}" fill="none" stroke="${th.edge}" stroke-opacity="${th.edgeOp}"/>
<rect x="1.25" y="1.25" width="${OW - 2.5}" height="${OH - 2.5}" rx="${R - 1.25}" fill="none" stroke="url(#rim-${id})" stroke-width="1.5"/>
<g class="shk"><g transform="translate(${P} ${P})">
<g class="hdr">
<text x="0" y="18" font-size="11" font-weight="600" fill="${th.muted}" letter-spacing="1.5">SHIPPING LOG · LAST 12 MONTHS</text>
<text x="${W}" y="18" font-size="11" fill="${th.muted}" text-anchor="end">updated ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</text>
<text x="${W}" y="36" font-size="11" fill="${th.muted}" text-anchor="end">Business student who builds things</text>
</g>
<text class="num" x="0" y="66" font-size="40" font-weight="800" fill="url(#num-${id})" letter-spacing="-1.2">${fmt(s.thisYear)}</text>
<text class="rise" style="animation-delay:${f(T1 + .2)}s" x="${numW + 10}" y="66" font-size="14" fill="${th.muted}">contributions</text>
${chg}
${eraSvg}
${guides}
<line x1="0" y1="${chB}" x2="${W}" y2="${chB}" stroke="${th.rule}"/>
${months}
<g clip-path="url(#rev-${id})"><path d="${area}" fill="url(#sp-${id})" fill-opacity="${th.areaOp}"/><path d="${area}" fill="url(#afade-${id})"/><path d="${area}" fill="url(#ash-${id})"/></g>
<path id="cv-${id}" pathLength="1000" stroke-dasharray="1000" d="${line}" fill="none" stroke="url(#sp-${id})" stroke-width="10" stroke-opacity="${th.glowOp}" stroke-linejoin="round" stroke-linecap="round" filter="url(#gl-${id})">${draw}</path>
<path pathLength="1000" stroke-dasharray="1000" d="${line}" fill="none" stroke="url(#sp-${id})" stroke-width="3.2" stroke-linejoin="round" stroke-linecap="round">${draw}</path>
<path pathLength="1000" stroke-dasharray="1000" d="${line}" fill="none" stroke="#fff" stroke-width="1.1" stroke-linejoin="round" stroke-linecap="round">${draw}${anim("stroke-opacity", [1, 1, th.specOp, th.specOp], [0, T1, T1 + .8, TOTAL])}</path>
<path pathLength="1000" stroke-dasharray="34 3000" d="${line}" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" filter="url(#gl-${id})" opacity="0">${anim("stroke-dashoffset", [34, 34, -966, -966], [0, T0, T1, TOTAL])}${during()}</path>
<path pathLength="1000" stroke-dasharray="22 3000" d="${line}" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" opacity="0">${anim("stroke-dashoffset", [22, 22, -978, -978], [0, T0, T1, TOTAL])}${during()}</path>
<rect x="-1" y="${top - 6}" width="2" height="${chH + 6}" fill="url(#beam-${id})" opacity="0">${anim("x", sampX.map((x) => +x - 1), sampT)}${during()}</rect>
<rect x="-7" y="${top - 6}" width="14" height="${chH + 6}" fill="url(#beam-${id})" opacity="0" filter="url(#gl-${id})">${anim("x", sampX.map((x) => +x - 7), sampT)}${during(.6)}</rect>
${impacts}
${markers}
<g class="end"><circle class="pulse" cx="${ex}" cy="${ey}" r="6" fill="${last}"/><circle cx="${ex}" cy="${ey}" r="12" fill="${last}" fill-opacity=".35" filter="url(#gl-${id})"/><circle cx="${ex}" cy="${ey}" r="5" fill="${last}" stroke="#fff" stroke-width="1.5"/></g>
<g opacity="0">${during()}
  <animateMotion dur="${TOTAL}s" keyPoints="0;0;1;1" keyTimes="${kt([0, T0, T1, TOTAL])}" calcMode="linear" fill="freeze"><mpath href="#cv-${id}"/></animateMotion>
  <circle r="20" fill="${th.base}" opacity=".6" filter="url(#lz-${id})">${headColor}</circle>
  <ellipse rx="54" ry="1.4" fill="#fff" opacity=".8" filter="url(#soft-${id})"/>
  <ellipse rx="1.4" ry="18" fill="#fff" opacity=".45" filter="url(#soft-${id})"/>
  <circle r="7" fill="${th.base}" opacity=".9" filter="url(#gl-${id})">${headColor}</circle>
  <circle r="3.4" fill="#fff"/>
</g>
${lanes}
<line class="rise" style="animation-delay:${f(T1 + .2)}s" x1="0" y1="${statsY}" x2="${W}" y2="${statsY}" stroke="${th.rule}"/>
${stat(0, "All time", fmt(s.allTime), 0)}
${stat(210, "Last 90 days", fmt(s.last90), 1)}
${stat(420, "Daily avg · 90d", fmt(s.avg90), 2)}
${stat(630, "Best day", fmt(s.best), 3)}
</g></g>
</g>
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
