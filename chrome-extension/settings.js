// DOM要素の取得
const toggleButton = document.getElementById("toggleButton");
const statusDiv = document.getElementById("status");

// 状態管理
const state = {
  isEnabled: false,
};

// ボタンテキストとステータスを更新
const updateUI = () => {
  if (state.isEnabled) {
    toggleButton.textContent = "機能をOFFにする";
    statusDiv.textContent = "機能ON";
    toggleButton.style.background = "#dc3545";
  } else {
    toggleButton.textContent = "機能をONにする";
    statusDiv.textContent = "機能OFF";
    toggleButton.style.background = "#a9a9a9";
  }
};

// 機能のON/OFF切り替え
const toggleFeature = async () => {
  try {
    // 現在の状態を反転
    state.isEnabled = !state.isEnabled;

    // ストレージに保存
    await chrome.storage.sync.set({ isEnabled: state.isEnabled });

    // UIを更新
    updateUI();

    // 全てのタブにメッセージを送信
    try {
      const tabs = await chrome.tabs.query({});

      for (const tab of tabs) {
        try {
          // content scriptが読み込まれているタブにのみメッセージを送信
          await chrome.tabs.sendMessage(tab.id, {
            action: "toggleFeature",
            isEnabled: state.isEnabled,
          });
        } catch (tabError) {
          // 個別のタブでエラーが発生しても続行
          console.log(
            `タブ ${tab.id} へのメッセージ送信をスキップ:`,
            tabError.message
          );
        }
      }
    } catch (messageError) {
      console.log("メッセージ送信エラー:", messageError);
      // メッセージ送信に失敗してもストレージには保存されているので続行
    }

    statusDiv.textContent = state.isEnabled ? "機能ON" : "機能OFF";
  } catch (error) {
    console.error("機能切り替えエラー:", error);
    statusDiv.textContent = "エラーが発生しました";
    // エラーが発生した場合は状態を元に戻す
    state.isEnabled = !state.isEnabled;
    updateUI();
  }
};

// 初期化
const initialize = async () => {
  try {
    // ストレージから状態を読み込み
    const result = await chrome.storage.sync.get(["isEnabled"]);
    state.isEnabled = result.isEnabled || false;
    updateUI();
  } catch (error) {
    console.error("初期化エラー:", error);
  }
};

// イベントリスナーの設定
toggleButton.addEventListener("click", toggleFeature);

// 初期化
document.addEventListener("DOMContentLoaded", initialize);
