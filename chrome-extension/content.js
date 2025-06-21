// 画像の状態管理
const state = {
  isBlackMode: false,
  imageDataMap: new WeakMap(),
  blackImageCache: new Map(), // サイズ別の黒色画像キャッシュ
};

// 黒色画像を生成する関数
const generateBlackImage = (width, height) => {
  const cacheKey = `${width}x${height}`;

  // キャッシュから取得
  if (state.blackImageCache.has(cacheKey)) {
    return state.blackImageCache.get(cacheKey);
  }

  // Canvas で黒色画像を生成
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#ffcce5";
  ctx.fillRect(0, 0, width, height);

  const dataUrl = canvas.toDataURL("image/png");
  state.blackImageCache.set(cacheKey, dataUrl);

  return dataUrl;
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
          const blackDataUrl = generateBlackImage(width, height);

          // データを保存
          state.imageDataMap.set(element, {
            original: backgroundImage,
            black: `url("${blackDataUrl}")`,
          });

          // 黒色モードでない場合（初回）は黒色に変更
          if (!state.isBlackMode) {
            element.style.backgroundImage = `url("${blackDataUrl}")`;
          }
        }
      }
    }
  });
};

// picture要素のsource要素も処理
const processPictureElements = (img, blackDataUrl, isRestore = false) => {
  const picture = img.closest("picture");
  if (picture) {
    const sources = picture.querySelectorAll("source");
    sources.forEach((source) => {
      const existingSourceData = state.imageDataMap.get(source);

      if (isRestore && existingSourceData) {
        // 復元
        source.srcset = existingSourceData.original;
      } else if (!isRestore) {
        // 黒色に変更
        if (!existingSourceData) {
          // 初回処理
          state.imageDataMap.set(source, {
            original: source.srcset,
            black: blackDataUrl,
          });
        }
        source.srcset = blackDataUrl;
      }
    });
  }
};

// iframe全体を黒色画像で覆う
const processIframes = () => {
  const iframes = document.querySelectorAll("iframe");
  console.log(`Found ${iframes.length} iframe elements`);

  iframes.forEach((iframe, index) => {
    console.log(`Processing iframe ${index + 1}:`, {
      src: iframe.src ? iframe.src.substring(0, 100) + "..." : "no src",
      width: iframe.offsetWidth,
      height: iframe.offsetHeight,
    });

    // 小さいiframeは除外
    const width = iframe.offsetWidth || parseInt(iframe.width) || 0;
    const height = iframe.offsetHeight || parseInt(iframe.height) || 0;

    if (width <= 32 || height <= 32) {
      console.log(
        `Skipped iframe ${index + 1} (too small: ${width}x${height})`
      );
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
        console.log(
          `Switched iframe ${index + 1} to ${
            state.isBlackMode ? "original" : "black"
          }`
        );
      }
    } else {
      // 新しいiframeの場合は処理
      // 黒色画像を生成
      const blackDataUrl = generateBlackImage(width, height);

      // オーバーレイ要素を作成
      const overlay = document.createElement("div");
      overlay.style.position = "absolute";
      overlay.style.top = "0";
      overlay.style.left = "0";
      overlay.style.width = width + "px";
      overlay.style.height = height + "px";
      overlay.style.backgroundImage = `url("${blackDataUrl}")`;
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

      console.log(`Created black overlay for iframe ${index + 1}`);
    }
  });
};

// 画像を切り替える関数
const toggleImages = () => {
  console.log("=== Toggle Images Started ===");

  // img要素の処理
  const images = document.querySelectorAll("img");
  console.log(`Found ${images.length} img elements`);

  let processedCount = 0;
  let skippedCount = 0;

  images.forEach((img, index) => {
    console.log(`Processing img ${index + 1}:`, {
      src: img.src.substring(0, 100) + "...",
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      width: img.width,
      height: img.height,
      widthAttr: img.getAttribute("width"),
      heightAttr: img.getAttribute("height"),
      loading: img.getAttribute("loading"),
      className: img.className,
      hasPicture: !!img.closest("picture"),
    });

    if (!isTargetImage(img)) {
      console.log(`Skipped img ${index + 1} (not target)`);
      skippedCount++;
      return;
    }

    // 既存のデータがあるかチェック
    const existingData = state.imageDataMap.get(img);

    if (existingData) {
      // 既存データがある場合は切り替え
      console.log(`Switching existing img ${index + 1}`);
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
      let width = img.naturalWidth || img.width;
      let height = img.naturalHeight || img.height;

      // 属性からサイズを取得（lazy loading対応）
      if (width === 0 || height === 0) {
        width = parseInt(img.getAttribute("width")) || 200;
        height = parseInt(img.getAttribute("height")) || 200;
      }

      // CSSからサイズを取得
      if (width === 0 || height === 0) {
        const computedStyle = window.getComputedStyle(img);
        width = parseInt(computedStyle.width) || 200;
        height = parseInt(computedStyle.height) || 200;
      }

      console.log(`Final size for img ${index + 1}: ${width}x${height}`);

      if (width > 0 && height > 0) {
        const blackDataUrl = generateBlackImage(width, height);

        // 元の画像URLを取得（srcまたはdata-src）
        const originalSrc = img.src || img.getAttribute("data-src");

        // データを保存
        state.imageDataMap.set(img, {
          original: originalSrc,
          black: blackDataUrl,
        });

        // 黒色モードでない場合（初回）は黒色に変更
        if (!state.isBlackMode) {
          console.log(`Converting new img ${index + 1} to black`);
          img.src = blackDataUrl;

          // data-src属性も更新
          if (img.getAttribute("data-src")) {
            img.setAttribute("data-src", blackDataUrl);
          }

          // picture要素のsource要素も処理
          processPictureElements(img, blackDataUrl, false);
        }
        processedCount++;
      } else {
        console.log(`Skipped img ${index + 1} (invalid size)`);
        skippedCount++;
      }
    }
  });

  console.log(`Processed: ${processedCount}, Skipped: ${skippedCount}`);

  // background-image要素の処理
  processBackgroundImages();

  // iframe全体を黒色画像で覆う
  processIframes();

  state.isBlackMode = !state.isBlackMode;
  console.log(`New mode: ${state.isBlackMode ? "BLACK" : "ORIGINAL"}`);
  console.log("=== Toggle Images Completed ===");
};

// ポップアップからのメッセージを受信
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "toggleImages") {
    toggleImages();
    sendResponse({ success: true, isBlackMode: state.isBlackMode });
  }
});
