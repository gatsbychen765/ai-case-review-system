import { extractBinaryDoc } from "./docBinary.js";
import { textInReadingOrder } from "./pdfText.js";

export const supportedFile = (file) => /\.(docx?|pdf)$/i.test(file.name);
export async function readDocument(file, readDocx) {
  if (file.size > 80 * 1024 * 1024) throw new Error("文档超过80MB，请压缩或拆分附件后上传。");
  const extension = file.name.split(".").pop().toLowerCase();
  let text;
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
    let emptyPages = 0;
    try {
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i), content = await page.getTextContent();
        const pageText = textInReadingOrder(content.items);
        if (pageText.replace(/\s/g, "").length < 10) emptyPages++;
        pages.push(pageText);
      }
    } finally { await loadingTask.destroy(); }
    if (emptyPages) throw new Error(`PDF有${emptyPages}页无可读取文字，可能含扫描页。请先OCR或上传Word，避免漏评。`);
    text = pages.join("\n\n");
  } else throw new Error("请上传DOC、DOCX或PDF。");
  text = String(text || "").replace(/\u0000/g, "").trim();
  if (!text) throw new Error("文档未读出正文，请检查加密、扫描页或文件损坏。");
  return text;
}
