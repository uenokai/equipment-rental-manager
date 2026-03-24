"""
機材レンタル管理 - データベース操作モジュール

SQLiteデータベースの初期化・機材マスタ管理・レンタル操作を提供する。
"""

import sqlite3
import os
import sys
from datetime import datetime

# DBファイルパス
# frozen環境（.exe）では .exe と同じディレクトリの data/ 配下に配置
if getattr(sys, 'frozen', False):
    _APP_DIR = os.path.dirname(sys.executable)
else:
    _APP_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

DATABASE_DIR = os.path.join(_APP_DIR, "data")
DATABASE_PATH = os.path.join(DATABASE_DIR, "rental.db")


def get_connection() -> sqlite3.Connection:
    """DB接続を取得する。行をdictライクに扱えるようRow factoryを設定。"""
    os.makedirs(DATABASE_DIR, exist_ok=True)
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def initialize_database() -> None:
    """テーブルが存在しない場合に作成する。"""
    connection = get_connection()
    try:
        connection.executescript("""
            CREATE TABLE IF NOT EXISTS equipment (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                product_code TEXT UNIQUE NOT NULL,
                equipment_name TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS rental_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                product_code TEXT NOT NULL,
                equipment_name TEXT NOT NULL,
                department TEXT NOT NULL,
                borrower_name TEXT NOT NULL,
                rental_start DATE NOT NULL,
                rental_end DATE NOT NULL,
                status TEXT NOT NULL DEFAULT 'レンタル中',
                returned_at DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (product_code) REFERENCES equipment(product_code)
            );
        """)
        connection.commit()
    finally:
        connection.close()


# ---------- 機材マスタ操作 ----------

def get_all_equipment() -> list[dict]:
    """機材マスタの全件を取得する。"""
    connection = get_connection()
    try:
        rows = connection.execute(
            "SELECT product_code, equipment_name, created_at FROM equipment ORDER BY product_code"
        ).fetchall()
        return [dict(row) for row in rows]
    finally:
        connection.close()


def sync_equipment_from_list(items: list[dict]) -> dict:
    """
    商品コード・商品名のリストでマスタを同期する。
    - 新規: 追加
    - 既存: 商品名を更新
    - リストに無い: 削除（レンタル中の機材は削除しない）

    Args:
        items: [{"product_code": "...", "equipment_name": "..."}, ...]

    Returns:
        {"added": int, "updated": int, "deleted": int, "skipped": list[str]}

    Raises:
        RuntimeError: DB操作に失敗した場合
    """
    connection = get_connection()
    try:
        # 現在のマスタを取得
        existing = {}
        for row in connection.execute("SELECT product_code, equipment_name FROM equipment").fetchall():
            existing[row["product_code"]] = row["equipment_name"]

        # インポートデータをdict化（重複する商品コードは後勝ち）
        import_data = {item["product_code"]: item["equipment_name"] for item in items}

        added = 0
        updated = 0
        deleted = 0
        skipped = []

        # 追加・更新
        for code, name in import_data.items():
            if code not in existing:
                connection.execute(
                    "INSERT INTO equipment (product_code, equipment_name) VALUES (?, ?)",
                    (code, name)
                )
                added += 1
            elif existing[code] != name:
                connection.execute(
                    "UPDATE equipment SET equipment_name = ? WHERE product_code = ?",
                    (name, code)
                )
                updated += 1

        # 削除（インポートデータに無いものを削除）
        # レンタル履歴が存在する機材はFK制約のため削除不可→スキップ
        for code in existing:
            if code not in import_data:
                has_history = connection.execute(
                    "SELECT COUNT(*) as cnt FROM rental_history WHERE product_code = ?",
                    (code,)
                ).fetchone()
                if has_history["cnt"] > 0:
                    skipped.append(code)
                else:
                    connection.execute("DELETE FROM equipment WHERE product_code = ?", (code,))
                    deleted += 1

        connection.commit()
        return {"added": added, "updated": updated, "deleted": deleted, "skipped": skipped}
    except sqlite3.IntegrityError as e:
        connection.rollback()
        raise RuntimeError(f"データの整合性エラー: {str(e)}")
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


# ---------- 検索・照会 ----------

def search_by_product_code(product_code: str) -> dict | None:
    """
    商品コードで機材情報・現在のレンタル状態・履歴を取得する。

    Returns:
        {
            "equipment": {"product_code", "equipment_name"},
            "current_rental": {...} or None,
            "history": [...]
        }
        機材が見つからない場合は None
    """
    connection = get_connection()
    try:
        # 機材マスタから検索
        equipment = connection.execute(
            "SELECT product_code, equipment_name FROM equipment WHERE product_code = ?",
            (product_code,)
        ).fetchone()

        if not equipment:
            return None

        # 現在のレンタル状態（「レンタル中」のレコード）
        current_rental = connection.execute(
            """SELECT borrower_name, rental_start, rental_end, status
               FROM rental_history
               WHERE product_code = ? AND status = 'レンタル中'
               ORDER BY created_at DESC LIMIT 1""",
            (product_code,)
        ).fetchone()

        # 履歴一覧（新しい順）
        history = connection.execute(
            """SELECT borrower_name, rental_start, rental_end, status, returned_at
               FROM rental_history
               WHERE product_code = ?
               ORDER BY created_at DESC""",
            (product_code,)
        ).fetchall()

        return {
            "equipment": dict(equipment),
            "current_rental": dict(current_rental) if current_rental else None,
            "history": [dict(row) for row in history]
        }
    finally:
        connection.close()


# ---------- レンタル操作 ----------

def register_rental(product_code: str, borrower_name: str,
                    rental_start: str, rental_end: str) -> dict:
    """
    レンタルを登録する。

    Returns:
        {"success": True} or {"success": False, "error": "..."}
    """
    connection = get_connection()
    try:
        # 機材の存在チェック
        equipment = connection.execute(
            "SELECT equipment_name FROM equipment WHERE product_code = ?",
            (product_code,)
        ).fetchone()
        if not equipment:
            return {"success": False, "error": "商品コードが見つかりません"}

        # レンタル中かチェック
        active = connection.execute(
            "SELECT COUNT(*) as cnt FROM rental_history WHERE product_code = ? AND status = 'レンタル中'",
            (product_code,)
        ).fetchone()
        if active["cnt"] > 0:
            return {"success": False, "error": "この機材は現在レンタル中です"}

        # レンタル登録（departmentカラムは後方互換性のため空文字を挿入）
        connection.execute(
            """INSERT INTO rental_history
               (product_code, equipment_name, department, borrower_name, rental_start, rental_end, status)
               VALUES (?, ?, '', ?, ?, ?, 'レンタル中')""",
            (product_code, equipment["equipment_name"], borrower_name, rental_start, rental_end)
        )
        connection.commit()
        return {"success": True}
    except Exception as e:
        connection.rollback()
        return {"success": False, "error": f"データベースエラー: {str(e)}"}
    finally:
        connection.close()


def process_return(product_code: str) -> dict:
    """
    返却処理を実行する。

    Returns:
        {"success": True} or {"success": False, "error": "..."}
    """
    connection = get_connection()
    try:
        # レンタル中のレコードを取得
        active = connection.execute(
            "SELECT id FROM rental_history WHERE product_code = ? AND status = 'レンタル中'",
            (product_code,)
        ).fetchone()

        if not active:
            return {"success": False, "error": "この機材はレンタル中ではありません"}

        # ステータスを返却済に更新
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        connection.execute(
            "UPDATE rental_history SET status = '返却済', returned_at = ? WHERE id = ?",
            (now, active["id"])
        )
        connection.commit()
        return {"success": True}
    except Exception as e:
        connection.rollback()
        return {"success": False, "error": f"データベースエラー: {str(e)}"}
    finally:
        connection.close()
