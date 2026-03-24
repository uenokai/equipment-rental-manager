"""
Azure AI Document Intelligence を使用した画像からのレンタル情報抽出。

【精度が不十分な場合 — Azure OpenAI GPT-4o Vision への切り替え手順】
1. requirements.txt に `openai` を追加
2. 環境変数を追加:
     AZURE_OPENAI_ENDPOINT  例: https://xxxxx.openai.azure.com/
     AZURE_OPENAI_KEY       APIキー
     AZURE_OPENAI_DEPLOYMENT GPT-4oデプロイ名 (例: gpt-4o)
3. analyze_image() 関数を下記 analyze_image_gpt4o() に差し替える:

    import base64
    from openai import AzureOpenAI

    def analyze_image_gpt4o(image_bytes: bytes, content_type: str = "image/png") -> dict:
        client = AzureOpenAI(
            azure_endpoint=os.environ["AZURE_OPENAI_ENDPOINT"],
            api_key=os.environ["AZURE_OPENAI_KEY"],
            api_version="2024-02-01"
        )
        b64 = base64.b64encode(image_bytes).decode()
        prompt = (
            "この画像はレンタル申請の表です。以下のフィールドをJSON形式で抽出してください。"
            "フィールド: product_code（機材ID/商品コード）, borrower_name（氏名）, "
            "rental_start（開始日 YYYY-MM-DD）, rental_end（終了日 YYYY-MM-DD）。"
            "値が不明な場合は null にしてください。JSONのみ返してください。"
        )
        response = client.chat.completions.create(
            model=os.environ["AZURE_OPENAI_DEPLOYMENT"],
            messages=[{
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": f"data:{content_type};base64,{b64}"}}
                ]
            }],
            max_tokens=300
        )
        import json, re
        text = response.choices[0].message.content
        m = re.search(r"\\{.*\\}", text, re.DOTALL)
        if not m:
            raise ValueError("GPT-4oからJSONを取得できませんでした")
        data = json.loads(m.group())
        return {
            "product_code": data.get("product_code"),
            "borrower_name": data.get("borrower_name"),
            "rental_start": data.get("rental_start"),
            "rental_end":   data.get("rental_end"),
            "raw_tables":   []
        }
"""

import os
import re

from azure.ai.documentintelligence import DocumentIntelligenceClient
from azure.core.credentials import AzureKeyCredential

# ---------- 設定 ----------
# 環境変数 AZURE_DI_ENDPOINT, AZURE_DI_KEY を設定してください。
# 例 (Windows):
#   set AZURE_DI_ENDPOINT=https://xxxxx.cognitiveservices.azure.com/
#   set AZURE_DI_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

AZURE_DI_ENDPOINT = os.environ.get("AZURE_DI_ENDPOINT", "")
AZURE_DI_KEY = os.environ.get("AZURE_DI_KEY", "")

# テーブルの列ヘッダーや行ラベルと抽出フィールドのキーワードマッピング
# 表の列名が異なる場合はここに追記してください
FIELD_KEYWORDS: dict[str, list[str]] = {
    "product_code":  ["機材id", "機材コード", "商品コード", "機材番号", "コード", "id", "no"],
    "borrower_name": ["氏名", "借用者", "借用者氏名", "名前", "借用者名"],
    "rental_start":  ["開始日", "貸出日", "レンタル開始日", "レンタル開始", "開始"],
    "rental_end":    ["終了日", "返却日", "レンタル終了日", "レンタル終了", "終了"],
}


# ---------- メイン関数 ----------

def analyze_image(image_bytes: bytes, content_type: str = "image/png") -> dict:
    """
    画像からレンタル情報を抽出する。

    Args:
        image_bytes: 画像のバイト列
        content_type: MIMEタイプ (image/png, image/jpeg 等)

    Returns:
        {
            "product_code":  str | None,
            "borrower_name": str | None,
            "rental_start":  str | None  (YYYY-MM-DD),
            "rental_end":    str | None  (YYYY-MM-DD),
            "raw_tables":    list        (デバッグ用生データ)
        }

    Raises:
        ValueError: 環境変数未設定
        RuntimeError: Azure API エラー
    """
    if not AZURE_DI_ENDPOINT or not AZURE_DI_KEY:
        raise ValueError(
            "環境変数 AZURE_DI_ENDPOINT と AZURE_DI_KEY が設定されていません。"
        )

    client = DocumentIntelligenceClient(
        endpoint=AZURE_DI_ENDPOINT,
        credential=AzureKeyCredential(AZURE_DI_KEY)
    )

    try:
        poller = client.begin_analyze_document(
            "prebuilt-layout",
            body=image_bytes,
            content_type=content_type
        )
        result = poller.result()
    except Exception as e:
        raise RuntimeError(f"Azure Document Intelligence API エラー: {e}") from e

    extracted: dict = {
        "product_code":  None,
        "borrower_name": None,
        "rental_start":  None,
        "rental_end":    None,
        "raw_tables":    []
    }

    if not result.tables:
        return extracted

    for table in result.tables:
        grid = _table_to_grid(table)
        extracted["raw_tables"].append(grid)
        _extract_fields(grid, extracted)

    # 日付を YYYY-MM-DD に正規化
    if extracted["rental_start"]:
        extracted["rental_start"] = normalize_date(extracted["rental_start"]) or extracted["rental_start"]
    if extracted["rental_end"]:
        extracted["rental_end"] = normalize_date(extracted["rental_end"]) or extracted["rental_end"]

    return extracted


# ---------- 内部ユーティリティ ----------

def _table_to_grid(table) -> list[list[str]]:
    """Document Intelligence のテーブルオブジェクトを2次元リストに変換する。"""
    if not table.cells:
        return []
    max_row = max(c.row_index for c in table.cells) + 1
    max_col = max(c.column_index for c in table.cells) + 1
    grid: list[list[str]] = [[""] * max_col for _ in range(max_row)]
    for cell in table.cells:
        grid[cell.row_index][cell.column_index] = (cell.content or "").strip()
    return grid


def _normalize_key(text: str) -> str:
    """キーワード照合用に正規化（小文字・空白除去）。"""
    return text.lower().replace(" ", "").replace("　", "")


def _match_field(text: str) -> str | None:
    """テキストがどのフィールドに対応するかを返す。"""
    normalized = _normalize_key(text)
    for field, keywords in FIELD_KEYWORDS.items():
        for kw in keywords:
            if kw in normalized:
                return field
    return None


def _extract_fields(grid: list[list[str]], extracted: dict) -> None:
    """
    横型テーブル（1行目がヘッダー）と縦型テーブル（1列目がラベル）の
    両方に対応してフィールドを抽出する。
    すでに値が入っているフィールドは上書きしない。
    """
    if not grid:
        return

    # 横型: 1行目をヘッダーとして各列を検査
    header_row = grid[0]
    for col_idx, header in enumerate(header_row):
        field = _match_field(header)
        if field and extracted[field] is None:
            for row in grid[1:]:
                if col_idx < len(row) and row[col_idx]:
                    extracted[field] = row[col_idx]
                    break

    # 縦型: 各行の1列目をラベルとして検査
    for row in grid:
        if len(row) >= 2:
            field = _match_field(row[0])
            if field and extracted[field] is None and row[1]:
                extracted[field] = row[1]


# ---------- 日付正規化 ----------

# 元号→西暦のオフセット
_ERA_OFFSET: dict[str, int] = {
    "令和": 2018, "R": 2018, "r": 2018,
    "平成": 1988, "H": 1988, "h": 1988,
    "昭和": 1925, "S": 1925, "s": 1925,
}


def normalize_date(date_str: str) -> str | None:
    """
    各種日付フォーマットを YYYY-MM-DD 形式に変換する。

    対応フォーマット例:
        2024年3月1日 / 令和6年3月1日 / R6.3.1
        2024/3/1 / 2024-3-1 / 2024.3.1
        3/1/2024 (US形式)

    Returns:
        "YYYY-MM-DD" 形式の文字列、解析できない場合は None
    """
    s = date_str.strip()

    # 元号（漢字）: 令和6年3月1日 / 平成30年1月1日
    for era, offset in _ERA_OFFSET.items():
        if not re.match(r"[A-Za-z]", era):  # 漢字元号のみここで処理
            m = re.match(rf"{era}(\d{{1,2}})[年./](\d{{1,2}})[月./](\d{{1,2}})日?", s)
            if m:
                return _fmt(offset + int(m.group(1)), m.group(2), m.group(3))

    # 元号（アルファベット）: R6.3.1 / H30.1.1
    m = re.match(r"([RrHhSs])(\d{1,2})[./年](\d{1,2})[./月](\d{1,2})日?", s)
    if m:
        era_char = m.group(1)
        offset = _ERA_OFFSET.get(era_char, _ERA_OFFSET.get(era_char.upper(), 0))
        return _fmt(offset + int(m.group(2)), m.group(3), m.group(4))

    # 西暦: YYYY年MM月DD日
    m = re.match(r"(\d{4})年(\d{1,2})月(\d{1,2})日?", s)
    if m:
        return _fmt(m.group(1), m.group(2), m.group(3))

    # 西暦: YYYY/MM/DD, YYYY-MM-DD, YYYY.MM.DD
    m = re.match(r"(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$", s)
    if m:
        return _fmt(m.group(1), m.group(2), m.group(3))

    # US形式: MM/DD/YYYY
    m = re.match(r"(\d{1,2})/(\d{1,2})/(\d{4})$", s)
    if m:
        return _fmt(m.group(3), m.group(1), m.group(2))

    return None


def _fmt(year, month, day) -> str:
    return f"{int(year):04d}-{int(month):02d}-{int(day):02d}"
