// DOM要素の取得
const toggleButton = document.getElementById("toggleButton");
const statusDiv = document.getElementById("status");

// 状態管理
const state = {
  isBlackMode: false,
};

// ボタンテキストとステータスを更新
const updateUI = () => {
  if (state.isBlackMode) {
    toggleButton.textContent = "煩悩ON";
    statusDiv.textContent = "ブッダモード";
  } else {
    toggleButton.textContent = "煩悩OFF";
    statusDiv.textContent = "通常モード";
  }
};

// アクティブなタブに画像切り替えメッセージを送信
const toggleImages = async () => {
  try {
    console.log("Popup: toggleImages called");
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    console.log("Popup: Active tab found:", tab.id, tab.url);

    const response = await chrome.tabs.sendMessage(tab.id, {
      action: "toggleImages",
    });
    console.log("Popup: Response received:", response);

    if (response && response.success) {
      state.isBlackMode = response.isBlackMode;
      updateUI();
      console.log("Popup: UI updated, new mode:", state.isBlackMode);
    } else {
      console.log("Popup: No valid response received");
      statusDiv.textContent = "応答がありませんでした";
    }
  } catch (error) {
    console.error("画像切り替えエラー:", error);
    statusDiv.textContent = "エラーが発生しました: " + error.message;
  }
};

// イベントリスナーの設定
toggleButton.addEventListener("click", toggleImages);

// 初期化
document.addEventListener("DOMContentLoaded", () => {
  updateUI();
});
