export const MEALS = ["朝", "昼", "夕", "間食"];

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/** ローカル時刻で YYYY-MM-DD */
export function ymd(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function parseYmd(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s, n) {
  const d = parseYmd(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
}

export function fmtDate(s) {
  const d = parseYmd(s);
  const w = "日月火水木金土"[d.getDay()];
  return `${d.getMonth() + 1}/${d.getDate()}(${w})`;
}

/** 入力値を数値に。空や不正は fallback */
export function num(v, fallback = 0) {
  const n = parseFloat(String(v ?? "").replace(/[，,]/g, ".").replace(/[０-９．]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)));
  return Number.isFinite(n) ? n : fallback;
}

export function round1(n) {
  return Math.round(n * 10) / 10;
}

export function guessMeal(date = new Date()) {
  const h = date.getHours();
  if (h < 10) return "朝";
  if (h < 15) return "昼";
  if (h >= 17 && h < 22) return "夕";
  return "間食";
}

let toastTimer;
export function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
}

/** 下からせり上がるシート。content は HTML。戻り値の close() で閉じる */
export function openSheet(title, html) {
  const root = document.getElementById("sheet-root");
  const wrap = document.createElement("div");
  wrap.className = "sheet-backdrop";
  wrap.innerHTML = `
    <div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="sheet-head"><h2>${esc(title)}</h2><button type="button" class="btn-icon" data-close aria-label="閉じる">✕</button></div>
      <div class="sheet-body">${html}</div>
    </div>`;
  root.appendChild(wrap);
  document.body.classList.add("no-scroll");
  const close = () => {
    wrap.remove();
    if (!root.children.length) document.body.classList.remove("no-scroll");
  };
  wrap.addEventListener("click", (e) => {
    if (e.target === wrap || e.target.closest("[data-close]")) close();
  });
  return { el: wrap.querySelector(".sheet-body"), close };
}
