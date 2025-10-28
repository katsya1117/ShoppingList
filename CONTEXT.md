# ShoppingListApp コンテキストメモ（開発者向け）

このリポジトリで作るものを、別スレッドでも1〜2分で把握できるように要点整理。

## 概要
- 目的: 夫婦2人向けの在庫管理Webアプリ。固定マスタの各項目に「在庫あり/なし」を素早く付け替える。
- 対応: iPhone/PC の Safari・Chrome。PWA風の軽量UI想定。
- 認証: ログインなし。秘密キー付きURL（例: `?k=abc123`）で限定アクセス。

## 技術構成
- フレームワーク: ASP.NET Core 8（Razor Pages）
- データアクセス: Entity Framework Core（Code-First）
- DB（開発）: SQLite（`app.db`）
- DB（本番）: Azure SQL Database（接続文字列差し替えで移行）
- ホスティング（想定）: Azure App Service
- フロント: HTML + 少量のJS（`fetch` / `localStorage`）

## ドメインモデル（最小）
- Item
  - `Id:int`, `Name:string`, `Category:string`
- ItemAvailability（1世帯前提で `ItemId` = 主キー）
  - `ItemId:int`, `IsAvailable:bool`, `UpdatedAt:DateTime`, `UpdatedBy:string`, `RowVersion:byte[]`(楽観ロック)

## 主要機能
- 在庫トグル
  - 一覧（`/`）にカテゴリ別リスト。スイッチ変更で即APIへPATCH。
  - `localStorage.nick` を初回入力・保存し、更新者に使用。
- サジェスト追加
  - `/add`で入力中に前方一致サジェスト（マスタから候補提示）。
  - 未登録の場合は「マスタに追加しますか？」確認→追加。

## API（Minimal API想定）
- GET `/api/items?prefix=...&limit=...&k=...`
  - 前方一致でマスタ検索。0件なら `exists=false` を返却。
- POST `/api/items?k=...`
  - マスタへ新規追加。必要なら `ItemAvailability` を初期化（既定は `IsAvailable=false`）。
- PATCH `/api/availability/{itemId}?k=...`
  - 在庫フラグを更新。`UpdatedAt/UpdatedBy` も保存。`RowVersion` 競合時は `409`。

## セキュリティ
- 固定の秘密キーをコードで保持（例: `const string SecretKey = "abc123";`）。
- すべてのAPIは `?k=` の検証を行う。不一致は `401 Unauthorized`。
- 後日、環境変数やキー発行方式への拡張が容易。

## 画面構成（初期）
- `/`（一覧）: カテゴリごとに行を表示。トグルで在庫更新。フィルタ（在庫なしのみ）と検索（任意）。
- `/add`（追加）: 入力→サジェスト。未登録時は追加確認→マスタ登録。
- 共通: 下部固定バーに「＋追加」「ニックネーム設定」。

## ディレクトリ（想定）
```
ShoppingListApp/
├─ Program.cs                # ルート定義、API、DbContext登録
├─ Data/AppDbContext.cs      # DbContext
├─ Models/Item.cs            # マスタモデル
├─ Models/ItemAvailability.cs# 在庫フラグモデル
├─ Pages/Index.cshtml        # 一覧＋トグル
├─ Pages/Add.cshtml          # サジェスト＋追加
└─ wwwroot/js/app.js         # fetch・トグル・サジェスト処理
```

## 開発フロー（最短）
1) Razor Pagesテンプレート作成（.NET 8）
2) モデルと `AppDbContext` 定義 → マイグレーション作成
3) Minimal API（GET/POST/PATCH）実装、`SecretKey` 導入
4) UI（`/` と `/add`）作成、`fetch` でAPI連携
5) SQLiteで動作確認 → 接続先をAzure SQLに切替

## メモ
- Seedデータは任意（なくても運用可）。
- 同時更新は `RowVersion` の楽観ロックで衝突検出。
- 後で世帯や履歴が必要なら `Household` や `ItemAvailabilityLog` を追加し拡張。

---
このメモが「プロジェクトは何で、何をどう作るか」を最速で共有する前提情報です。
