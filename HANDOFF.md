# HANDOFF — kameHachi-homepage

更新: 2026-08-28 / 更新者: Codex

## 現在地

- branch: `feature/cursor-codex-failover`（base `7f6fb15ca766e1c4983adc571230605eeb06049a`）
- root `AGENTS.md` に共通作業入口だけを追加した。アプリ、画像、Worker、公開設定は変更していない。
- 既存の住所、電話 `054-648-3030`、Googleマップ導線、OGP、Behold feed-idは維持。
- GitHub Pages workflowは存在するがclassic branch protectionは確認できない。
- 状態: ローカル作業完了・push/PR/deploy未実施。

## 次のタスク

1. 本変更のlocal commitを確認する。
2. 既存の公開サイト反映が必要な変更とは分離し、push/PR/deployは別承認で判断する。

## 完了条件

- 共通入口がAGENTSに1箇所だけある。
- アプリ・画像・連絡先・外部導線に差分がない。
- 変更がlocal branch内だけに留まる。

## 未解決の判断

- 既存のサイト変更をmainへ反映し、公開サイトで確認するかは別判断。
- favicon追加は別タスク。

## 触らないこと

- 電話番号、既存画像、Behold feed-id、`worker/wrangler.toml`。
