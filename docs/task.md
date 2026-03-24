# タスク計画 — v2: デスクトップアプリ化 & コード品質改善

## フェーズ5: デスクトップアプリ化（PyWebView移行）

- [x] pywebview インストール・requirements.txt 更新
- [x] app.py の起動部分を PyWebView 対応に書き換え
- [x] ハートビート関連コードの削除（app.py / main.js / equipment.html）
- [x] 起動.vbs の削除
- [x] 動作確認（専用ウィンドウで起動・操作・終了）
- [x] ウィンドウ最大化で起動するよう設定（maximized=True）

## フェーズ6: コード品質改善 & UI微調整

- [x] database.py のエラーハンドリング強化（register_rental, process_return に rollback 追加）
- [x] equipment.html のインラインJS を static/equipment.js に分離
- [x] レンタル登録フォーム・履歴から「部署名」の入力を削除
- [x] フォームのレイアウトを整理し、「氏名（フルネーム推奨）」に変更
- [x] アプリ内のテキスト（機材情報など）を選択・コピーできるように修正
- [x] ヘッダーアイコンを📦から📸に変更

## フェーズ7: .exe 化 & 配布準備

- [x] PyInstaller インストール・ビルド設定
- [x] .exe ビルド・動作確認（ユーザーによる .exe 起動確認済み）
- [x] docs/README.md の更新（起動方法・配布手順・アーキテクチャ図の反映）
