import { extractBinaryDoc } from "./docBinary.js";
import { textInReadingOrder } from "./pdfText.js";
import { createPdfOcr, needsOcr } from "./pdfOcr.js";

export const supportedFile = (file) => /\.(docx?|pdf)$/i.test(file.name);
export async function readDocument(file, readDocx, options = {}) {
  if (file.size > 80 * 1024 * 1024) throw new Error("文档超过80MB，请压缩或拆分附件后上传。");
  const extension = file.name.split(".").pop().toLowerCase();
  let text;
  const metadata = { ocrPages: [], blankPages: [], warnings: [], pageCount: null };
  if (extension === "docx") text = await readDocx(file);
  else if (extension === "doc") {
    const buffer = await file.arrayBuffer(), bytes = new Uint8Array(buffer);
    // Some providers save HTML with a .doc suffix. Never execute its HTML.
    if (bytes[0] === 0xd0 && bytes[1] === 0xcf) text = extractBinaryDoc(buffer);
    else if (bytes[0] === 0x50 && bytes[1] === 0x4b) text = await readDocx(file);
    else {
      const initial = new TextDecoder().decode(bytes.subarray(0, 1000));
      if (!/<(?:html|!doctype|body)/i.test(initial)) throw new Error("此DOC格式无法解析（可能为RTF或旧版本），请另存为DOCX。");
      const encoding = /charset\s*=\s*["']?(gbk|gb2312|gb18030)/i.test(initial) ? "gb18030" : "utf-8";
      const html = new DOMParser().parseFromString(new TextDecoder(encoding).decode(bytes), "text/html");
      html.querySelectorAll("script,style").forEach((x) => x.remove());
      html.querySelectorAll("p,div,tr,br,h1,h2,h3").forEach((x) => x.append("\n"));
      text = html.body.textContent;
    }
  } else if (extension === "pdf") {
    const pdfjs = await import("pdfjs-dist");
    const { default: workerUrl } = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    const loadingTask = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false });
    const pdf = await loadingTask.promise;
    const pages = [];
    metadata.pageCount = pdf.numPages;
    const ocr = await createPdfOcr(options.onProgress);
    try {
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i), content = await page.getTextContent();
        options.onProgress?.(`正在读取PDF第${i}/${pdf.numPages}页…`);
        let pageText = textInReadingOrder(content.items);
        const operations = await page.getOperatorList();
        const hasImage = operations.fnArray.some((op) => [pdfjs.OPS.paintImageXObject, pdfjs.OPS.paintInlineImageXObject, pdfjs.OPS.paintImageMaskXObject].includes(op));
        if (needsOcr(pageText, hasImage, options.pdfOcrMode)) {
          const recognized = await ocr.recognize(page, i);
          if (recognized.blank) metadata.blankPages.push(i);
          else {
            metadata.ocrPages.push({ page: i, confidence: recognized.confidence });
            metadata.warnings.push(...recognized.warnings);
          }
          // OCR supersedes the short text layer (often only watermarks or page numbers).
          if (recognized.text) pageText = recognized.text;
        }
        pages.push(pageText);
        page.cleanup();
      }
    } finally { await ocr.close(); await loadingTask.destroy(); options.onMetadata?.(metadata); }
    text = pages.join("\n\n");
  } else throw new Error("请上传DOC、DOCX或PDF。");
  text = String(text || "").replace(/\u0000/g, "").trim();
  options.onMetadata?.(metadata);
  if (!text) throw new Error("未识别出有效正文，请查看原始文档核对扫描清晰度、空白页或密码保护。");
  return text;
}
