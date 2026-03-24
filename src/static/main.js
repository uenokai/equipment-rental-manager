/**
 * 機材レンタル管理 - メイン画面JavaScript
 *
 * 検索・レンタル登録・返却のAPI通信とフォーム状態制御を担当する。
 */

// Enterキーで検索実行
document.addEventListener("DOMContentLoaded", () => {
    const searchInput = document.getElementById("searchCode");
    searchInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            searchEquipment();
        }
    });
});


/**
 * 商品コードで機材情報を検索する
 */
async function searchEquipment() {
    const productCode = document.getElementById("searchCode").value.trim();
    const errorEl = document.getElementById("searchError");
    const resultSection = document.getElementById("resultSection");
    const historySection = document.getElementById("historySection");
    const actionMsg = document.getElementById("actionMessage");

    // メッセージリセット
    errorEl.style.display = "none";
    actionMsg.style.display = "none";

    if (!productCode) {
        showError(errorEl, "商品コードを入力してください");
        return;
    }

    try {
        const response = await fetch(`/api/search?product_code=${encodeURIComponent(productCode)}`);
        const data = await response.json();

        if (!response.ok) {
            showError(errorEl, data.error);
            resultSection.style.display = "none";
            historySection.style.display = "none";
            return;
        }

        // 検索結果を表示
        displayResult(data);

    } catch (error) {
        showError(errorEl, "検索中にエラーが発生しました");
        console.error("検索エラー:", error);
    }
}


/**
 * 検索結果を画面に表示し、状態に応じてフォームを制御する
 */
function displayResult(data) {
    const resultSection = document.getElementById("resultSection");
    const historySection = document.getElementById("historySection");

    resultSection.style.display = "block";

    // 機材情報
    document.getElementById("productCode").value = data.equipment.product_code;
    document.getElementById("equipmentName").textContent = data.equipment.equipment_name;

    const statusBadge = document.getElementById("statusBadge");
    const isRenting = data.current_rental !== null;

    // フォーム要素
    const nameInput = document.getElementById("borrowerName");
    const startInput = document.getElementById("rentalStart");
    const endInput = document.getElementById("rentalEnd");
    const rentalBtn = document.getElementById("rentalBtn");
    const returnBtn = document.getElementById("returnBtn");

    if (isRenting) {
        // レンタル中: 情報を表示、フォーム入力不可、返却ボタン有効
        statusBadge.textContent = "レンタル中";
        statusBadge.className = "badge renting";

        nameInput.value = data.current_rental.borrower_name;
        startInput.value = data.current_rental.rental_start;
        endInput.value = data.current_rental.rental_end;

        nameInput.disabled = true;
        startInput.disabled = true;
        endInput.disabled = true;

        rentalBtn.disabled = true;
        returnBtn.disabled = false;
    } else {
        // 貸出可能: フォーム入力可、返却ボタン無効
        statusBadge.textContent = "貸出可能";
        statusBadge.className = "badge available";

        nameInput.value = "";
        startInput.value = "";
        endInput.value = "";

        nameInput.disabled = false;
        startInput.disabled = false;
        endInput.disabled = false;

        rentalBtn.disabled = false;
        returnBtn.disabled = true;
    }

    // 履歴表示
    displayHistory(data.history);
}


/**
 * レンタル履歴テーブルを描画する
 */
function displayHistory(history) {
    const historySection = document.getElementById("historySection");
    const tbody = document.getElementById("historyBody");
    const noHistory = document.getElementById("noHistory");

    historySection.style.display = "block";
    tbody.innerHTML = "";

    if (!history || history.length === 0) {
        noHistory.style.display = "block";
        return;
    }

    noHistory.style.display = "none";

    history.forEach(record => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${escapeHtml(record.borrower_name)}</td>
            <td>${escapeHtml(record.rental_start)}</td>
            <td>${escapeHtml(record.rental_end)}</td>
            <td><span class="badge ${record.status === 'レンタル中' ? 'renting' : 'available'}">${escapeHtml(record.status)}</span></td>
            <td>${record.returned_at ? escapeHtml(record.returned_at) : "—"}</td>
        `;
        tbody.appendChild(tr);
    });
}


/**
 * レンタル登録を実行する
 */
async function registerRental() {
    const actionMsg = document.getElementById("actionMessage");
    actionMsg.style.display = "none";

    const productCode = document.getElementById("productCode").value;
    const borrowerName = document.getElementById("borrowerName").value.trim();
    const rentalStart = document.getElementById("rentalStart").value;
    const rentalEnd = document.getElementById("rentalEnd").value;

    // 入力チェック
    if (!borrowerName || !rentalStart || !rentalEnd) {
        showActionMessage("すべての項目を入力してください", "error");
        return;
    }

    if (rentalStart > rentalEnd) {
        showActionMessage("終了日は開始日以降を指定してください", "error");
        return;
    }

    try {
        const response = await fetch("/api/rental", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                product_code: productCode,
                borrower_name: borrowerName,
                rental_start: rentalStart,
                rental_end: rentalEnd
            })
        });

        const result = await response.json();

        if (response.ok && result.success) {
            showActionMessage("レンタル登録が完了しました", "success");
            // 再検索して画面を更新
            searchEquipment();
        } else {
            showActionMessage(result.error || "登録に失敗しました", "error");
        }
    } catch (error) {
        showActionMessage("通信エラーが発生しました", "error");
        console.error("レンタル登録エラー:", error);
    }
}


/**
 * 返却処理を実行する
 */
async function processReturn() {
    const actionMsg = document.getElementById("actionMessage");
    actionMsg.style.display = "none";

    const productCode = document.getElementById("productCode").value;

    if (!confirm("この機材を返却しますか？")) {
        return;
    }

    try {
        const response = await fetch("/api/return", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ product_code: productCode })
        });

        const result = await response.json();

        if (response.ok && result.success) {
            showActionMessage("返却処理が完了しました", "success");
            // 再検索して画面を更新
            searchEquipment();
        } else {
            showActionMessage(result.error || "返却に失敗しました", "error");
        }
    } catch (error) {
        showActionMessage("通信エラーが発生しました", "error");
        console.error("返却処理エラー:", error);
    }
}


// ---------- ユーティリティ ----------

function showError(element, message) {
    element.textContent = message;
    element.style.display = "block";
}

function showActionMessage(message, type) {
    const el = document.getElementById("actionMessage");
    el.textContent = message;
    el.className = `action-msg ${type}`;
    el.style.display = "block";
}

function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    const div = document.createElement("div");
    div.textContent = String(str);
    return div.innerHTML;
}

