// 画像の状態管理
const state = {
  isBlackMode: false,
  imageDataMap: new WeakMap(),
  blackImageCache: new Map(), // サイズ別の黒色画像キャッシュ
};

// 猫画像のURL
const CAT_IMAGE_URL = chrome.runtime.getURL("image/cat1.jpg");

// 猫画像を生成する関数（仮画像用）
const generateCatImage = (width, height) => {
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

  // 仮の猫色で塗りつぶし
  tempCtx.fillStyle = "#D2B48C"; // 猫色っぽい色
  tempCtx.fillRect(0, 0, width, height);

  const tempDataUrl = tempCanvas.toDataURL("image/png");
  state.blackImageCache.set(cacheKey, tempDataUrl);

  return tempDataUrl;
};

// 特定の画像要素用の実際の猫画像を生成する関数
const generateActualCatImage = (width, height, targetImg) => {
  const cacheKey = `actual_${width}x${height}`;

  // 実際の猫画像のキャッシュをチェック
  if (state.blackImageCache.has(cacheKey)) {
    const cachedDataUrl = state.blackImageCache.get(cacheKey);
    updateImageWithCachedData(targetImg, cachedDataUrl);
    return;
  }

  // Canvas で猫画像をリサイズ
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  // 猫画像を読み込み
  const img = new Image();
  img.onload = () => {
    // object-fit: cover の実装
    const imgAspect = img.width / img.height;
    const canvasAspect = width / height;

    let sx = 0,
      sy = 0,
      sw = img.width,
      sh = img.height;

    if (imgAspect > canvasAspect) {
      // 画像が横長の場合、横をクロップ
      sw = img.height * canvasAspect;
      sx = (img.width - sw) / 2;
    } else {
      // 画像が縦長の場合、縦をクロップ
      sh = img.width / canvasAspect;
      sy = (img.height - sh) / 2;
    }

    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, width, height);
    const dataUrl = canvas.toDataURL("image/png");

    // キャッシュに保存
    state.blackImageCache.set(cacheKey, dataUrl);

    // 特定の画像要素を更新
    updateImageWithCachedData(targetImg, dataUrl);
  };
  img.onerror = () => {
    console.error("Failed to load cat image");
  };

  // CORSの問題を回避するためにcrossOriginを設定
  img.crossOrigin = "anonymous";
  img.src = CAT_IMAGE_URL;
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
  }
};

// 画像が対象かどうかを判定
const isTargetImage = (img) => {
  // srcまたはdata-srcがあるかチェック
  const src = img.src || img.getAttribute("data-src");
  if (!src) {
    return false;
  }

  // ファイル拡張子による SVG 画像を除外
  if (src.toLowerCase().includes(".svg") && !src.startsWith("data:")) {
    return false;
  }

  // 小さいアイコン画像を除外（32x32px以下）
  let width = img.naturalWidth || img.width;
  let height = img.naturalHeight || img.height;

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

  // 小さい画像を除外
  if (width > 0 && height > 0 && width <= 32 && height <= 32) {
    return false;
  }

  return true;
};

// background-imageを持つ要素を処理
const processBackgroundImages = () => {
  const allElements = document.querySelectorAll("*");

  allElements.forEach((element) => {
    const computedStyle = window.getComputedStyle(element);
    const backgroundImage = computedStyle.backgroundImage;

    // background-imageがある場合
    if (
      backgroundImage &&
      backgroundImage !== "none" &&
      !backgroundImage.includes("gradient")
    ) {
      const existingData = state.imageDataMap.get(element);

      if (existingData) {
        // 既存データがある場合は切り替え
        if (state.isBlackMode) {
          element.style.backgroundImage = existingData.original;
        } else {
          element.style.backgroundImage = existingData.black;
        }
      } else {
        // 新しい要素の場合は処理
        const rect = element.getBoundingClientRect();
        const width = Math.max(rect.width, 100);
        const height = Math.max(rect.height, 100);

        if (width > 32 && height > 32) {
          const catDataUrl = generateCatImage(width, height);

          // データを保存
          state.imageDataMap.set(element, {
            original: backgroundImage,
            black: `url("${catDataUrl}")`,
          });

          // 黒色モードでない場合（初回）は猫画像に変更
          if (!state.isBlackMode) {
            element.style.backgroundImage = `url("${catDataUrl}")`;
          }
        }
      }
    }
  });
};

// picture要素のsource要素も処理
const processPictureElements = (img, catDataUrl, isRestore = false) => {
  const picture = img.closest("picture");
  if (picture) {
    const sources = picture.querySelectorAll("source");
    sources.forEach((source) => {
      const existingSourceData = state.imageDataMap.get(source);

      if (isRestore && existingSourceData) {
        // 復元
        source.srcset = existingSourceData.original;
      } else if (!isRestore) {
        // 猫画像に変更
        if (!existingSourceData) {
          // 初回処理
          state.imageDataMap.set(source, {
            original: source.srcset,
            black: catDataUrl,
          });
        }
        source.srcset = catDataUrl;
      }
    });
  }
};

// iframe全体を黒色画像で覆う
const processIframes = () => {
  const iframes = document.querySelectorAll("iframe");

  iframes.forEach((iframe) => {
    // 小さいiframeは除外
    const width = iframe.offsetWidth || parseInt(iframe.width) || 0;
    const height = iframe.offsetHeight || parseInt(iframe.height) || 0;

    if (width <= 32 || height <= 32) {
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
          // 黒色に変更（オーバーレイを表示）
          overlay.style.display = "block";
        }
      }
    } else {
      // 新しいiframeの場合は処理
      // 猫画像を生成
      const catDataUrl = generateCatImage(width, height);

      // オーバーレイ要素を作成
      const overlay = document.createElement("div");
      overlay.style.position = "absolute";
      overlay.style.top = "0";
      overlay.style.left = "0";
      overlay.style.width = width + "px";
      overlay.style.height = height + "px";
      overlay.style.backgroundImage = `url("${catDataUrl}")`;
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
      });
    }
  });
};

// 画像を切り替える関数
const toggleImages = () => {
  // img要素の処理
  const images = document.querySelectorAll("img");
  let processedCount = 0;
  let skippedCount = 0;

  images.forEach((img) => {
    if (!isTargetImage(img)) {
      skippedCount++;
      return;
    }

    // 既存のデータがあるかチェック
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

      processedCount++;
    } else {
      // 新しい画像の場合は処理
      // 表示サイズを優先して取得
      let width = img.offsetWidth || img.width;
      let height = img.offsetHeight || img.height;

      // CSSからサイズを取得
      if (width === 0 || height === 0) {
        const computedStyle = window.getComputedStyle(img);
        width = parseInt(computedStyle.width) || 0;
        height = parseInt(computedStyle.height) || 0;
      }

      // 属性からサイズを取得（最後の手段）
      if (width === 0 || height === 0) {
        width = parseInt(img.getAttribute("width")) || 200;
        height = parseInt(img.getAttribute("height")) || 200;
      }

      if (width > 0 && height > 0) {
        // 元の画像URLを取得
        const originalSrc = img.src || img.getAttribute("data-src");

        // 仮の猫画像を生成
        const tempCatDataUrl = generateCatImage(width, height);

        // データを保存
        state.imageDataMap.set(img, {
          original: originalSrc,
          black: tempCatDataUrl,
        });

        // 黒色モードでない場合（初回）は猫画像に変更
        if (!state.isBlackMode) {
          img.src = tempCatDataUrl;

          // data-src属性も更新
          if (img.getAttribute("data-src")) {
            img.setAttribute("data-src", tempCatDataUrl);
          }

          // picture要素のsource要素も処理
          processPictureElements(img, tempCatDataUrl, false);

          // 実際の猫画像を非同期で生成して更新
          generateActualCatImage(width, height, img);
        }
        processedCount++;
      } else {
        skippedCount++;
      }
    }
  });

  // background-image要素の処理
  processBackgroundImages();

  // iframe全体を黒色画像で覆う
  processIframes();

  state.isBlackMode = !state.isBlackMode;
};

// ポップアップからのメッセージを受信
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "toggleImages") {
    toggleImages();
    sendResponse({ success: true, isBlackMode: state.isBlackMode });
  }
});
