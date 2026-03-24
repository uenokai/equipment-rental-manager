# 機材レンタル管理ソフト

商品コードを軸に、機材のレンタル・返却・ステータス照会・履歴管理を行うデスクトップアプリケーションです。
専用ウィンドウで動作し、ブラウザは使用しません。

## アーキテクチャ概要

```
同一PC上
┌─────────────────────────────────┐
│  PyWebView（ブラウザウィンドウ）  │  ← フロントエンド表示
│       ↕ HTTP (localhost:5000)   │
│  Flask（Webサーバー）            │  ← バックエンド
│       ↕                         │
│  SQLite（data/rental.db）       │  ← DB（ローカル保存）
└─────────────────────────────────┘
         ↕ HTTPS（画像解析時のみ）
  Azure AI Document Intelligence   ← 外部APIは画像解析のみ
```

フロントエンド・バックエンド・DBはすべて**1台のPC上で完結**します。
外部通信は画像からのレンタル登録時に Azure AI Document Intelligence を呼び出す場合のみです。

## 機能一覧

### 📷 画像からレンタル登録

PC画面のキャプチャ（表組み）から機材情報を自動抽出してレンタル登録できます。

1. 「📷 画像からレンタル登録」セクションで画像を選択（またはドラッグ&ドロップ）
2. 「解析する」をクリック → Azure AI Document Intelligence が機材ID・氏名・開始日・終了日を自動抽出
3. 抽出結果を確認・修正して「このデータでレンタル登録」をクリック

> **注意**: 抽出した機材IDがすでにレンタル中の場合は、現在の貸出状況が警告表示され登録がブロックされます。

### 🔍 商品コードからレンタル登録

1. メイン画面で商品コードを入力し「検索」をクリック（Enterキーでも可）
2. ステータスが「貸出可能」であることを確認
3. 氏名・開始日・終了日を入力して「レンタル登録」をクリック

### 🔄 返却処理

1. メイン画面で商品コードを入力し「検索」をクリック
2. ステータスが「レンタル中」であることを確認
3. 「返却」ボタンをクリック

### 📋 レンタル履歴の確認

商品コードで検索すると、画面下部にその機材の過去のレンタル履歴が新しい順に一覧表示されます。

### 🗂 機材マスタ管理

1. 画面右上の「機材マスタ」リンクをクリック
2. Excelファイル（.xlsx）を用意する
   - **1行目**: ヘッダー行（読み飛ばされます）
   - **A列**: 商品コード
   - **B列**: 商品名
3. 「ファイルを選択」でExcelを選択し、「インポート」をクリック
4. 追加・更新・削除の件数が表示される

> **補足**: レンタル履歴がある機材はインポート時に自動で削除対象から除外されます。

## 別環境でのセットアップ

### パターンA: .exe をダウンロードして使う（推奨・Python不要）

1. [GitHub Releases](https://github.com/uenokai/equipment-rental-manager/releases) から `機材レンタル管理.exe` をダウンロード
2. 任意のフォルダに配置し、同じフォルダに `.env` ファイルを作成

```
AZURE_DI_ENDPOINT=https://xxxxx.cognitiveservices.azure.com/
AZURE_DI_KEY=xxxxxxxxxxxxxxxxxxxxxxxx
```

3. `機材レンタル管理.exe` をダブルクリックで起動

> **Pythonのインストールは不要**です。

### パターンB: リポジトリをクローンしてソースから起動（開発者向け）

```bash
git clone https://github.com/uenokai/equipment-rental-manager
cd equipment-rental-manager

# 仮想環境を作成してパッケージをインストール
python -m venv venv
.\venv\Scripts\pip install -r requirements.txt

# .env を作成して Azure 接続情報を記載（上記参照）

# 起動
cd src
..\venv\Scripts\python app.py
```

> **終了方法**: ウィンドウの × ボタンをクリックするとアプリが終了します。

## データの引継ぎ・バックアップ

`data/rental.db` ファイル1つに全データ（機材マスタ＋レンタル履歴）が格納されています。
このファイルをコピーするだけでバックアップ・別PCへの移行が完了します。

| 対象 | 用途 |
|---|---|
| `機材レンタル管理.exe` | アプリ本体 |
| `data/rental.db` | 全データ（機材マスタ＋レンタル履歴） |
| `.env` | Azure 接続情報（画像解析を使う場合） |

## データバックアップ

`data/rental.db` ファイル1つに全データ（機材マスタ＋レンタル履歴）が格納されています。
このファイルをコピーするだけでバックアップが完了します。

## 開発者向け情報

### セットアップ（開発環境）

```bash
# 1. プロジェクトフォルダに移動
cd 機材レンタル管理ソフト

# 2. 仮想環境を作成
python -m venv venv

# 3. 依存パッケージをインストール
.\venv\Scripts\pip.exe install -r requirements.txt

# 4. .env を編集して Azure 接続情報を設定
```

### 開発時の起動

```bash
cd src
..\venv\Scripts\python.exe app.py
```

### .exe ビルド

```bash
.\venv\Scripts\pyinstaller.exe build.spec --distpath dist --workpath build_temp --clean
```

### アーキテクチャ

```
機材レンタル管理ソフト/
├── .env                     # Azure 接続情報（gitignore 対象）
├── build.spec               # PyInstaller ビルド設定
├── requirements.txt         # 依存パッケージ
├── src/
│   ├── app.py               # Flask + PyWebView アプリケーション
│   ├── database.py          # SQLite DB操作
│   ├── azure_ocr.py         # Azure AI Document Intelligence クライアント
│   ├── templates/           # HTMLテンプレート
│   └── static/              # CSS / JS
├── data/
│   └── rental.db            # SQLiteデータベース（自動生成）
├── dist/
│   └── 機材レンタル管理.exe  # ビルド済み実行ファイル
└── docs/
    ├── README.md             # このファイル
    ├── requirements.md       # 要件定義
    ├── task.md               # タスク計画
    └── handoff.md            # 引継ぎメモ
```

### 技術スタック

| 項目 | 技術 |
|---|---|
| バックエンド | Python + Flask |
| データベース | SQLite（ローカル） |
| フロントエンド | HTML / CSS / JavaScript |
| デスクトップ表示 | pywebview |
| 画像解析 | Azure AI Document Intelligence |
| 配布 | PyInstaller（.exe 化） |
