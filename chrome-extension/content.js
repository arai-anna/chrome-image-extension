// 定数定義
const CONSTANTS = {
  CACHE_SIZE: 50,
  IMAGE_COUNT: 20,
  MIN_SIZE_THRESHOLD: 37,
  DEFAULT_SIZE: 200,
  CANVAS_MIN_SIZE: 100,
  Z_INDEX: 999999,
  BUDDHA_COLOR: "#a9a9a9",
  HOVER_COLOR: "#4d4d4d",
  CROP_POSITIONS: {
    TOP: 0,
    CENTER: 1,
    BOTTOM: 2,
  },
};

// LRUキャッシュクラス
class LRUCache {
  constructor(maxSize = CONSTANTS.CACHE_SIZE) {
    this.maxSize = maxSize;
    this.cache = new Map();
  }

  get(key) {
    if (this.cache.has(key)) {
      // アクセスされたアイテムを最新に移動
      const value = this.cache.get(key);
      this.cache.delete(key);
      this.cache.set(key, value);
      return value;
    }
    return undefined;
  }

  set(key, value) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // 最も古いアイテムを削除
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }

  has(key) {
    return this.cache.has(key);
  }

  clear() {
    this.cache.clear();
  }
}

// 画像の状態管理
const state = {
  isBlackMode: false,
  imageDataMap: new WeakMap(),
  blackImageCache: new LRUCache(CONSTANTS.CACHE_SIZE),
  isFeatureEnabled: false,
  floatingButton: null,
};

// ランダムな仏像画像URLを取得する関数（パフォーマンス向上版）
const getRandomBuddhaImageURL = () => {
  const randomNumber = Math.floor(Math.random() * CONSTANTS.IMAGE_COUNT) + 1;
  return chrome.runtime.getURL(`image/${randomNumber}.jpg`);
};

// 仏像画像を生成する関数（仮画像用）
const generateBuddhaImage = (width, height) => {
  const cacheKey = `${width}x${height}`;

  // キャッシュから取得
  if (state.blackImageCache.has(cacheKey)) {
    return state.blackImageCache.get(cacheKey);
  }

  // 同期的に仮の画像を生成して返す
  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = width;
  tempCanvas.height = height;
  const tempCtx = tempCanvas.getContext("2d");

  // 仮の仏像色で塗りつぶし
  tempCtx.fillStyle = CONSTANTS.BUDDHA_COLOR;
  tempCtx.fillRect(0, 0, width, height);

  const tempDataUrl = tempCanvas.toDataURL("image/png");
  state.blackImageCache.set(cacheKey, tempDataUrl);

  return tempDataUrl;
};

// ランダムクロップの座標を計算する共通関数
const calculateRandomCrop = (
  imgWidth,
  imgHeight,
  canvasWidth,
  canvasHeight
) => {
  const imgAspect = imgWidth / imgHeight;
  const canvasAspect = canvasWidth / canvasHeight;

  let sx = 0,
    sy = 0,
    sw = imgWidth,
    sh = imgHeight;

  if (imgAspect > canvasAspect) {
    // 画像が横長の場合、横をランダムクロップ
    sw = imgHeight * canvasAspect;
    const maxOffsetX = imgWidth - sw;
    sx = Math.random() * maxOffsetX;
  } else {
    // 画像が縦長の場合、縦を右端・中央・左端の3種類からランダム選択
    sh = imgWidth / canvasAspect;
    const maxOffsetY = imgHeight - sh;

    // 0: 上端, 1: 中央, 2: 下端
    const position = Math.floor(Math.random() * 3);
    switch (position) {
      case 0:
        sy = 0; // 上端
        break;
      case 1:
        sy = maxOffsetY / 2; // 中央
        break;
      case 2:
        sy = maxOffsetY; // 下端
        break;
    }
  }

  return { sx, sy, sw, sh };
};

// 仏像画像をCanvasで処理する共通関数
const processImageOnCanvas = (img, width, height) => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  const { sx, sy, sw, sh } = calculateRandomCrop(
    img.width,
    img.height,
    width,
    height
  );
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, width, height);

  return canvas.toDataURL("image/png");
};

// 特定の画像要素用の実際の仏像画像を生成する関数
const generateActualBuddhaImage = (width, height, targetImg) => {
  const cacheKey = `actual_${width}x${height}`;

  // 実際の仏像画像のキャッシュをチェック
  if (state.blackImageCache.has(cacheKey)) {
    const cachedDataUrl = state.blackImageCache.get(cacheKey);
    updateImageWithCachedData(targetImg, cachedDataUrl);
    return;
  }

  // 仏像画像を読み込み
  const img = new Image();
  img.onload = () => {
    const dataUrl = processImageOnCanvas(img, width, height);

    // キャッシュに保存
    state.blackImageCache.set(cacheKey, dataUrl);

    // 特定の画像要素を更新
    updateImageWithCachedData(targetImg, dataUrl);
  };
  img.onerror = () => {
    console.error("Failed to load buddha image");
  };

  // CORSの問題を回避するためにcrossOriginを設定
  img.crossOrigin = "anonymous";
  img.src = getRandomBuddhaImageURL();
};

// キャッシュされたデータで画像を更新する関数
const updateImageWithCachedData = (targetImg, dataUrl) => {
  const existingData = state.imageDataMap.get(targetImg);

  if (existingData) {
    // 現在表示されている画像が仮画像の場合のみ更新
    if (targetImg.src === existingData.black) {
      targetImg.src = dataUrl;
    }
    existingData.black = dataUrl;

    // picture要素のsource要素も更新
    const picture = targetImg.closest("picture");
    if (picture) {
      const sources = picture.querySelectorAll("source");
      sources.forEach((source) => {
        const sourceData = state.imageDataMap.get(source);
        if (sourceData) {
          const oldBlack = sourceData.black;
          sourceData.black = dataUrl;

          // 現在のsrcsetが古い仮画像と一致する場合に更新
          if (source.srcset === oldBlack) {
            source.srcset = dataUrl;
          } else {
            // 一致しない場合でも強制更新
            source.srcset = dataUrl;
          }
        }
      });
    }
  }
};

// iframe用オーバーレイの実際の仏像画像を生成する関数
const generateActualBuddhaImageForOverlay = (width, height, overlay) => {
  // iframe用のキャッシュキー（サイズベース、ランダムURLは含めない）
  const cacheKey = `iframe_actual_${width}x${height}`;

  // 実際の仏像画像のキャッシュをチェック
  if (state.blackImageCache.has(cacheKey)) {
    const cachedDataUrl = state.blackImageCache.get(cacheKey);
    overlay.style.backgroundImage = `url("${cachedDataUrl}")`;
    // オーバーレイのデータも更新
    const existingData = state.imageDataMap.get(overlay.previousElementSibling);
    if (existingData) {
      existingData.black = cachedDataUrl;
    }
    return;
  }

  // 仏像画像を読み込み
  const img = new Image();
  img.onload = () => {
    const dataUrl = processImageOnCanvas(img, width, height);

    // キャッシュに保存
    state.blackImageCache.set(cacheKey, dataUrl);

    // オーバーレイの背景画像を更新
    overlay.style.backgroundImage = `url("${dataUrl}")`;

    // オーバーレイのデータも更新
    const iframe = overlay.previousElementSibling;
    const existingData = state.imageDataMap.get(iframe);
    if (existingData) {
      existingData.black = dataUrl;
    }
  };
  img.onerror = () => {
    console.error("Failed to load buddha image for overlay");
  };

  // CORSの問題を回避するためにcrossOriginを設定
  img.crossOrigin = "anonymous";
  img.src = getRandomBuddhaImageURL();
};

// 画像サイズを取得する共通関数
const getImageSize = (img) => {
  // 表示サイズを優先して取得
  let width = img.offsetWidth || img.width || img.naturalWidth;
  let height = img.offsetHeight || img.height || img.naturalHeight;

  // 属性からサイズを取得（lazy loading対応）
  if (width === 0 || height === 0) {
    width = parseInt(img.getAttribute("width")) || 0;
    height = parseInt(img.getAttribute("height")) || 0;
  }

  // CSSからサイズを取得
  if (width === 0 || height === 0) {
    const computedStyle = window.getComputedStyle(img);
    width = parseInt(computedStyle.width) || 0;
    height = parseInt(computedStyle.height) || 0;
  }

  // 最後の手段としてデフォルト値
  if (width === 0 || height === 0) {
    width = width || CONSTANTS.DEFAULT_SIZE;
    height = height || CONSTANTS.DEFAULT_SIZE;
  }

  return { width, height };
};

// 画像が対象かどうかを判定
const isTargetImage = (img) => {
  // srcまたはdata-srcがあるかチェック
  const src = img.src || img.getAttribute("data-src");
  if (shouldExcludeImage(src)) {
    return false;
  }

  // 小さいアイコン画像を除外
  const { width, height } = getImageSize(img);
  if (
    width > 0 &&
    height > 0 &&
    width <= CONSTANTS.MIN_SIZE_THRESHOLD &&
    height <= CONSTANTS.MIN_SIZE_THRESHOLD
  ) {
    return false;
  }

  return true;
};

// 除外判定を統一する関数
const shouldExcludeImage = (src) => {
  if (!src) return true;

  const lowerSrc = src.toLowerCase();
  return (
    (lowerSrc.includes(".svg") && !src.startsWith("data:")) ||
    (lowerSrc.includes(".gif") && !src.startsWith("data:"))
  );
};

// background-imageを持つ要素を処理（最適化版）
const processBackgroundImages = () => {
  // 一般的にbackground-imageを持つ可能性の高い要素のみを対象
  const targetSelectors = [
    "div",
    "section",
    "header",
    "footer",
    "article",
    "aside",
    "main",
    "nav",
    "figure",
    "span",
    "a",
    "button",
  ];

  const elements = document.querySelectorAll(targetSelectors.join(","));

  elements.forEach((element) => {
    const computedStyle = window.getComputedStyle(element);
    const backgroundImage = computedStyle.backgroundImage;

    // background-imageがある場合
    if (
      backgroundImage &&
      backgroundImage !== "none" &&
      !backgroundImage.includes("gradient")
    ) {
      // SVGやGIF画像を除外
      if (shouldExcludeImage(backgroundImage)) {
        return;
      }

      const existingData = state.imageDataMap.get(element);

      if (existingData) {
        // 既存データがある場合は切り替え
        element.style.backgroundImage = state.isBlackMode
          ? existingData.original
          : existingData.black;
      } else {
        // 新しい要素の場合は処理
        const rect = element.getBoundingClientRect();
        const width = Math.max(rect.width, CONSTANTS.CANVAS_MIN_SIZE);
        const height = Math.max(rect.height, CONSTANTS.CANVAS_MIN_SIZE);

        if (
          width > CONSTANTS.MIN_SIZE_THRESHOLD &&
          height > CONSTANTS.MIN_SIZE_THRESHOLD
        ) {
          const buddhaDataUrl = generateBuddhaImage(width, height);

          // データを保存
          state.imageDataMap.set(element, {
            original: backgroundImage,
            black: `url("${buddhaDataUrl}")`,
          });

          // 黒色モードでない場合（初回）は仏像画像に変更
          if (!state.isBlackMode) {
            element.style.backgroundImage = `url("${buddhaDataUrl}")`;
          }
        }
      }
    }
  });
};

// picture要素のsource要素も処理
const processPictureElements = (img, buddhaDataUrl, isRestore = false) => {
  const picture = img.closest("picture");
  if (picture) {
    const sources = picture.querySelectorAll("source");

    sources.forEach((source) => {
      const existingSourceData = state.imageDataMap.get(source);

      if (isRestore && existingSourceData) {
        // 復元
        source.srcset = existingSourceData.original;
      } else if (!isRestore) {
        // 仏像画像に変更
        if (!existingSourceData) {
          // 初回処理
          state.imageDataMap.set(source, {
            original: source.srcset,
            black: buddhaDataUrl,
          });
        }
        source.srcset = buddhaDataUrl;
      }
    });
  }
};

// iframe全体を仏像画像で覆う
const processIframes = () => {
  const iframes = document.querySelectorAll("iframe");

  iframes.forEach((iframe) => {
    // 小さいiframeは除外
    const width = iframe.offsetWidth || parseInt(iframe.width) || 0;
    const height = iframe.offsetHeight || parseInt(iframe.height) || 0;

    if (
      width <= CONSTANTS.MIN_SIZE_THRESHOLD ||
      height <= CONSTANTS.MIN_SIZE_THRESHOLD
    ) {
      return;
    }

    const existingData = state.imageDataMap.get(iframe);

    if (existingData) {
      // 既存データがある場合は切り替え
      const overlay = existingData.overlay;
      if (overlay) {
        if (state.isBlackMode) {
          // 元に戻す（オーバーレイを非表示）
          overlay.style.display = "none";
        } else {
          // 仏像画像に変更（オーバーレイを表示）
          overlay.style.display = "block";

          // 実際の仏像画像が読み込まれているかチェック
          const cacheKey = `iframe_actual_${width}x${height}`;
          if (state.blackImageCache.has(cacheKey)) {
            const cachedDataUrl = state.blackImageCache.get(cacheKey);
            overlay.style.backgroundImage = `url("${cachedDataUrl}")`;
            existingData.black = cachedDataUrl;
          } else {
            // キャッシュにない場合は再生成
            generateActualBuddhaImageForOverlay(width, height, overlay);
          }
        }
      }
    } else {
      // 新しいiframeの場合は処理
      // 仮の仏像画像を生成
      const tempBuddhaDataUrl = generateBuddhaImage(width, height);

      // オーバーレイ要素を作成
      const overlay = document.createElement("div");
      overlay.style.position = "absolute";
      overlay.style.top = "0";
      overlay.style.left = "0";
      overlay.style.width = width + "px";
      overlay.style.height = height + "px";
      overlay.style.backgroundImage = `url("${tempBuddhaDataUrl}")`;
      overlay.style.backgroundSize = "cover";
      overlay.style.zIndex = "9999";
      overlay.style.pointerEvents = "none";
      overlay.style.display = state.isBlackMode ? "none" : "block";

      // iframeの親要素の位置を相対位置に設定
      const parent = iframe.parentElement;
      if (parent && window.getComputedStyle(parent).position === "static") {
        parent.style.position = "relative";
      }

      // オーバーレイをiframeの後に挿入
      iframe.parentElement.insertBefore(overlay, iframe.nextSibling);

      // データを保存
      state.imageDataMap.set(iframe, {
        overlay: overlay,
        black: tempBuddhaDataUrl,
      });

      // 実際の仏像画像を非同期で生成してオーバーレイを更新
      if (!state.isBlackMode) {
        generateActualBuddhaImageForOverlay(width, height, overlay);
      }
    }
  });
};

// 画像を切り替える関数
const toggleImages = () => {
  // img要素の処理
  const images = document.querySelectorAll("img");

  images.forEach((img) => {
    if (!isTargetImage(img)) {
      return;
    }

    const existingData = state.imageDataMap.get(img);

    if (existingData) {
      // 既存データがある場合は切り替え
      img.src = state.isBlackMode ? existingData.original : existingData.black;

      // data-src属性も復元
      if (img.getAttribute("data-src")) {
        img.setAttribute(
          "data-src",
          state.isBlackMode ? existingData.original : existingData.black
        );
      }

      // picture要素のsource要素も処理
      processPictureElements(img, existingData.black, state.isBlackMode);
    } else {
      // 新しい画像の場合は処理
      const { width, height } = getImageSize(img);

      if (width > 0 && height > 0) {
        // 元の画像URLを取得
        const originalSrc = img.src || img.getAttribute("data-src");

        // 仮の仏像画像を生成
        const tempBuddhaDataUrl = generateBuddhaImage(width, height);

        // データを保存
        state.imageDataMap.set(img, {
          original: originalSrc,
          black: tempBuddhaDataUrl,
        });

        // 黒色モードでない場合（初回）は仏像画像に変更
        if (!state.isBlackMode) {
          img.src = tempBuddhaDataUrl;

          // data-src属性も更新
          if (img.getAttribute("data-src")) {
            img.setAttribute("data-src", tempBuddhaDataUrl);
          }

          // picture要素のsource要素も処理
          processPictureElements(img, tempBuddhaDataUrl, false);

          // 実際の仏像画像を非同期で生成して更新
          generateActualBuddhaImage(width, height, img);
        }
      }
    }
  });

  // background-image要素の処理
  processBackgroundImages();

  // iframe全体を仏像画像で覆う
  processIframes();

  state.isBlackMode = !state.isBlackMode;
};

// フローティングボタンを作成する関数
const createFloatingButton = () => {
  if (state.floatingButton) {
    return; // 既に存在する場合は何もしない
  }

  const button = document.createElement("div");
  button.innerHTML = state.isBlackMode ? "煩悩ON" : "煩悩OFF";
  button.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: ${CONSTANTS.Z_INDEX};
    background: ${CONSTANTS.BUDDHA_COLOR};
    color: white;
    padding: 12px 16px;
    border-radius: 8px;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    transition: all 0.2s ease;
    user-select: none;
    border: none;
  `;

  // ホバー効果
  button.addEventListener("mouseenter", () => {
    button.style.background = CONSTANTS.HOVER_COLOR;
    button.style.transform = "translateY(-2px)";
  });

  button.addEventListener("mouseleave", () => {
    button.style.background = CONSTANTS.BUDDHA_COLOR;
    button.style.transform = "translateY(0)";
  });

  // クリックイベント
  button.addEventListener("click", () => {
    toggleImages();
    updateFloatingButton();
  });

  document.body.appendChild(button);
  state.floatingButton = button;
};

// フローティングボタンを削除する関数
const removeFloatingButton = () => {
  if (state.floatingButton) {
    state.floatingButton.remove();
    state.floatingButton = null;
  }
};

// フローティングボタンのテキストを更新する関数
const updateFloatingButton = () => {
  if (state.floatingButton) {
    state.floatingButton.innerHTML = state.isBlackMode ? "煩悩ON" : "煩悩OFF";
  }
};

// 機能の有効/無効を切り替える関数
const toggleFeature = (isEnabled) => {
  state.isFeatureEnabled = isEnabled;

  if (isEnabled) {
    createFloatingButton();
  } else {
    removeFloatingButton();
    // 機能をOFFにした時に画像を元に戻す
    if (state.isBlackMode) {
      toggleImages();
    }
  }
};

// 初期化時にストレージから状態を読み込む
const initializeFromStorage = async () => {
  try {
    const result = await chrome.storage.sync.get(["isEnabled"]);
    const isEnabled = result.isEnabled || false;
    toggleFeature(isEnabled);
  } catch (error) {
    console.error("ストレージ読み込みエラー:", error);
  }
};

// ポップアップからのメッセージを受信
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "toggleImages") {
    toggleImages();
    sendResponse({ success: true, isBlackMode: state.isBlackMode });
  } else if (request.action === "toggleFeature") {
    toggleFeature(request.isEnabled);
    sendResponse({ success: true });
  }
});

// ページ読み込み時に初期化
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeFromStorage);
} else {
  initializeFromStorage();
}
