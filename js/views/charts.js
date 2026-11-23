import { getData } from "../store.js";
import { currentTarget, sumEntries } from "../calc.js";
import { ymd, addDays, parseYmd, round1 } from "../util.js";

let period = 7;

const W = 360, H = 200, PL = 40, PR = 10, PT = 12, PB = 26;
const COLORS = { kcal: "#2ea067", target: "#e0742b", p: "#3b7dd8", f: "#e5b100", c: "#8bc34a", weight: "#7a5cc7" };

export function renderCharts(root) {
  const draw = () => { root.innerHTML = template(); };
  draw();
  root.addEventListener("click", (e) => {
    const b = e.target.closest("[data-period]");
    if (b) { period = +b.dataset.period; draw(); }
  });
}

function series() {
  const d = getData();
  const end = ymd();
  const days = [];
  for (let i = period - 1; i >= 0; i--) days.push(addDays(end, -i));
  const byDate = {};
  for (const e of d.entries) (byDate[e.date] ||= []).push(e);
  return days.map((date) => {
    const list = byDate[date] || [];
    return { date, has: list.length > 0, ...sumEntries(list), weight: d.weights[date] ?? null };
  });
}

function niceMax(v) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

function frame(min, max, n, fmtY = (v) => Math.round(v)) {
  const ih = H - PT - PB;
  const y = (v) => PT + ih - ((v - min) / (max - min || 1)) * ih;
  const bw = (W - PL - PR) / n;
  const x = (i) => PL + bw * i + bw / 2;
  let grid = "";
  for (let k = 0; k <= 4; k++) {
    const v = min + ((max - min) * k) / 4;
    grid += `<line x1="${PL}" x2="${W - PR}" y1="${y(v)}" y2="${y(v)}" class="grid"/>
             <text x="${PL - 4}" y="${y(v) + 4}" class="axis" text-anchor="end">${fmtY(v)}</text>`;
  }
  return { y, x, bw, grid };
}

function xLabels(data, x) {
  const step = Math.ceil(data.length / 6);
  return data.map((d, i) => {
    if ((data.length - 1 - i) % step) return "";
    const dt = parseYmd(d.date);
    return `<text x="${x(i)}" y="${H - 8}" class="axis" text-anchor="middle">${dt.getMonth() + 1}/${dt.getDate()}</text>`;
  }).join("");
}

function svg(inner, label) {
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="${label}">${inner}</svg>`;
}

function kcalChart(data, target) {
  const max = niceMax(Math.max(...data.map((d) => d.kcal), target || 0) * 1.05);
  const { y, x, bw, grid } = frame(0, max, data.length);
  const w = Math.max(1, bw * 0.7);
  const bars = data.map((d, i) => d.has
    ? `<rect x="${x(i) - w / 2}" y="${y(d.kcal)}" width="${w}" height="${y(0) - y(d.kcal)}" fill="${COLORS.kcal}" rx="1.5"><title>${d.date} ${Math.round(d.kcal)}kcal</title></rect>`
    : "").join("");
  const tl = target ? `<line x1="${PL}" x2="${W - PR}" y1="${y(target)}" y2="${y(target)}" stroke="${COLORS.target}" stroke-width="1.5" stroke-dasharray="5 3"/>` : "";
  return svg(grid + bars + tl + xLabels(data, x), "摂取カロリー推移");
}

function pfcChart(data) {
  const max = niceMax(Math.max(...data.map((d) => d.p + d.f + d.c)) * 1.05);
  const { y, x, bw, grid } = frame(0, max, data.length);
  const w = Math.max(1, bw * 0.7);
  const bars = data.map((d, i) => {
    if (!d.has) return "";
    let base = 0, out = "";
    for (const k of ["p", "f", "c"]) {
      const top = base + d[k];
      out += `<rect x="${x(i) - w / 2}" y="${y(top)}" width="${w}" height="${Math.max(0, y(base) - y(top))}" fill="${COLORS[k]}"><title>${d.date} ${k.toUpperCase()} ${round1(d[k])}g</title></rect>`;
      base = top;
    }
    return out;
  }).join("");
  return svg(grid + bars + xLabels(data, x), "PFC推移");
}

function weightChart(data) {
  const pts = data.map((d, i) => ({ i, v: d.weight })).filter((p) => p.v != null);
  if (!pts.length) return `<p class="muted center">この期間の体重記録がありません</p>`;
  const vals = pts.map((p) => p.v);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const padv = Math.max(0.5, (hi - lo) * 0.15);
  lo = Math.floor((lo - padv) * 2) / 2; hi = Math.ceil((hi + padv) * 2) / 2;
  const { y, x, grid } = frame(lo, hi, data.length, (v) => v.toFixed(1));
  const path = pts.map((p, k) => `${k ? "L" : "M"}${x(p.i)},${y(p.v)}`).join(" ");
  const dots = pts.map((p) => `<circle cx="${x(p.i)}" cy="${y(p.v)}" r="${data.length > 40 ? 1.8 : 3}" fill="${COLORS.weight}"><title>${data[p.i].date} ${p.v}kg</title></circle>`).join("");
  return svg(grid + `<path d="${path}" fill="none" stroke="${COLORS.weight}" stroke-width="2" stroke-linejoin="round"/>` + dots + xLabels(data, x), "体重推移");
}

function template() {
  const data = series();
  const tgt = currentTarget(getData());
  const recorded = data.filter((d) => d.has);
  const avg = (k) => recorded.length ? recorded.reduce((s, d) => s + d[k], 0) / recorded.length : 0;
  const ws = data.filter((d) => d.weight != null);
  const wDiff = ws.length >= 2 ? round1(ws[ws.length - 1].weight - ws[0].weight) : null;

  return `
    <div class="seg period">
      ${[7, 30, 90].map((p) => `<button type="button" data-period="${p}" class="${p === period ? "active" : ""}">${p}日</button>`).join("")}
    </div>
    <section class="card">
      <h3>摂取カロリー</h3>
      ${kcalChart(data, tgt?.kcal)}
      <div class="legend"><span><i style="background:${COLORS.kcal}"></i>摂取</span>${tgt ? `<span><i class="dash" style="border-color:${COLORS.target}"></i>目標 ${tgt.kcal}kcal</span>` : ""}</div>
      <p class="muted small">記録した日の平均 ${Math.round(avg("kcal"))} kcal（${recorded.length}日分）</p>
    </section>
    <section class="card">
      <h3>PFC（g）</h3>
      ${pfcChart(data)}
      <div class="legend">
        <span><i style="background:${COLORS.p}"></i>P</span><span><i style="background:${COLORS.f}"></i>F</span><span><i style="background:${COLORS.c}"></i>C</span>
      </div>
      <p class="muted small">平均 P ${Math.round(avg("p"))}g / F ${Math.round(avg("f"))}g / C ${Math.round(avg("c"))}g${tgt ? `（目標 P${tgt.p} F${tgt.f} C${tgt.c}）` : ""}</p>
    </section>
    <section class="card">
      <h3>体重（kg）</h3>
      ${weightChart(data)}
      ${wDiff != null ? `<p class="muted small">期間内の変化 ${wDiff > 0 ? "+" : ""}${wDiff} kg</p>` : ""}
    </section>`;
}
