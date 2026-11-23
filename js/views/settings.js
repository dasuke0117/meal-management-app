import { getData, update, exportJson, importJson, resetAll } from "../store.js";
import { ACTIVITY, autoTarget, latestWeight, MIN_KCAL } from "../calc.js";
import { MODELS } from "../ai.js";
import { esc, num, ymd, fmtDate, toast } from "../util.js";

export function renderSettings(root) {
  const draw = () => { root.innerHTML = template(); };
  draw();

  // プロフィールは変更のたびに保存して目標を再計算
  root.addEventListener("change", (e) => {
    const t = e.target;
    if (t.closest("#profile-form")) {
      const fd = new FormData(root.querySelector("#profile-form"));
      update((d) => {
        d.profile = {
          sex: fd.get("sex") === "female" ? "female" : "male",
          age: Math.round(num(fd.get("age"), d.profile.age)),
          heightCm: num(fd.get("heightCm"), d.profile.heightCm),
          activity: num(fd.get("activity"), 1.375),
          goal: fd.get("goal"),
          pace: num(fd.get("pace"), 500),
        };
      });
      draw();
    } else if (t.id === "use-override") {
      update((d) => {
        if (t.checked) {
          const a = autoTarget(d.profile, d.weights);
          d.targetOverride = a ? { kcal: a.kcal, p: a.p, f: a.f, c: a.c } : { kcal: 2000, p: 100, f: 55, c: 275 };
        } else d.targetOverride = null;
      });
      draw();
    } else if (t.id === "model") {
      update((d) => { d.settings.model = t.value; });
      toast("モデルを変更しました");
    } else if (t.id === "import-file" && t.files[0]) {
      doImport(t.files[0], draw);
      t.value = "";
    }
  });

  root.addEventListener("submit", (e) => {
    e.preventDefault();
    if (e.target.id === "override-form") {
      const fd = new FormData(e.target);
      const v = { kcal: Math.round(num(fd.get("kcal"))), p: Math.round(num(fd.get("p"))), f: Math.round(num(fd.get("f"))), c: Math.round(num(fd.get("c"))) };
      if (!(v.kcal > 0)) return toast("kcal を入れてください");
      update((d) => { d.targetOverride = v; });
      toast("目標を保存しました");
      draw();
    } else if (e.target.id === "key-form") {
      const key = new FormData(e.target).get("apiKey").toString().trim();
      if (!key) return toast("APIキーを貼り付けてください");
      if (!key.startsWith("sk-ant-") && !confirm("一般的なAPIキーの形式（sk-ant-…）ではありません。このまま保存しますか？")) return;
      update((d) => { d.settings.apiKey = key; });
      toast("APIキーを保存しました");
      draw();
    }
  });

  root.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const act = b.dataset.act;
    if (act === "del-key") {
      if (!confirm("保存したAPIキーを削除しますか？")) return;
      update((d) => { d.settings.apiKey = ""; });
      toast("APIキーを削除しました");
      draw();
    } else if (act === "calc-from-auto") {
      const a = autoTarget(getData().profile, getData().weights);
      if (!a) return toast("自動計算には体重の記録が必要です");
      update((d) => { d.targetOverride = { kcal: a.kcal, p: a.p, f: a.f, c: a.c }; });
      draw();
    } else if (act === "export") {
      await doExport(root.querySelector("#include-key").checked);
      draw();
    } else if (act === "import") {
      root.querySelector("#import-file").click();
    } else if (act === "reset") {
      if (!confirm("すべての記録・定型食品・献立・設定を削除します。元に戻せません。よろしいですか？")) return;
      if (!confirm("本当に削除しますか？（先にエクスポートしておくことをおすすめします）")) return;
      resetAll();
      toast("すべてのデータを削除しました");
      draw();
    }
  });
}

async function doExport(includeKey) {
  const json = exportJson(includeKey);
  const name = `meal-backup-${ymd()}.json`;
  const file = new File([json], name, { type: "application/json" });
  let ok = false;
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: "食事管理バックアップ" });
      ok = true;
    }
  } catch (e) {
    if (e?.name === "AbortError") return; // 共有をキャンセル
  }
  if (!ok) {
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  update((d) => { d.settings.lastExport = new Date().toISOString(); });
  toast("エクスポートしました");
}

function doImport(file, after) {
  const reader = new FileReader();
  reader.onload = () => {
    if (!confirm("いまのデータをすべて、このファイルの内容で上書きします。よろしいですか？")) return;
    try {
      importJson(String(reader.result));
      toast("インポートしました");
      after();
    } catch (e) {
      alert(`インポートできませんでした：${e.message}`);
    }
  };
  reader.onerror = () => alert("ファイルを読み込めませんでした");
  reader.readAsText(file);
}

function maskKey(k) {
  if (!k) return "";
  return k.length <= 12 ? "••••" : `${k.slice(0, 7)}••••••••${k.slice(-4)}`;
}

function template() {
  const d = getData();
  const pr = d.profile;
  const a = autoTarget(pr, d.weights);
  const lw = latestWeight(d.weights);
  const ov = d.targetOverride;
  const lastExport = d.settings.lastExport ? new Date(d.settings.lastExport).toLocaleDateString("ja-JP") : "なし";
  const sel = (v, cur) => (String(v) === String(cur) ? "selected" : "");

  return `
    <section class="card">
      <h3>プロフィール</h3>
      <form id="profile-form" class="stack">
        <div class="seg" role="radiogroup" aria-label="性別">
          <label><input type="radio" name="sex" value="male" ${pr.sex !== "female" ? "checked" : ""}><span>男性</span></label>
          <label><input type="radio" name="sex" value="female" ${pr.sex === "female" ? "checked" : ""}><span>女性</span></label>
        </div>
        <div class="grid2">
          <label>年齢<input name="age" inputmode="numeric" value="${pr.age}"></label>
          <label>身長(cm)<input name="heightCm" inputmode="decimal" value="${pr.heightCm}"></label>
        </div>
        <label>活動量
          <select name="activity">${ACTIVITY.map((x) => `<option value="${x.v}" ${sel(x.v, pr.activity)}>${x.label}（×${x.v}）</option>`).join("")}</select>
        </label>
        <div class="grid2">
          <label>目的
            <select name="goal">
              <option value="lose" ${sel("lose", pr.goal)}>減量</option>
              <option value="maintain" ${sel("maintain", pr.goal)}>維持</option>
              <option value="gain" ${sel("gain", pr.goal)}>増量</option>
            </select>
          </label>
          ${pr.goal === "lose" ? `
          <label>減量ペース
            <select name="pace">
              <option value="250" ${sel(250, pr.pace)}>ゆっくり（−250）</option>
              <option value="500" ${sel(500, pr.pace)}>標準（−500）</option>
              <option value="750" ${sel(750, pr.pace)}>速め（−750）</option>
            </select>
          </label>` : `<input type="hidden" name="pace" value="${pr.pace}">`}
        </div>
        <p class="muted small">体重：${lw ? `${lw.kg}kg（${fmtDate(lw.date)}の記録）` : "未記録（記録画面で入力してください）"}</p>
      </form>
    </section>

    <section class="card">
      <h3>目標カロリー・PFC</h3>
      ${a ? `
        <table class="kv">
          <tr><th>基礎代謝</th><td>${a.bmr} kcal</td></tr>
          <tr><th>消費カロリー（TDEE）</th><td>${a.tdee} kcal</td></tr>
          <tr><th>自動計算の目標</th><td><b>${a.kcal} kcal</b></td></tr>
          <tr><th>PFC</th><td>P ${a.p}g / F ${a.f}g / C ${a.c}g</td></tr>
        </table>
        ${a.clamped ? `<p class="notice small">安全のため、目標は基礎代謝（最低${MIN_KCAL}kcal）を下回らないように調整しています。</p>` : ""}`
      : `<p class="muted">体重を記録すると自動計算されます。</p>`}
      <label class="check"><input type="checkbox" id="use-override" ${ov ? "checked" : ""}> 目標を手動で設定する</label>
      ${ov ? `
        <form id="override-form">
          <div class="grid4">
            <label>kcal<input name="kcal" inputmode="decimal" value="${ov.kcal}"></label>
            <label>P(g)<input name="p" inputmode="decimal" value="${ov.p}"></label>
            <label>F(g)<input name="f" inputmode="decimal" value="${ov.f}"></label>
            <label>C(g)<input name="c" inputmode="decimal" value="${ov.c}"></label>
          </div>
          <div class="grid2">
            <button type="button" class="btn" data-act="calc-from-auto">自動計算値を入れる</button>
            <button type="submit" class="btn primary">保存</button>
          </div>
        </form>` : ""}
    </section>

    <section class="card">
      <h3>AI（Claude API）</h3>
      ${d.settings.apiKey ? `
        <div class="row-card">
          <span>保存済みのキー：<code>${esc(maskKey(d.settings.apiKey))}</code></span>
          <button type="button" class="btn danger small" data-act="del-key">削除</button>
        </div>` : `<p class="muted small">APIキーは未設定です。</p>`}
      <form id="key-form" class="stack">
        <label>${d.settings.apiKey ? "新しいキーに差し替える" : "APIキー"}
          <input name="apiKey" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="sk-ant-...">
        </label>
        <button type="submit" class="btn primary">保存</button>
      </form>
      <label>モデル
        <select id="model">${MODELS.map((m) => `<option value="${m.id}" ${sel(m.id, d.settings.model)}>${m.label}</option>`).join("")}</select>
      </label>
      <details ${d.settings.apiKey ? "" : "open"}>
        <summary>APIキーの取得方法</summary>
        <ol class="howto">
          <li><a href="https://console.anthropic.com" target="_blank" rel="noopener">https://console.anthropic.com</a> にアクセスしてアカウントを作成します（iPhoneのSafariでできます）。</li>
          <li>「Billing」でクレジットを購入します（数ドルから。献立1回あたり数円〜十数円程度が目安）。</li>
          <li>「API Keys」→「Create Key」でキーを作成し、コピーします。</li>
          <li>この画面の「APIキー」欄に貼り付けて「保存」を押します。</li>
        </ol>
        <p class="notice small">キーはこのiPhoneの中にだけ保存され、AIに献立を頼むとき以外は外に送られません。他人に見せないでください。漏れたときは Console でそのキーを無効にして作り直してください。</p>
      </details>
    </section>

    <section class="card">
      <h3>データ</h3>
      <p class="small">データはこのiPhoneの中だけに保存されています。機種変更や万一に備えて、ときどきエクスポートしてファイルアプリなどに保存してください。</p>
      <p class="muted small">最後のエクスポート：${lastExport}</p>
      <label class="check"><input type="checkbox" id="include-key"> APIキーも含める</label>
      <div class="grid2">
        <button type="button" class="btn primary" data-act="export">エクスポート</button>
        <button type="button" class="btn" data-act="import">インポート</button>
      </div>
      <input type="file" id="import-file" accept="application/json,.json" hidden>
      <button type="button" class="btn danger wide" data-act="reset">全データを削除</button>
    </section>

    <section class="card">
      <h3>ホーム画面に追加するには</h3>
      <ol class="howto small">
        <li>iPhoneの Safari でこのページを開く</li>
        <li>画面下の共有ボタン（□に↑）をタップ</li>
        <li>「ホーム画面に追加」→「追加」</li>
        <li>ホーム画面のアイコンから起動すると全画面で使えます</li>
      </ol>
    </section>`;
}
