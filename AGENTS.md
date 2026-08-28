# kameHachi-homepage 開発ガードレール

## 作業開始の共通入口

- 編集前に `HANDOFF.md` と該当する `docs/strategy/` を読む（該当文書が無ければ、その事実を記録する）。
- 正本が `/Users/ogawayuusaku/projects/kameHachi-homepage` であることと、branch・HEAD・dirty・worktreeを確認する。
- 最新のユーザー指示を操作権限の上限とし、下位操作の許可から上位操作を推測しない。
- 正本、権限、writer、Git状態が不明なら、編集前に `HUMAN_DECISION_REQUIRED` で停止する。

> 亀八茶屋（クライアント）の公式ホームページ。**実運用中のサイト**であり、壊すと直接お客様の目に触れる。
> この文書が Claude / Codex 双方が読む規約の正本。`CLAUDE.md` は本ファイルを参照するだけ。

## このリポジトリの性質

- **静的サイト**。ビルド工程なし。`index.html` を直接編集して反映する
- `worker/`（Cloudflare Worker）: `social-feed.js` / `schema.sql` / `wrangler.toml`。Instagram等のフィード取得を担う
- 画像は `hero-*.jpg`（トップのスライド）と `activity-*.jpg`（活動紹介）の連番運用
- `ogp.jpg` は SNS シェア時のサムネイル。**欠けるとシェアが無地になる**

## 絶対禁止

- `wrangler.toml` のトークン・シークレット値をコードやログに書かない
- `wrangler deploy` を確認なしに実行しない（本番 Worker に即反映される）
- クライアントの連絡先・LINE アカウントID・予約導線のURLを**推測で書き換えない**。必ず既存の値を踏襲する
- 画像ファイルを無断で削除・上書きしない（撮影素材の再取得が困難）

## 開発原則

- **1コミット1目的**。「ついでに整形」を混ぜない（静的HTMLは差分が読めなくなると事故る）
- 変更後は必ずブラウザで実表示を確認する。特に**スマートフォン幅**（来訪の大半がスマホ）
- 画像を追加したら `index.html` からの参照と `ogp.jpg` の整合を確認する
- 文言はクライアントの言葉づかいを優先する。こちらの語彙で言い換えない

## 構成の要点

```
index.html          サイト本体（単一ファイル）
hero-*.jpg          トップスライド用
activity-*.jpg      活動紹介用
ogp.jpg             OGP（SNSサムネイル）
worker/             Cloudflare Worker（social-feed.js / schema.sql / wrangler.toml）
docs/strategy/      Claude が書く戦略・要件（実装はここを根拠にする）
HANDOFF.md          現在地と次の1手
```

---
*2026-08-18 Claude がリポジトリ実査に基づき起草。オーナー（小川）の確認・加筆を前提とする暫定版。*
