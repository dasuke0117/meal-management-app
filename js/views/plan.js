import { getData, update, uid } from "../store.js";
import { currentTarget } from "../calc.js";
import { generatePlan, AiError } from "../ai.js";
import { MEALS, esc, ymd, addDays, fmtDate, round1, toast } from "../util.js";

const CATEGORIES = ["野菜", "肉魚", "乳製品", "その他"];

// 生成中にタブを切り替えても状態を保つため、モジュール側に持つ
let busy = false;
let progress = 0;
let lastError = "";
let form = { days: 3, request: "" };
let activeRoot = null;

export function renderPlan(root) {
  activeRoot = root;
  const draw = () => {
    if (root !== activeRoot || !root.isConnected) return;
    const keepScroll = window.scrollY;
    root.innerHTML = template();
    window.scrollTo(0, keepScroll);
  };
  draw();

  root.addEventListener("input", (e) => {
    if (e.target.id === "plan-request") form.request = e.target.value;
  });

  root.addEventListener("change", (e) => {
    const t = e.target;
    if (t.id === "plan-days") form.days = +t.value;
    else if (t.id === "plan-start") update((d) => { d.plan.startDate = t.value; });
    else if (t.dataset.shop != null) {
      update((d) => { d.plan.shopping[+t.dataset.shop].checked = t.checked; });
      draw();
    }
  });

  root.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const act = b.dataset.act;
    if (act === "go-settings") document.querySelector('.tabbar [data-tab="settings"]').click();
    else if (act === "generate") {
      if (busy) return;
      const d = getData();
      if (d.plan && !confirm("いまの献立と買い物リストを新しいものに置き換えます。よろしいですか？")) return;
      busy = true; progress = 0; lastError = "";
      draw();
      let lastDraw = 0;
      try {
        const res = await generatePlan(
          {
            apiKey: d.settings.apiKey, model: d.settings.model, days: form.days,
            request: form.request, target: currentTarget(d), foods: d.foods,
          },
          (chars) => {
            progress = chars;
            const now = Date.now();
            if (now - lastDraw > 300) {
              lastDraw = now;
              const el = activeRoot?.querySelector("#progress");
              if (el) el.textContent = `${chars.toLocaleString()} 文字受信`;
            }
          }
        );
        update((dd) => {
          dd.plan = {
            createdAt: new Date().toISOString(),
            request: form.request,
            dayCount: form.days,
            startDate: ymd(),
            model: res.model,
            notes: res.notes,
            days: res.days
              .slice()
              .sort((a, b) => a.day - b.day)
              .map((day) => ({
                day: day.day,
                meals: day.meals
                  .slice()
                  .sort((a, b) => MEALS.indexOf(a.meal) - MEALS.indexOf(b.meal))
                  .map((m) => ({ ...m, added: false })),
              })),
            shopping: res.shopping
              .slice()
              .sort((a, b) => CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category))
              .map((s) => ({ ...s, checked: false })),
          };
        });
        toast("献立ができました");
      } catch (err) {
        lastError = err instanceof AiError ? err.message : `エラーが発生しました：${err?.message || err}`;
      } finally {
        busy = false;
        // 画面を離れていたら次に開いたときに表示される
        if (activeRoot?.isConnected) {
          const r = activeRoot;
          r.innerHTML = template();
        }
      }
    } else if (act === "add-meal") {
      const [di, mi] = b.dataset.idx.split("-").map(Number);
      const p = getData().plan;
      const day = p.days[di];
      const m = day.meals[mi];
      const date = addDays(p.startDate || ymd(), day.day - 1);
      if (m.added && !confirm("この食事はすでに記録に追加済みです。もう一度追加しますか？")) return;
      update((d) => {
        d.entries.push({
          id: uid(), date, meal: m.meal, name: m.name, qty: 1,
          kcal: Math.round(m.kcal), p: round1(m.p), f: round1(m.f), c: round1(m.c),
        });
        d.plan.days[di].meals[mi].added = true;
      });
      toast(`${fmtDate(date)}の${m.meal}に追加しました`);
      draw();
    } else if (act === "uncheck-all") {
      update((d) => d.plan.shopping.forEach((s) => (s.checked = false)));
      draw();
    } else if (act === "dismiss-error") {
      lastError = "";
      draw();
    }
  });
}

function template() {
  const d = getData();
  const tgt = currentTarget(d);
  const hasKey = !!d.settings.apiKey;

  const formCard = `
    <section class="card">
      <h3>AIで献立を作る</h3>
      ${hasKey ? "" : `<div class="notice">AIを使うにはAPIキーの設定が必要です。<button type="button" class="link" data-act="go-settings">設定へ</button></div>`}
      <p class="muted small">${tgt ? `1日の目標：${tgt.kcal}kcal・P${tgt.p} F${tgt.f} C${tgt.c}` : "目標が未設定です（設定でプロフィールと体重を入れると目標に合わせた献立になります）"}</p>
      <label>日数
        <select id="plan-days">${[1, 2, 3, 4, 5, 6, 7].map((n) => `<option value="${n}" ${n === form.days ? "selected" : ""}>${n}日分</option>`).join("")}</select>
      </label>
      <label>要望（好き嫌い・予算・手間・使いたい食材など）
        <textarea id="plan-request" rows="4" placeholder="例：魚は苦手。平日の夜は15分以内で作れるもの。冷蔵庫のキャベツと卵を使いたい。1週間5000円以内。">${esc(form.request)}</textarea>
      </label>
      <button type="button" class="btn primary wide" data-act="generate" ${busy || !hasKey ? "disabled" : ""}>
        ${busy ? "作成中…" : "献立と買い物リストを作る"}
      </button>
      ${busy ? `<div class="busy"><span class="spinner"></span>AIが献立を考えています（1〜3分ほど）… <span id="progress">${progress ? `${progress.toLocaleString()} 文字受信` : ""}</span></div>` : ""}
      ${lastError ? `<div class="error">${esc(lastError).replace(/\n/g, "<br>")}<button type="button" class="link" data-act="dismiss-error">閉じる</button></div>` : ""}
    </section>`;

  const p = d.plan;
  if (!p) return formCard;

  const start = p.startDate || ymd();
  const days = p.days.map((day, di) => {
    const tot = day.meals.reduce((s, m) => ({ kcal: s.kcal + m.kcal, p: s.p + m.p, f: s.f + m.f, c: s.c + m.c }), { kcal: 0, p: 0, f: 0, c: 0 });
    return `
      <section class="card">
        <h3>${day.day}日目 <span class="muted small">${fmtDate(addDays(start, day.day - 1))}</span></h3>
        <p class="muted small">合計 ${Math.round(tot.kcal)}kcal・P${Math.round(tot.p)} F${Math.round(tot.f)} C${Math.round(tot.c)}</p>
        <ul class="plan-meals">
          ${day.meals.map((m, mi) => `
            <li>
              <div class="plan-meal-head">
                <span class="tag">${esc(m.meal)}</span>
                <span class="plan-name">${esc(m.name)}</span>
              </div>
              <div class="muted small">${Math.round(m.kcal)}kcal・P${round1(m.p)} F${round1(m.f)} C${round1(m.c)}</div>
              <details><summary>材料</summary><ul class="ingredients">${m.ingredients.map((i) => `<li>${esc(i)}</li>`).join("")}</ul></details>
              <button type="button" class="btn small ${m.added ? "" : "primary"}" data-act="add-meal" data-idx="${di}-${mi}">${m.added ? "✓ 追加済み" : "記録に追加"}</button>
            </li>`).join("")}
        </ul>
      </section>`;
  }).join("");

  const shop = CATEGORIES.map((cat) => {
    const items = p.shopping.map((s, i) => ({ ...s, i })).filter((s) => s.category === cat);
    if (!items.length) return "";
    return `
      <h4>${cat}</h4>
      <ul class="shop">
        ${items.map((s) => `
          <li class="${s.checked ? "done" : ""}">
            <label><input type="checkbox" data-shop="${s.i}" ${s.checked ? "checked" : ""}>
              <span class="shop-item">${esc(s.item)}</span><span class="muted">${esc(s.amount)}</span></label>
          </li>`).join("")}
      </ul>`;
  }).join("");
  const left = p.shopping.filter((s) => !s.checked).length;

  return `
    ${formCard}
    <section class="card">
      <h3>直近の献立</h3>
      <p class="muted small">${new Date(p.createdAt).toLocaleString("ja-JP")} 作成・${p.dayCount || p.days.length}日分${p.model ? `・${esc(p.model)}` : ""}</p>
      ${p.request ? `<p class="small">要望：${esc(p.request)}</p>` : ""}
      ${p.notes ? `<p class="small">${esc(p.notes)}</p>` : ""}
      <label>1日目の日付（「記録に追加」の日付になります）
        <input type="date" id="plan-start" value="${start}">
      </label>
    </section>
    ${days}
    <section class="card">
      <h3>買い物リスト <span class="muted small">残り ${left} / ${p.shopping.length}</span></h3>
      ${shop}
      <button type="button" class="btn small" data-act="uncheck-all">チェックをすべて外す</button>
    </section>`;
}
