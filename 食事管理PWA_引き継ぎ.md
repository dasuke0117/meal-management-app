# 食事管理PWA 引き継ぎ書（Claude Code向け）

このファイルをリポジトリ直下に置いて「この仕様で実装して」と頼めば、そのまま作業を始められる内容にしてあります。

## 1. 前提
- 利用者は本人1人だけ。端末は **iPhoneのみ（Macなし）**。Safariの「ホーム画面に追加」で使う **PWA** として作る
- UIはすべて日本語
- **バックエンドなしの静的サイト**。公開は **GitHub Pages**
- データはすべて端末内（localStorage か IndexedDB）に保存。サーバー送信なし（AI献立の呼び出しだけ例外）
- 写真は不要
- ビルド工程なしの素のHTML/CSS/JS（ES Modules）を推奨。GitHub Pagesにそのまま置けて、iPhoneしかない本人でも保守しやすい

## 2. 機能要件
### 2-1. 食事の記録（メイン画面）
- 日付切り替え（◀ 今日 ▶）
- 1件 = 食品名・食事区分（朝/昼/夕/間食）・数量・カロリー・P・F・C
- 入力方法は2つ
  - **手入力**：名前とkcal/PFCを入力。「定型に保存」チェックで定型食品にも登録
  - **定型食品から選択**：よく使う食品をタップ→数量を指定して追加（栄養値は数量倍）
- 定型食品の追加・編集・削除画面
- その日の合計と目標値の比較（kcal、P、F、Cの進捗バー）
- その日の体重入力（1日1値）

### 2-2. 目標カロリー・PFCの自動計算
- 入力：性別・年齢・身長・体重（最新の記録値）・活動量・目的（減量/維持/増量）
- 基礎代謝：Mifflin-St Jeor式
  - 男性 = 10×体重kg + 6.25×身長cm − 5×年齢 + 5
  - 女性 = 10×体重kg + 6.25×身長cm − 5×年齢 − 161
- 消費カロリー(TDEE) = 基礎代謝 × 活動係数（ほぼ座りっぱなし1.2 / 軽い運動1.375 / 中程度1.55 / 活発1.725 / 非常に活発1.9）
- 目標kcal：減量 = TDEE − 500（ペース選択で −250/−500/−750 も可）、維持 = TDEE、増量 = TDEE + 300
  - 安全のため下限を基礎代謝程度（例：1200kcal）にクランプ
- PFC：たんぱく質 = 体重×1.6g（減量時は2.0g）、脂質 = 目標kcalの25%（÷9でg）、炭水化物 = 残り（÷4でg）
- 自動計算値を手動で上書きできるようにする

### 2-3. グラフ
- 期間切替：7日 / 30日 / 90日
- 摂取カロリー推移（目標ラインつき）
- PFC推移（g、積み上げ棒）
- 体重推移（折れ線）
- 外部ライブラリを使うならChart.jsをローカルに同梱（オフラインでも動くように）。SVG自作でも可

### 2-4. AI献立立案＋買い物リスト
- 入力：日数（1〜7日）、要望（好き嫌い・予算・調理の手間・使いたい食材など自由記述）
- AIに渡す情報：目標kcal/PFC、要望、定型食品一覧（参考）
- 出力（JSONで受けて画面表示）：
  - 日ごと・食事区分ごとの料理名、材料、kcal/PFCの目安
  - 買い物リスト（カテゴリ別：野菜・肉魚・乳製品・その他、数量つき）。チェックボックスで消し込み、状態は保存
- 各食事に「記録に追加」ボタン（献立をそのまま食事記録へ）
- 直近の献立と買い物リストは端末に保存して、再訪時も表示

### 2-5. 設定
- プロフィール（目標計算の入力値）
- Claude APIキー入力（端末内に保存。表示はマスク、削除ボタンあり）
- モデル選択（既定：`claude-opus-5-5`。安くしたい場合の選択肢として `claude-sonnet-5-5`、`claude-haiku-5-5`）
- **APIキーの取得方法の案内**を画面内に表示（下記4章）
- JSONエクスポート（ファイル保存/共有）・インポート（上書き確認つき）
- 全データ削除

## 3. AI呼び出しの技術メモ
- ブラウザから直接 Claude API を呼ぶ。キーは本人のものを本人の端末に保存する方式
- 公式SDK `@anthropic-ai/sdk` をブラウザで使う（例：`https://esm.sh/@anthropic-ai/sdk` からimport、またはファイルを同梱）
  - `new Anthropic({ apiKey, dangerouslyAllowBrowser: true })`（自分専用でキーが本人の端末にしかないので許容）
  - 素のfetchで呼ぶ場合はヘッダ `anthropic-dangerous-direct-browser-access: true` が必要
- モデルID：`claude-opus-5-5`（日付サフィックスは付けない）
- 出力は構造化出力で JSON を受け取る：`output_config: { format: { type: "json_schema", schema: {...} } }`
- 献立は出力が長くなるので **ストリーミング**（`client.messages.stream(...)` → `finalMessage()`）で受ける。`max_tokens` は 16000程度
- Opus 5.5 は effort 既定が `medium`。献立なら `output_config.effort: "medium"` で十分
- `stop_reason === "refusal"` の場合はエラーとして表示する処理を入れる
- エラー時（キー未設定・401・429・ネットワーク）は日本語でわかりやすく表示
- 実装時は Claude Code の `claude-api` スキルで最新の書き方を確認すること

## 4. APIキー取得手順（設定画面に表示する文言の案）
1. https://console.anthropic.com にアクセスしてアカウント作成（iPhoneのSafariで可）
2. 「Billing」でクレジットを購入（数ドルから。献立1回あたり数円〜十数円程度の目安）
3. 「API Keys」→「Create Key」でキーを作成し、コピー
4. このアプリの設定画面に貼り付けて保存
- 注意：キーはこのiPhone内にだけ保存される。他人に見せない。漏れたらConsoleで無効化して作り直す

## 5. iPhone / PWA 対応の注意
- `manifest.webmanifest`（name、start_url `./`、display `standalone`、アイコン192/512）
- `<link rel="apple-touch-icon" href="icons/icon-180.png">`、`apple-mobile-web-app-capable`、`viewport-fit=cover`
- Service Worker でアプリ本体をキャッシュしてオフラインでも記録できるようにする（更新が反映されるようネット優先＋キャッシュフォールバックがおすすめ）
- GitHub Pagesはサブパス（`/リポジトリ名/`）配信なので、パスはすべて相対パスにする
- 画面下部タブ（記録 / グラフ / 献立 / 設定）、セーフエリア（`env(safe-area-inset-bottom)`）対応
- 入力欄の文字サイズは16px以上（iOSの自動ズーム防止）。数値欄は `inputmode="decimal"`
- ホーム画面に追加したPWAはSafariのデータ自動削除（7日ルール）の対象外だが、念のためバックアップ（エクスポート）を促す表示を入れる

## 6. データ構造の案（localStorage、キー1つにJSONで保存でも可）
```js
{
  version: 1,
  profile: { sex: "male"|"female", age, heightCm, activity: 1.2..1.9, goal: "lose"|"maintain"|"gain", pace: 250|500|750 },
  targetOverride: null | { kcal, p, f, c },
  foods:   [{ id, name, unit: "1個", kcal, p, f, c }],          // 定型食品
  entries: [{ id, date: "YYYY-MM-DD", meal: "朝"|"昼"|"夕"|"間食", name, qty, kcal, p, f, c }],
  weights: { "YYYY-MM-DD": 65.2 },
  plan:    { createdAt, request, days: [...], shopping: [{ category, item, amount, checked }] },
  settings:{ apiKey, model: "claude-opus-5-5" }
}
```
- エクスポート時は apiKey を含めるか選べるようにする（既定は含めない）

## 7. 公開手順（GitHub Pages）
1. GitHubで Public リポジトリを作成（例：`meal-log`）し、ファイル一式をpush
2. リポジトリの Settings → Pages → Source を「Deploy from a branch」、Branch を `main` / `(root)` にして Save
3. 数分後に `https://<ユーザー名>.github.io/meal-log/` で公開される

## 8. iPhoneでのホーム画面追加手順（本人向け）
1. iPhoneの **Safari** で公開URLを開く
2. 画面下の共有ボタン（□に↑）をタップ
3. 「ホーム画面に追加」→「追加」
4. ホーム画面のアイコンから起動すると、アプリのように全画面で使える

## 9. 完成の確認項目
- 手入力と定型選択の両方で記録でき、合計と目標が正しく出る
- プロフィールを変えると目標kcal/PFCが再計算される
- グラフ3種が期間切替で正しく描画される
- APIキー設定後、献立と買い物リストが生成され、記録に追加できる
- エクスポート→全削除→インポートで元に戻る
- 機内モードでもアプリが開き、記録できる
