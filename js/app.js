import { renderRecord } from "./views/record.js";
import { renderCharts } from "./views/charts.js";
import { renderPlan } from "./views/plan.js";
import { renderSettings } from "./views/settings.js";

const VIEWS = {
  record: { title: "記録", render: renderRecord },
  charts: { title: "グラフ", render: renderCharts },
  plan: { title: "献立", render: renderPlan },
  settings: { title: "設定", render: renderSettings },
};

const titleEl = document.getElementById("page-title");
let current = null;

export function show(tab) {
  if (!VIEWS[tab]) tab = "record";
  current = tab;
  document.querySelectorAll(".tabbar button").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  titleEl.textContent = VIEWS[tab].title;
  // 画面ごとにイベントを付け直すため、要素を作り直す
  const old = document.getElementById("view");
  const fresh = old.cloneNode(false);
  old.replaceWith(fresh);
  VIEWS[tab].render(fresh);
  window.scrollTo(0, 0);
  if (location.hash !== "#" + tab) history.replaceState(null, "", "#" + tab);
}

document.querySelector(".tabbar").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-tab]");
  if (b && b.dataset.tab !== current) show(b.dataset.tab);
});

show(location.hash.slice(1) || "record");

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
