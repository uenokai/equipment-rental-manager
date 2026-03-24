# 引継ぎメモ（Handoff）

最終更新: 2026-03-24

## 現在の進捗

| フェーズ | 内容 | 状態 |
|---|---|---|
| 1 | プロジェクト基盤構築 | ✅ 完了 |
| 2 | 機材マスタ管理 | ✅ 完了 |
| 3 | メイン画面（検索・レンタル・返却） | ✅ 完了 |
| 4 | E2Eテスト・仕上げ | ✅ 完了 |
| 5 | PyWebView移行（デスクトップアプリ化） | ✅ 完了 |
| 6 | コード品質改善 & UI微調整 | ✅ 完了 |
| 7 | .exe 化 & 配布準備 | ✅ 完了 |
| 8 | 画像認証によるレンタル登録機能 | ✅ 完了（`feature/image_authentication` ブランチ） |

## アーキテクチャ変更の経緯

**v1（フェーズ1〜4）**: Flask + ブラウザ構成。`起動.vbs` → `pythonw.exe` → ハートビート監視という回避策が重なっていた。

**v2（フェーズ5〜7）**: PyWebView によるデスクトップアプリ化に移行。
- `.exe` ダブルクリックで最大化状態で起動
- ウィンドウ × で即終了（ハートビート不要）
- 配布先PCにPython不要

**v3（フェーズ8）**: Azure AI Document Intelligence による画像解析機能を追加。
- PC画面キャプチャ（表組み）から機材ID・氏名・開始日・終了日を自動抽出
- レンタル中機材の競合検出・警告表示
- `.env` ファイルによる Azure 認証情報の管理

## 機能一覧

### レンタル管理画面（メイン）
- **商品コード検索**: コード入力 → 貸出可能 / レンタル中のステータス表示
- **レンタル登録（コード入力）**: 氏名・開始日・終了日を入力して登録
- **レンタル登録（画像から）**: PC画面キャプチャを Azure DI で解析し自動入力
- **返却処理**: レンタル中機材を返却済みに更新
- **レンタル履歴**: 機材ごとの貸出履歴を一覧表示

### 機材マスタ管理画面
- **機材一覧表示**: 登録済み機材の一覧
- **Excelインポート**: `.xlsx` から機材を一括同期（追加・更新・削除）

## 画像解析機能の詳細

- Azure AI Document Intelligence の `prebuilt-layout` モデルを使用
- 横型テーブル（1行目がヘッダー）・縦型テーブル（1列目がラベル）の両方に対応
- 日付フォーマット自動正規化（元号・各種区切り文字対応）
- 列名マッピングは `src/azure_ocr.py` の `FIELD_KEYWORDS` 辞書で管理

**精度が不十分な場合**: `src/azure_ocr.py` の先頭コメントに Azure OpenAI GPT-4o Vision への切り替え手順を記載。関数を差し替えるだけで動作する。

## 環境変数

| 変数名 | 用途 |
|---|---|
| `AZURE_DI_ENDPOINT` | Azure AI Document Intelligence エンドポイントURL |
| `AZURE_DI_KEY` | Azure AI Document Intelligence APIキー |

プロジェクトルートの `.env` ファイルに設定する（`.gitignore` で除外済み）。

## 未検証事項

- **別PCでの動作確認**: `.exe` + `data/` + `.env` を別PCにコピーして動作するかの確認
- **実際の業務画面キャプチャでの解析精度確認**: テストは自動生成画像で実施済み。実運用の画面で精度を検証する必要がある

## 既知の制限事項

- `data/` フォルダは `.exe` と同じディレクトリ階層に配置する必要がある
- 初回起動時に `data/rental.db` が存在しない場合は自動生成される
- Excelインポートは `.xlsx` 形式のみ対応（`.xls` / `.csv` は非対応）
- 画像解析はインターネット接続が必要（Azure API 呼び出しのため）

## 次に着手可能なタスク（提案）

1. **実際の業務画面での解析精度検証** — 本番キャプチャで Azure DI の精度を確認し、必要に応じて GPT-4o Vision へ切り替え
2. **レンタル期限切れアラート** — 返却予定日を過ぎた機材の自動表示
3. **レンタル中一覧** — 現在貸出中の機材をまとめて確認できる画面
4. **一括返却機能** — 複数機材をまとめて返却処理
5. **別PCでの動作確認** — `.exe` 配布の最終確認

## 主要ファイル

| ファイル | 役割 |
|---|---|
| `src/app.py` | Flask + PyWebView アプリケーション本体・全APIエンドポイント |
| `src/database.py` | SQLite DB操作（CRUD） |
| `src/azure_ocr.py` | Azure AI Document Intelligence クライアント・画像解析ロジック |
| `src/templates/index.html` | メイン画面HTML |
| `src/templates/equipment.html` | 機材マスタ画面HTML |
| `src/static/main.js` | メイン画面JS（検索・レンタル・返却・画像解析） |
| `src/static/equipment.js` | 機材マスタ画面JS（一覧・インポート） |
| `src/static/style.css` | スタイルシート |
| `build.spec` | PyInstaller ビルド設定 |
| `.env` | Azure 接続情報（gitignore 対象・各自設定） |

## Git

- リポジトリ: https://github.com/uenokai/equipment-rental-manager
- `master`: v2までの安定版
- `feature/image_authentication`: 画像解析機能（フェーズ8）— テスト完了・レビュー待ち
