import { getData, update, uid } from "../store.js";
import { currentTarget, sumEntries } from "../calc.js";
import { estimateNutrition, AiError } from "../ai.js";
import { MEALS, esc, ymd, addDays, fmtDate, num, round1, guessMeal, toast, openSheet } from "../util.js";

let date = ymd();

export function setRecordDate(d) {
  date = d;
}

export function renderRecord(root) {
  const draw = () => {
    root.innerHTML = template();
  };
  draw();

  root.addEventListener("click", (e) => {
    const t = e.target.closest("[data-act]");
    if (!t) return;
    const act = t.dataset.act;
    if (act === "prev") { date = addDays(date, -1); draw(); }
    else if (act === "next") { date = addDays(date, 1); draw(); }
    else if (act === "today") { date = ymd(); draw(); }
    else if (act === "add") openAddSheet(draw);
    else if (act === "foods") openFoodManager(draw);
    else if (act === "del") {
      const id = t.dataset.id;
      const en = getData().entries.find((x) => x.id === id);
      if (en && confirm(`「${en.name}」を削除しますか？`)) {
        update((d) => { d.entries = d.entries.filter((x) => x.id !== id); });
        draw();
      }
    } else if (act === "save-weight") {
      const input = root.querySelector("#weight");
      const v = num(input.value, NaN);
      update((d) => {
        if (Number.isFinite(v) && v > 0) d.weights[date] = round1(v);
        else delete d.weights[date];
      });
      toast(Number.isFinite(v) && v > 0 ? "体重を保存しました" : "体重を消去しました");
      draw();
    } else if (act === "go-settings") {
      document.querySelector('.tabbar [data-tab="settings"]').click();
    }
  });

  root.addEventListener("change", (e) => {
    if (e.target.id === "date-pick" && e.target.value) { date = e.target.value; draw(); }
  });
}

function bar(label, val, target, unit) {
  const pct = target ? Math.min(100, (val / target) * 100) : 0;
  const over = target && val > target * 1.05;
  return `
    <div class="bar-row">
      <div class="bar-label"><span>${label}</span><span class="${over ? "over" : ""}">${Math.round(val)}${target ? ` / ${Math.round(target)}` : ""} ${unit}</span></div>
      <div class="bar"><div class="bar-fill ${over ? "over" : ""}" style="width:${pct}%"></div></div>
    </div>`;
}

function backupBanner(d) {
  if (!d.entries.length) return "";
  const last = d.settings.lastExport ? new Date(d.settings.lastExport) : null;
  const days = last ? (Date.now() - last.getTime()) / 86400000 : Infinity;
  if (days < 14) return "";
  const msg = last ? `最後のバックアップから${Math.floor(days)}日たちました。` : "まだバックアップがありません。";
  return `<div class="notice">${msg}念のため設定画面からエクスポートしておきましょう。<button type="button" class="link" data-act="go-settings">設定へ</button></div>`;
}

function template() {
  const d = getData();
  const today = ymd();
  const list = d.entries.filter((x) => x.date === date);
  const sum = sumEntries(list);
  const tgt = currentTarget(d);
  const w = d.weights[date];

  const summary = tgt
    ? `${bar("カロリー", sum.kcal, tgt.kcal, "kcal")}${bar("たんぱく質 P", sum.p, tgt.p, "g")}${bar("脂質 F", sum.f, tgt.f, "g")}${bar("炭水化物 C", sum.c, tgt.c, "g")}
       <p class="muted small">残り ${Math.round(tgt.kcal - sum.kcal)} kcal${tgt.manual ? "（目標は手動設定）" : ""}</p>`
    : `${bar("カロリー", sum.kcal, 0, "kcal")}
       <p class="muted small">P ${round1(sum.p)}g / F ${round1(sum.f)}g / C ${round1(sum.c)}g</p>
       <p class="small">目標を出すには、設定でプロフィールを入力し、体重を記録してください。</p>`;

  const meals = MEALS.map((m) => {
    const items = list.filter((x) => x.meal === m);
    if (!items.length) return "";
    const s = sumEntries(items);
    return `
      <section class="card meal">
        <h3>${m}<span class="muted small">${Math.round(s.kcal)} kcal</span></h3>
        <ul class="entries">
          ${items.map((x) => `
            <li>
              <div class="entry-main">
                <div class="entry-name">${esc(x.name)}${x.qty !== 1 ? ` <span class="muted">×${x.qty}</span>` : ""}</div>
                <div class="muted small">${Math.round(x.kcal)}kcal・P${round1(x.p)} F${round1(x.f)} C${round1(x.c)}</div>
              </div>
              <button type="button" class="btn-icon" data-act="del" data-id="${x.id}" aria-label="削除">🗑</button>
            </li>`).join("")}
        </ul>
      </section>`;
  }).join("");

  return `
    <div class="date-nav">
      <button type="button" class="btn-icon big" data-act="prev" aria-label="前の日">◀</button>
      <label class="date-label">
        <span>${fmtDate(date)}${date === today ? "（今日）" : ""}</span>
        <input type="date" id="date-pick" value="${date}" aria-label="日付を選ぶ">
      </label>
      <button type="button" class="btn-icon big" data-act="next" aria-label="次の日">▶</button>
    </div>
    ${date !== today ? `<div class="center"><button type="button" class="btn small" data-act="today">今日に戻る</button></div>` : ""}
    ${backupBanner(d)}
    <section class="card">${summary}</section>
    <section class="card row-card">
      <label for="weight">体重</label>
      <input id="weight" type="text" inputmode="decimal" placeholder="例 65.2" value="${w ?? ""}">
      <span>kg</span>
      <button type="button" class="btn" data-act="save-weight">保存</button>
    </section>
    ${meals || `<p class="muted center">この日の記録はまだありません</p>`}
    <div class="actions">
      <button type="button" class="btn primary wide" data-act="add">＋ 食事を追加</button>
      <button type="button" class="btn wide" data-act="foods">定型食品の管理</button>
    </div>`;
}

/* ---------- 食事追加シート ---------- */

function mealSelect(selected) {
  return `<div class="seg" role="radiogroup" aria-label="食事区分">
    ${MEALS.map((m) => `<label><input type="radio" name="meal" value="${m}" ${m === selected ? "checked" : ""}><span>${m}</span></label>`).join("")}
  </div>`;
}

function openAddSheet(onDone) {
  const d = getData();
  const sheet = openSheet(`${fmtDate(date)} に追加`, `
    ${mealSelect(guessMeal())}
    <div class="tabs">
      <button type="button" class="tab ${d.foods.length ? "active" : ""}" data-mode="fixed">定型食品から</button>
      <button type="button" class="tab ${d.foods.length ? "" : "active"}" data-mode="manual">手入力</button>
    </div>
    <div data-pane="fixed" ${d.foods.length ? "" : "hidden"}>
      ${d.foods.length ? `
        <input type="search" id="food-q" placeholder="食品を検索">
        <ul class="food-list" id="food-list"></ul>
        <div id="qty-box" class="qty-box" hidden></div>`
      : `<p class="muted">定型食品がまだありません。手入力で「定型に保存」にチェックするか、「定型食品の管理」から登録できます。</p>`}
    </div>
    <form data-pane="manual" id="manual-form" ${d.foods.length ? "hidden" : ""}>
      ${foodFields({ name: "", unit: "", kcal: "", p: "", f: "", c: "" }, true)}
      <label class="check"><input type="checkbox" name="saveFixed"> 定型に保存</label>
      <button type="submit" class="btn primary wide">記録する</button>
    </form>`);

  const el = sheet.el;
  const meal = () => el.querySelector('input[name="meal"]:checked').value;
  bindEstimate(el);
  let picked = null;

  const drawFoods = () => {
    const ul = el.querySelector("#food-list");
    if (!ul) return;
    const q = (el.querySelector("#food-q").value || "").trim();
    const foods = getData().foods.filter((f) => !q || f.name.includes(q));
    ul.innerHTML = foods.map((f) => `
      <li><button type="button" class="food-btn ${picked?.id === f.id ? "sel" : ""}" data-food="${f.id}">
        <span>${esc(f.name)} <span class="muted small">${esc(f.unit || "")}</span></span>
        <span class="muted small">${Math.round(f.kcal)}kcal</span>
      </button></li>`).join("") || `<li class="muted">該当なし</li>`;
  };
  const drawQty = () => {
    const box = el.querySelector("#qty-box");
    if (!picked) { box.hidden = true; return; }
    box.hidden = false;
    box.innerHTML = `
      <div class="qty-title">${esc(picked.name)} <span class="muted small">${esc(picked.unit || "1単位")}あたり ${Math.round(picked.kcal)}kcal</span></div>
      <div class="stepper">
        <button type="button" class="btn-icon big" data-step="-0.5">−</button>
        <input type="text" inputmode="decimal" id="qty" value="1" aria-label="数量">
        <button type="button" class="btn-icon big" data-step="0.5">＋</button>
      </div>
      <div class="muted small" id="qty-preview"></div>
      <button type="button" class="btn primary wide" id="add-fixed">追加する</button>`;
    preview();
  };
  const preview = () => {
    const q = num(el.querySelector("#qty").value, 0);
    el.querySelector("#qty-preview").textContent =
      `合計 ${Math.round(picked.kcal * q)}kcal・P${round1(picked.p * q)} F${round1(picked.f * q)} C${round1(picked.c * q)}`;
  };

  drawFoods();

  el.addEventListener("click", (e) => {
    const tab = e.target.closest("[data-mode]");
    if (tab) {
      el.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b === tab));
      el.querySelectorAll("[data-pane]").forEach((p) => (p.hidden = p.dataset.pane !== tab.dataset.mode));
      return;
    }
    const fb = e.target.closest("[data-food]");
    if (fb) {
      picked = getData().foods.find((f) => f.id === fb.dataset.food);
      drawFoods();
      drawQty();
      el.querySelector("#qty-box").scrollIntoView({ behavior: "smooth", block: "nearest" });
      return;
    }
    const st = e.target.closest("[data-step]");
    if (st) {
      const input = el.querySelector("#qty");
      input.value = Math.max(0.5, round1(num(input.value, 1) + parseFloat(st.dataset.step)));
      preview();
      return;
    }
    if (e.target.id === "add-fixed") {
      const q = num(el.querySelector("#qty").value, 0);
      if (!(q > 0)) return toast("数量を入れてください");
      addEntry({
        meal: meal(), name: picked.name + (picked.unit ? `（${picked.unit}）` : ""), qty: q,
        kcal: picked.kcal * q, p: picked.p * q, f: picked.f * q, c: picked.c * q,
      });
      sheet.close();
      onDone();
    }
  });
  el.addEventListener("input", (e) => {
    if (e.target.id === "food-q") drawFoods();
    if (e.target.id === "qty") preview();
  });
  el.querySelector("#manual-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const food = readFood(fd);
    if (!food) return;
    const qty = num(fd.get("qty"), 1) || 1;
    addEntry({
      meal: meal(), name: food.name + (food.unit ? `（${food.unit}）` : ""), qty,
      kcal: food.kcal * qty, p: food.p * qty, f: food.f * qty, c: food.c * qty,
    });
    if (fd.get("saveFixed")) update((d) => d.foods.push({ id: uid(), ...food }));
    sheet.close();
    onDone();
  });
}

function addEntry(e) {
  update((d) => d.entries.push({
    id: uid(), date, meal: e.meal, name: e.name, qty: round1(e.qty),
    kcal: Math.round(e.kcal), p: round1(e.p), f: round1(e.f), c: round1(e.c),
  }));
  toast("記録しました");
}

/* ---------- 定型食品 ---------- */

function foodFields(f, withQty) {
  return `
    <label>食品名<input name="name" required value="${esc(f.name)}" placeholder="例 ゆで卵"></label>
    <div class="grid2">
      <label>単位<input name="unit" value="${esc(f.unit)}" placeholder="例 1個"></label>
      ${withQty ? `<label>数量<input name="qty" inputmode="decimal" value="1"></label>` : "<span></span>"}
    </div>
    <button type="button" class="btn ai wide" data-ai-est>✨ AIでkcal・PFCを推定</button>
    <p class="muted small ai-note" data-ai-note>食品名と単位（例「ご飯」「150g」）を入れて押すと、下の値を自動で入れます。単位が空なら1人前で推定します。</p>
    <p class="muted small">以下は単位あたりの値</p>
    <div class="grid4">
      <label>kcal<input name="kcal" inputmode="decimal" value="${f.kcal}" required></label>
      <label>P(g)<input name="p" inputmode="decimal" value="${f.p}"></label>
      <label>F(g)<input name="f" inputmode="decimal" value="${f.f}"></label>
      <label>C(g)<input name="c" inputmode="decimal" value="${f.c}"></label>
    </div>`;
}

/** container 内の「AIで推定」ボタンを有効にする */
function bindEstimate(container) {
  container.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-ai-est]");
    if (!btn || btn.disabled) return;
    const form = btn.closest("form");
    const name = form.name.value.trim();
    if (!name) return toast("先に食品名を入れてください");
    const note = form.querySelector("[data-ai-note]");
    const d = getData();
    if (!d.settings.apiKey) {
      note.textContent = "AIで推定するには、設定画面でAPIキーを保存してください。";
      return;
    }
    const label = btn.textContent;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span> 推定中…`;
    try {
      const r = await estimateNutrition({ apiKey: d.settings.apiKey, model: d.settings.model, name, unit: form.unit.value.trim() });
      if (!form.isConnected) return;
      if (!form.unit.value.trim()) form.unit.value = r.unit;
      form.kcal.value = Math.round(r.kcal);
      form.p.value = round1(r.p);
      form.f.value = round1(r.f);
      form.c.value = round1(r.c);
      note.textContent = `AIの推定値です（${r.note}）。必要なら直してください。`;
    } catch (err) {
      note.textContent = err instanceof AiError ? err.message : `エラーが発生しました：${err?.message || err}`;
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  });
}

function readFood(fd) {
  const name = String(fd.get("name") || "").trim();
  if (!name) { toast("食品名を入れてください"); return null; }
  const kcal = num(fd.get("kcal"), NaN);
  if (!Number.isFinite(kcal) || kcal < 0) { toast("kcal を数値で入れてください"); return null; }
  return {
    name, unit: String(fd.get("unit") || "").trim(), kcal: round1(kcal),
    p: round1(num(fd.get("p"))), f: round1(num(fd.get("f"))), c: round1(num(fd.get("c"))),
  };
}

function openFoodManager(onDone) {
  const sheet = openSheet("定型食品の管理", `<div id="fm"></div>`);
  const el = sheet.el;
  let editing = null; // null=一覧, "new" or id=フォーム
  bindEstimate(el);

  const draw = () => {
    const foods = getData().foods;
    const box = el.querySelector("#fm");
    if (editing) {
      const f = editing === "new" ? { name: "", unit: "", kcal: "", p: "", f: "", c: "" } : foods.find((x) => x.id === editing);
      box.innerHTML = `
        <form id="food-form">
          ${foodFields(f, false)}
          <div class="grid2">
            <button type="button" class="btn" data-fm="cancel">戻る</button>
            <button type="submit" class="btn primary">保存</button>
          </div>
        </form>`;
      box.querySelector("#food-form").addEventListener("submit", (e) => {
        e.preventDefault();
        const food = readFood(new FormData(e.target));
        if (!food) return;
        update((d) => {
          if (editing === "new") d.foods.push({ id: uid(), ...food });
          else Object.assign(d.foods.find((x) => x.id === editing), food);
        });
        editing = null;
        toast("保存しました");
        draw();
      });
      return;
    }
    box.innerHTML = `
      <button type="button" class="btn primary wide" data-fm="new">＋ 新しい定型食品</button>
      <ul class="entries">
        ${foods.map((f) => `
          <li>
            <div class="entry-main">
              <div class="entry-name">${esc(f.name)} <span class="muted small">${esc(f.unit || "")}</span></div>
              <div class="muted small">${Math.round(f.kcal)}kcal・P${f.p} F${f.f} C${f.c}</div>
            </div>
            <button type="button" class="btn-icon" data-fm="edit" data-id="${f.id}" aria-label="編集">✏️</button>
            <button type="button" class="btn-icon" data-fm="del" data-id="${f.id}" aria-label="削除">🗑</button>
          </li>`).join("") || `<li class="muted">まだありません</li>`}
      </ul>`;
  };
  draw();

  el.addEventListener("click", (e) => {
    const b = e.target.closest("[data-fm]");
    if (!b) return;
    const act = b.dataset.fm;
    if (act === "new") editing = "new";
    else if (act === "edit") editing = b.dataset.id;
    else if (act === "cancel") editing = null;
    else if (act === "del") {
      const f = getData().foods.find((x) => x.id === b.dataset.id);
      if (!f || !confirm(`「${f.name}」を削除しますか？（記録済みの食事は消えません）`)) return;
      update((d) => { d.foods = d.foods.filter((x) => x.id !== b.dataset.id); });
    }
    draw();
    onDone();
  });
}
