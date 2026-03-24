/**
 * 機材レンタル管理 - メイン画面JavaScript
 *
 * 検索・レンタル登録・返却のAPI通信とフォーム状態制御を担当する。
 */

// Enterキーで検索実行 / 画像ドロップ初期化
document.addEventListener("DOMContentLoaded", () => {
    const searchInput = document.getElementById("searchCode");
    searchInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            searchEquipment();
        }
    });

    initImageUpload();
});


// ============================================================
// 画像解析セクション
// ============================================================

function initImageUpload() {
    const fileInput = document.getElementById("imageFile");
    const dropArea = document.getElementById("imageDropArea");

    // ファイル選択ダイアログ
    dropArea.addEventListener("click", () => fileInput.click());

    fileInput.addEventListener("change", () => {
        if (fileInput.files.length > 0) {
            setImagePreview(fileInput.files[0]);
        }
    });

    // ドラッグ&ドロップ
    dropArea.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropArea.classList.add("drag-over");
    });
    dropArea.addEventListener("dragleave", () => {
        dropArea.classList.remove("drag-over");
    });
    dropArea.addEventListener("drop", (e) => {
        e.preventDefault();
        dropArea.classList.remove("drag-over");
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith("image/")) {
            setImagePreview(file);
            // fileInput にも反映（analyze 時に使用）
            const dt = new DataTransfer();
            dt.items.add(file);
            fileInput.files = dt.files;
        }
    });
}


/**
 * 画像プレビューを表示し、解析ボタンを有効化する
 */
function setImagePreview(file) {
    const previewArea = document.getElementById("imagePreviewArea");
    const previewImg = document.getElementById("imagePreview");
    const dropArea = document.getElementById("imageDropArea");
    const analyzeBtn = document.getElementById("analyzeBtn");

    const reader = new FileReader();
    reader.onload = (e) => {
        previewImg.src = e.target.result;
        previewArea.style.display = "flex";
        dropArea.style.display = "none";
        analyzeBtn.disabled = false;
    };
    reader.readAsDataURL(file);

    // 解析結果エリアをリセット
    resetImageResult();
}


/**
 * 画像をクリアして初期状態に戻す
 */
function clearImage() {
    document.getElementById("imageFile").value = "";
    document.getElementById("imagePreviewArea").style.display = "none";
    document.getElementById("imageDropArea").style.display = "flex";
    document.getElementById("analyzeBtn").disabled = true;
    document.getElementById("imageAnalyzeMsg").style.display = "none";
    resetImageResult();
}


/**
 * 解析結果エリアをリセットする
 */
function resetImageResult() {
    document.getElementById("imageResultArea").style.display = "none";
    document.getElementById("imageConflictArea").style.display = "none";
    document.getElementById("imgRegisterMsg").style.display = "none";
    ["imgProductCode", "imgBorrowerName", "imgRentalStart", "imgRentalEnd"].forEach(id => {
        document.getElementById(id).value = "";
    });
}


/**
 * 画像を Azure Document Intelligence で解析する
 */
async function analyzeImage() {
    const fileInput = document.getElementById("imageFile");
    const analyzeBtn = document.getElementById("analyzeBtn");
    const msgEl = document.getElementById("imageAnalyzeMsg");

    if (!fileInput.files.length) return;

    const formData = new FormData();
    formData.append("image", fileInput.files[0]);

    analyzeBtn.disabled = true;
    analyzeBtn.textContent = "解析中…";
    msgEl.style.display = "none";
    resetImageResult();

    try {
        const response = await fetch("/api/analyze-image", {
            method: "POST",
            body: formData
        });
        const data = await response.json();

        if (!response.ok) {
            showImageMsg(data.error || "解析に失敗しました", "error");
            return;
        }

        displayImageResult(data);

    } catch (error) {
        showImageMsg("通信エラーが発生しました", "error");
        console.error("画像解析エラー:", error);
    } finally {
        analyzeBtn.disabled = false;
        analyzeBtn.textContent = "解析する";
    }
}


/**
 * 解析結果を画面に表示する
 */
function displayImageResult(data) {
    const { extracted, rental_status } = data;
    const resultArea = document.getElementById("imageResultArea");
    const conflictArea = document.getElementById("imageConflictArea");
    const registerBtn = document.getElementById("imgRegisterBtn");

    // 抽出フィールドを入力欄に反映
    document.getElementById("imgProductCode").value  = extracted.product_code  || "";
    document.getElementById("imgBorrowerName").value = extracted.borrower_name || "";
    document.getElementById("imgRentalStart").value  = extracted.rental_start  || "";
    document.getElementById("imgRentalEnd").value    = extracted.rental_end    || "";

    resultArea.style.display = "block";

    // 機材がレンタル中かどうか確認
    const isRenting = rental_status && rental_status.current_rental !== null;

    if (isRenting) {
        const r = rental_status.current_rental;
        const equipName = rental_status.equipment ? rental_status.equipment.equipment_name : "";
        document.getElementById("imageConflictDetail").innerHTML = `
            <table class="conflict-table">
                <tr><th>機材名</th><td>${escapeHtml(equipName)}</td></tr>
                <tr><th>借用者</th><td>${escapeHtml(r.borrower_name)}</td></tr>
                <tr><th>開始日</th><td>${escapeHtml(r.rental_start)}</td></tr>
                <tr><th>終了日</th><td>${escapeHtml(r.rental_end)}</td></tr>
            </table>
        `;
        conflictArea.style.display = "block";
        registerBtn.disabled = true;
    } else {
        conflictArea.style.display = "none";
        registerBtn.disabled = false;
    }

    // 抽出できなかったフィールドがある場合は注意メッセージ
    const missing = ["product_code", "borrower_name", "rental_start", "rental_end"]
        .filter(k => !extracted[k]);
    if (missing.length > 0) {
        const labelMap = {
            product_code: "機材ID", borrower_name: "氏名",
            rental_start: "開始日", rental_end: "終了日"
        };
        showImageMsg(
            `以下の項目が取得できませんでした。手動で入力してください: ${missing.map(k => labelMap[k]).join("、")}`,
            "error"
        );
    }
}


/**
 * 解析結果のデータでレンタル登録する
 */
async function registerFromImage() {
    const productCode  = document.getElementById("imgProductCode").value.trim();
    const borrowerName = document.getElementById("imgBorrowerName").value.trim();
    const rentalStart  = document.getElementById("imgRentalStart").value;
    const rentalEnd    = document.getElementById("imgRentalEnd").value;
    const msgEl        = document.getElementById("imgRegisterMsg");

    msgEl.style.display = "none";

    if (!productCode || !borrowerName || !rentalStart || !rentalEnd) {
        showImgRegisterMsg("すべての項目を入力してください", "error");
        return;
    }
    if (rentalStart > rentalEnd) {
        showImgRegisterMsg("終了日は開始日以降を指定してください", "error");
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
            showImgRegisterMsg("レンタル登録が完了しました", "success");
            document.getElementById("imgRegisterBtn").disabled = true;
        } else {
            // 競合が起きた場合（他の経路で先に登録された等）
            if (response.status === 409) {
                showImgRegisterMsg(`登録失敗: ${result.error}`, "error");
                // 最新のレンタル状況を再取得して表示
                if (productCode) {
                    const searchRes = await fetch(`/api/search?product_code=${encodeURIComponent(productCode)}`);
                    if (searchRes.ok) {
                        const searchData = await searchRes.json();
                        if (searchData.current_rental) {
                            displayImageResult({ extracted: { product_code: productCode, borrower_name: null, rental_start: null, rental_end: null }, rental_status: searchData });
                        }
                    }
                }
            } else {
                showImgRegisterMsg(result.error || "登録に失敗しました", "error");
            }
        }
    } catch (error) {
        showImgRegisterMsg("通信エラーが発生しました", "error");
        console.error("レンタル登録エラー:", error);
    }
}


// ---------- 画像セクション ユーティリティ ----------

function showImageMsg(message, type) {
    const el = document.getElementById("imageAnalyzeMsg");
    el.textContent = message;
    el.className = `action-msg ${type}`;
    el.style.display = "block";
}

function showImgRegisterMsg(message, type) {
    const el = document.getElementById("imgRegisterMsg");
    el.textContent = message;
    el.className = `action-msg ${type}`;
    el.style.display = "block";
}


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

