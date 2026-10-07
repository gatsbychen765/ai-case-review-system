export function needsOcr(text, hasImage, mode = "auto") {
  const length = String(text || "").replace(/\s/g, "").length;
  return mode === "all" || length < 10 || (hasImage && length < 200);
}

export function ocrWarnings(text, confidence, pageNumber) {
  if (String(text || "").replace(/\s/g, "").length < 10) return [`第${pageNumber}页未识别出有效文字，需查看原文确认是否为空白或识别失败`];
  if (!Number.isFinite(confidence) || confidence < 65) return [`第${pageNumber}页OCR置信度较低，需人工核对文字`];
  return [];
}

function isBlank(canvas) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  const step = Math.max(1, Math.floor(Math.sqrt(canvas.width * canvas.height / 20000)));
  for (let y = 0; y < canvas.height; y += step) for (let x = 0; x < canvas.width; x += step) {
    const offset = (y * canvas.width + x) * 4;
    if (data[offset] + data[offset + 1] + data[offset + 2] < 690) return false;
  }
  return true;
}

export async function createPdfOcr(onProgress = () => {}) {
  let worker;
  let activePage = 0;
  const ensureWorker = async () => {
    if (worker) return worker;
    onProgress(`第${activePage}页：正在加载中文OCR组件（首次使用需下载）…`);
    const { createWorker } = await import("tesseract.js");
    const root = new URL(`${import.meta.env.BASE_URL}ocr/`, window.location.href).href;
    worker = await createWorker("chi_sim+eng", 1, {
      workerPath: `${root}worker.min.js`, corePath: root, langPath: root,
      workerBlobURL: false, cachePath: "ecnu-ocr-fast-4-1",
      logger: (message) => {
        if (message.status === "recognizing text") onProgress(`第${activePage}页OCR识别 ${Math.round(message.progress * 100)}%`);
      },
    });
    return worker;
  };
  return {
    async recognize(page, pageNumber) {
      activePage = pageNumber;
      const original = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(2.5, 2600 / Math.max(original.width, original.height)) });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      try {
        await page.render({ canvasContext: canvas.getContext("2d"), viewport, background: "rgb(255,255,255)" }).promise;
        if (isBlank(canvas)) return { text: "", blank: true, confidence: 100, warnings: [] };
        const engine = await ensureWorker();
        const { data } = await engine.recognize(canvas);
        return { text: data.text.trim(), confidence: data.confidence, warnings: ocrWarnings(data.text, data.confidence, pageNumber) };
      } finally { canvas.width = 0; canvas.height = 0; }
    },
    async close() { if (worker) await worker.terminate(); },
  };
}
