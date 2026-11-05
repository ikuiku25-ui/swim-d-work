# SWIM D-work

競泳のコーチ1人と選手（5人以下）が、ドライランド（陸トレ）のメニューと実施記録をスマホで共有する PWA です。

- 選手：予定（ドライランド／水中練習／試合）を入れ、コーチのメニューを見ながら実施して記録する
- コーチ：全員の予定を見て、ドライランドの枠にメニューを入れ、計画と実績の差を確認する

| 文書 | 内容 |
| --- | --- |
| `docs/requirements.md` | 要件定義書 |
| `docs/design.md` | 設計（決定事項、テーブル、アクセス制御、通知） |
| `docs/setup.md` | 本番環境の準備手順 |
| `docs/operations.md` | 運用手順書（選手の追加、通知が届かないとき など） |
| `CLAUDE.md` | 開発の方針とコマンド |

技術構成：Vite + React + TypeScript（PWA）、Supabase（Postgres・Auth・Edge Functions）、Cloudflare Pages / Workers、Web Push。費用ゼロ（無料枠）で運用します。
