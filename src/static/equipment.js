/**
 * 機材マスタ管理画面 - JavaScript
 *
 * 機材一覧の取得・表示とExcelインポート処理を担当する。
 */

// ページ読み込み時に一覧を取得
document.addEventListener("DOMContentLoaded", loadEquipmentList);


/**
 * 機材マスタ一覧をAPIから取得し、テーブルに表示する
 */
async function loadEquipmentList() {
    try {
        const response = await fetch("/api/equipment");
        const data = await response.json();
        const tbody = document.getElementById("equipmentBody");
        const noData = document.getElementById("noEquipment");
        const countBadge = document.getElementById("equipmentCount");

        tbody.innerHTML = "";

        if (data.length === 0) {
            noData.style.display = "block";
            countBadge.textContent = "";
            return;
        }

        noData.style.display = "none";
        countBadge.textContent = `（${data.length}件）`;

        data.forEach(item => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${escapeHtml(item.product_code)}</td>
                <td>${escapeHtml(item.equipment_name)}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (error) {
        console.error("機材一覧取得エラー:", error);
    }
}


/**
 * Excelファイルをアップロードして機材マスタをインポートする
 */
async function importExcel() {
    const fileInput = document.getElementById("importFile");
    const msgEl = document.getElementById("importMessage");

    if (!fileInput.files.length) {
        showMessage(msgEl, "ファイルを選択してください", "error");
        return;
    }

    const formData = new FormData();
    formData.append("file", fileInput.files[0]);

    try {
        const response = await fetch("/api/equipment/import", {
            method: "POST",
            body: formData
        });
        const result = await response.json();

        if (response.ok) {
            let msg = `インポート完了 — 追加: ${result.added}件, 更新: ${result.updated}件, 削除: ${result.deleted}件`;
            if (result.skipped && result.skipped.length > 0) {
                msg += ` （レンタル中のため削除スキップ: ${result.skipped.join(", ")}）`;
            }
            showMessage(msgEl, msg, "success");
            loadEquipmentList();
            fileInput.value = "";
        } else {
            showMessage(msgEl, result.error, "error");
        }
    } catch (error) {
        showMessage(msgEl, "インポートに失敗しました", "error");
    }
}


// ---------- ユーティリティ ----------

function showMessage(element, text, type) {
    element.textContent = text;
    element.className = `action-msg ${type}`;
    element.style.display = "block";
}

function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    const div = document.createElement("div");
    div.textContent = String(str);
    return div.innerHTML;
}
