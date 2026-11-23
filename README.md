# 食事管理PWA

iPhone の Safari で「ホーム画面に追加」して使う、自分専用の食事管理アプリです。
ビルド不要の素の HTML / CSS / JavaScript（ES Modules）で、GitHub Pages にそのまま置けます。
仕様は [食事管理PWA_引き継ぎ.md](食事管理PWA_引き継ぎ.md) を参照してください。

## 機能
- 食事の記録（手入力 / 定型食品から選択）、日ごとの合計と目標の比較、体重の記録
- 目標カロリー・PFC の自動計算（Mifflin-St Jeor 式）と手動上書き
- グラフ（摂取カロリー・PFC・体重、7 / 30 / 90日）
- Claude API による献立立案と買い物リスト（APIキーは端末内にだけ保存）
- JSON エクスポート / インポート、全データ削除
- オフライン動作（Service Worker）

## ファイル構成
```
index.html              画面の骨組み
manifest.webmanifest    PWA 設定
sw.js                   Service Worker（ネット優先＋キャッシュ）
css/style.css
js/app.js               タブ切り替え
js/store.js             データ保存（localStorage）
js/calc.js              目標計算
js/ai.js                Claude API 呼び出し
js/util.js
js/views/*.js           記録 / グラフ / 献立 / 設定 の各画面
icons/                  アプリアイコン
```

## 公開手順（GitHub Pages）
1. GitHub で Public リポジトリを作り、ファイル一式を push
2. Settings → Pages → Source を「Deploy from a branch」、Branch を `main` / `(root)` にして Save
3. 数分後に `https://<ユーザー名>.github.io/<リポジトリ名>/` で公開されます

## 更新するとき
`sw.js` の `CACHE` の版数（`meal-app-v1` → `v2`…）を上げると、古いキャッシュが確実に入れ替わります。
ネット優先なので上げなくても次回のオンライン起動で新しいファイルが読まれます。

## ローカルで試す
ES Modules と Service Worker を使うので、ファイルを直接開くのではなく簡易サーバーで配信してください。
```
npx serve .
```
