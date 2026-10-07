import { useEffect, useMemo, useRef, useState } from "react";
import { renderAsync } from "docx-preview";
import { effectiveTemplate, templateFailures, orderCases, rankBatch, screeningDecision } from "./batchScreening.js";
import { readDocument, supportedFile } from "./documentReader.js";
import { requestWithRetry, wait } from "./reviewQueue.js";
import { RUBRICS } from "./rubrics.js";
import { checkTemplate, suggestCategory } from "./templateCheck.js";

const REVIEW_API_BASE_URL = (import.meta.env.VITE_REVIEW_API_BASE_URL || "").replace(/\/+$/, "");

const DEMO_TEXT = `一、案例背景与问题\n在新课程改革和核心素养导向下，地理教学需要从知识传授转向素养培育。传统课堂中，学生的探究活动常受限于课堂时间、资料获取难度和教师个别指导的精力，难以实现真正的个性化学习。\n\n二、教学目标与设计\n本案例以课程标准为依据，聚焦区域认知、综合思维与人地协调观。教师结合学生的生活经验，设计“城市热岛效应的成因与应对”探究任务，提供地图、气温记录和分层学习支架。\n\n三、实施过程\n学生以小组形式提出问题、收集资料、比较分析并展示方案。教师使用人工智能工具生成差异化阅读材料和追问建议，学生核对资料来源，讨论AI回答的适用边界。教师根据学生反馈调整活动节奏，并准备离线材料应对网络故障。\n\n四、学习成果与评价\n评价结合过程记录、小组成果和个人反思。学生完成专题地图与改善建议，课堂观察记录显示多数小组能引用证据解释区域差异。\n\n五、反思与改进\n案例仍需补充更完整的前后测数据，并进一步说明AI生成资料的审核流程。后续将优化学习支架，邀请学生共同修订评价量规。`;

async function readDocx(file) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("文件不是可读取的 DOCX 文档。");
  const count = view.getUint16(eocd + 10, true);
  let cursor = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder("utf-8");
  for (let i = 0; i < count; i += 1) {
    if (view.getUint32(cursor, true) !== 0x02014b50) break;
    const method = view.getUint16(cursor + 10, true);
    const size = view.getUint32(cursor + 20, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const name = decoder.decode(bytes.slice(cursor + 46, cursor + 46 + nameLength));
    if (name === "word/document.xml") {
      const localNameLength = view.getUint16(localOffset + 26, true);
      const localExtraLength = view.getUint16(localOffset + 28, true);
      const start = localOffset + 30 + localNameLength + localExtraLength;
      const packed = bytes.slice(start, start + size);
      let xmlBuffer;
      if (method === 0) xmlBuffer = packed.buffer.slice(packed.byteOffset, packed.byteOffset + packed.byteLength);
      else if (method === 8 && "DecompressionStream" in window) {
        xmlBuffer = await new Response(new Blob([packed]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer();
      } else throw new Error("当前浏览器无法解压此 DOCX 文件。");
      const xml = new DOMParser().parseFromString(decoder.decode(xmlBuffer), "application/xml");
      const paragraphs = Array.from(xml.getElementsByTagNameNS("*", "p")).map((p) =>
        Array.from(p.getElementsByTagNameNS("*", "t")).map((t) => t.textContent).join("").trim()
      ).filter(Boolean);
      if (!paragraphs.length) throw new Error("文档中未提取到正文文字。");
      return paragraphs.join("\n\n");
    }
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error("未在文件中找到正文内容。");
}

function OriginalWordPreview({ file }) {
  const previewRef = useRef(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    const target = previewRef.current;
    if (!target || !file) return undefined;
    let cancelled = false;
    target.replaceChildren();
    setStatus("正在生成 Word 页面预览…");
    renderAsync(file, target, target, {
      className: "docx",
      inWrapper: true,
      breakPages: true,
      renderHeaders: true,
      renderFooters: true,
      renderFootnotes: true,
      renderEndnotes: true,
      renderAltChunks: false,
      useBase64URL: true,
    }).then(() => {
      if (!cancelled) setStatus("");
    }).catch(() => {
      if (!cancelled) setStatus("原始 Word 预览生成失败，请下载文档后使用 Word 查看。文字解析结果仍可正常使用。");
    });
    return () => {
      cancelled = true;
      target.replaceChildren();
    };
  }, [file]);

  if (!file) return <div className="word-preview-empty">示例文档没有对应的原始 Word 文件。上传 DOCX 后可在此查看原始版式。</div>;
  return <div className="word-preview-scroll"><div className="word-preview-status" role="status">{status}</div><div ref={previewRef} className="word-preview-pages" /></div>;
}

function OriginalDocumentPreview({ file }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!file) return;
    const next = URL.createObjectURL(file); setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  if (!file || /\.docx$/i.test(file.name)) return <OriginalWordPreview file={file} />;
  if (/\.pdf$/i.test(file.name)) return <div className="pdf-preview"><object data={url} type="application/pdf" aria-label="原始PDF文档"><a href={url} target="_blank" rel="noreferrer">打开原始PDF</a></object><a href={url} target="_blank" rel="noreferrer">单独打开原始PDF</a></div>;
  return <div className="word-preview-empty"><p>DOC正文已解析。浏览器无法还原旧版Word版式，可下载后在Word或WPS中核对。</p><a href={url} download={file.name}>下载原始DOC</a></div>;
}

function makeEvidence(text, row, demo) {
  if (!text) return "上传案例文档后，可在正文中核对相关依据。";
  const paragraphs = text.split(/\n+/).map((item) => item.trim()).filter((item) => item && !/^(一、|二、|三、|四、|五、|\d+[.、])/.test(item));
  const termsByRow = {
    规范性: ["视频", "伦理", "安全", "隐私", "来源", "审核", "材料"],
    教学设计: ["课程标准", "核心素养", "目标", "任务", "支架", "评价"],
    教学实施: ["实施", "学生", "教师", "活动", "反馈", "调整", "课堂", "AI"],
    教学效果: ["成果", "评价", "数据", "参与", "提升", "成效"],
    教学创新: ["创新", "示范", "推广", "特色", "新方法"],
    需求分析与方案设计: ["需求", "问题", "痛点", "目标", "方案", "场景"],
    开发实现: ["提示词", "知识库", "插件", "工作流", "测试", "迭代", "功能"],
    应用成效: ["应用", "效率", "成效", "数据", "减负", "质量", "局限"],
    创新与可推广性: ["创新", "迁移", "推广", "经验", "适应"],
    问题与解决思路: ["问题", "模式", "任务", "培训", "教研", "实践", "资源", "策略"],
    成效与创新: ["成效", "数据", "成果", "教师", "实践", "推广", "提升"],
  };
  const terms = termsByRow[row.name] || [];
  const found = paragraphs.map((paragraph) => ({ paragraph, matches: terms.filter((term) => paragraph.includes(term)).length })).sort((a, b) => b.matches - a.matches)[0];
  if (found?.matches) return `“${found.paragraph.slice(0, 110)}${found.paragraph.length > 110 ? "…" : ""}”`;
  return demo ? "示例中暂未定位到直接依据，请结合完整材料复核。" : "当前未定位到直接依据；请在文档中核对或补充说明。";
}

function xmlEscape(value) { return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;"); }
function excelColumn(number) { let result = ""; while (number) { const remainder = (number - 1) % 26; result = String.fromCharCode(65 + remainder) + result; number = Math.floor((number - 1) / 26); } return result; }
function sheetXml(rows) { return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((value, colIndex) => typeof value === "number" && Number.isFinite(value) ? `<c r="${excelColumn(colIndex + 1)}${rowIndex + 1}" t="n"><v>${value}</v></c>` : `<c r="${excelColumn(colIndex + 1)}${rowIndex + 1}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`).join("")}</row>`).join("")}</sheetData></worksheet>`; }
const CRC_TABLE = (() => { const table = new Uint32Array(256); for (let n = 0; n < 256; n += 1) { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; } return table; })();
function crc32(bytes) { let crc = 0xffffffff; for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 255] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0; }
function zipStore(entries) {
  const encoder = new TextEncoder(); const locals = []; const centrals = []; let offset = 0;
  for (const [name, text] of entries) {
    const nameBytes = encoder.encode(name); const data = encoder.encode(text); const crc = crc32(data);
    const local = new Uint8Array(30 + nameBytes.length + data.length); const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x0800, true); lv.setUint16(8, 0, true); lv.setUint32(14, crc, true); lv.setUint32(18, data.length, true); lv.setUint32(22, data.length, true); lv.setUint16(26, nameBytes.length, true); local.set(nameBytes, 30); local.set(data, 30 + nameBytes.length); locals.push(local);
    const central = new Uint8Array(46 + nameBytes.length); const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true); cv.setUint16(10, 0, true); cv.setUint32(16, crc, true); cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true); cv.setUint16(28, nameBytes.length, true); cv.setUint32(42, offset, true); central.set(nameBytes, 46); centrals.push(central); offset += local.length;
  }
  const centralSize = centrals.reduce((sum, item) => sum + item.length, 0); const end = new Uint8Array(22); const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, entries.length, true); ev.setUint16(10, entries.length, true); ev.setUint32(12, centralSize, true); ev.setUint32(16, offset, true);
  return new Blob([...locals, ...centrals, end], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

function App() {
  const fileInput = useRef(null);
  const batchFileInput = useRef(null);
  const [view, setView] = useState("review");
  const [category, setCategory] = useState(1);
  const [documentView, setDocumentView] = useState("document");
  const [doc, setDoc] = useState({ title: "示范案例：生成式 AI 支持高中地理探究学习", fileName: "系统示例 · 虚构案例文本", text: DEMO_TEXT, demo: true });
  const [scores, setScores] = useState(() => Object.fromEntries(RUBRICS[1].rows.map((row) => [row.name, row.sample])));
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [history, setHistory] = useState([]);
  const [consentOpen, setConsentOpen] = useState(false);
  const [aiReview, setAiReview] = useState(null);
  const templateResult = useMemo(() => doc.demo ? null : checkTemplate(doc.text, category), [doc, category]);
  const [apiKey, setApiKey] = useState(() => sessionStorage.getItem("review-api-key") || "");
  const [keyDraft, setKeyDraft] = useState(() => sessionStorage.getItem("review-api-key") || "");
  const [apiUrl, setApiUrl] = useState(() => sessionStorage.getItem("review-api-url") || "");
  const [model, setModel] = useState(() => sessionStorage.getItem("review-model") || "");
  const [apiUrlDraft, setApiUrlDraft] = useState(() => sessionStorage.getItem("review-api-url") || "");
  const [modelDraft, setModelDraft] = useState(() => sessionStorage.getItem("review-model") || "");
  const [keyDialogOpen, setKeyDialogOpen] = useState(false);
  const [keyTesting, setKeyTesting] = useState(false);
  const [keyStatus, setKeyStatus] = useState("");
  const [keyConnected, setKeyConnected] = useState(() => Boolean(sessionStorage.getItem("review-api-key") && sessionStorage.getItem("review-api-url") && sessionStorage.getItem("review-model")));
  const [batchCases, setBatchCases] = useState([]);
  const [screenPercentage, setScreenPercentage] = useState(50);
  const [requestInterval, setRequestInterval] = useState(10);
  const stopBatch = useRef(false);
  const [availableModels, setAvailableModels] = useState([]);
  const [modelLoading, setModelLoading] = useState(false);
  const [reportBusy, setReportBusy] = useState(false);
  const [maxOutputTokens, setMaxOutputTokens] = useState(() => Number(sessionStorage.getItem("review-output-budget")) || 8192);
  const [singleTemplateOverride, setSingleTemplateOverride] = useState(false);
  const [batchDeclaredCategory, setBatchDeclaredCategory] = useState(0);
  const [batchReading, setBatchReading] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchProgress, setBatchProgress] = useState("");
  const rubric = RUBRICS[category];
  const assigned = rubric.rows.filter((row) => scores[row.name] !== "" && scores[row.name] != null).length;
  const total = useMemo(() => rubric.rows.reduce((sum, row) => sum + (Number(scores[row.name]) || 0), 0), [rubric, scores]);
  const ranking = useMemo(() => rankBatch(batchCases, screenPercentage), [batchCases, screenPercentage]);
  const failures = templateFailures(batchCases);
  const orderedCases = useMemo(() => orderCases(batchCases), [batchCases]);
  const scoredCount = ranking.scored;

  async function loadFile(file) {
    if (!file || busy || batchBusy) return;
    if (!supportedFile(file)) { setNotice("请上传DOC、DOCX或PDF案例文档。"); return; }
    setBusy(true); setNotice("");
    try {
      const text = await readDocument(file, readDocx);
      const detectedCategory = suggestCategory(text);
      setCategory(detectedCategory);
      setDoc({ title: file.name.replace(/\.(docx?|pdf)$/i, ""), fileName: file.name, text, sourceFile: file, demo: false });
      setDocumentView("document");
      setScores(Object.fromEntries(RUBRICS[detectedCategory].rows.map((row) => [row.name, ""])));
      setSingleTemplateOverride(false);
      setAiReview(null);
      setComment("");
      setNotice("文档已读取。请先核对模板结构和案例类别，再进行 AI 评分。");
      setView("review");
    } catch (error) { setNotice(error.message || "文档读取失败，请确认文件未损坏。"); }
    finally { setBusy(false); if (fileInput.current) fileInput.current.value = ""; }
  }

  function switchCategory(id) {
    if (busy || batchBusy) return;
    setSingleTemplateOverride(false);
    if (doc.batchId) setBatchCases((items) => items.map((item) => item.id === doc.batchId ? { ...item, category: id, template: checkTemplate(item.text, id), templateOverride: false, result: null, error: "", status: "待核对模板" } : item));
    setCategory(id);
    setScores(Object.fromEntries(RUBRICS[id].rows.map((row) => [row.name, doc.demo ? row.sample : ""])));
    setAiReview(null);
    setComment("");
    setNotice("");
  }

  async function runAIReview() {
    if (!apiKey || !apiUrl || !model) { setKeyDialogOpen(true); setNotice("请先在模型设置中填写 API 地址、模型名称和 API Key 并测试连接。"); return; }
    if (busy || batchBusy) return;
    if (templateResult && templateResult.status !== "符合模板" && !singleTemplateOverride) {
      if (!window.confirm(`第一步模板核对结果：${templateResult.status}。${templateResult.reasons.join("；")}。是否经人工核对后继续评分？`)) return;
      setSingleTemplateOverride(true);
      if (doc.batchId) setBatchCases((items) => items.map((item) => item.id === doc.batchId ? { ...item, templateOverride: true, status: item.result ? "评分完成·待复核" : "人工确认·待评分" } : item));
    }
    setConsentOpen(false);
    setBusy(true); setNotice("");
    try {
      const data = await requestWithRetry(() => fetch(`${REVIEW_API_BASE_URL}/api/score`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          category: rubric.name,
          apiUrl,
          model, maxOutputTokens,
          text: doc.text,
          rubric: rubric.rows.map(({ name, weight, points }) => ({ name, weight, points })),
        }),
      }), (seconds) => setNotice(`暂时限流，${seconds}秒后自动重试…`));
      const byName = Object.fromEntries(data.results.map((item) => [item.indicator, item]));
      const suggestedTotal = data.results.reduce((sum, item) => sum + Number(item.score || 0), 0);
      setScores(Object.fromEntries(rubric.rows.map((row) => [row.name, byName[row.name]?.score ?? ""])));
      setAiReview({ ...data, byName, reviewedAt: new Date().toLocaleString("zh-CN") });
      if (doc.batchId) setBatchCases((items) => items.map((item) => item.id === doc.batchId ? { ...item, status: "评分完成·待复核", error: "", result: { ...data, total: suggestedTotal, results: data.results.map((row) => ({ ...row, max: rubric.rows.find((r) => r.name === row.indicator).weight })) } } : item));
      setComment(data.overallComment || "");
      setNotice(`AI 初审建议已生成：${suggestedTotal} 分。请逐项核对评分理由与原文证据。`);
    } catch (error) {
      setNotice(error.message || "AI 初审失败，请检查本地服务和模型配置。");
    } finally { setBusy(false); }
  }

  async function testAndSaveKey() {
    const candidate = keyDraft.trim();
    const candidateUrl = apiUrlDraft.trim();
    const candidateModel = modelDraft.trim();
    if (!candidateUrl || !candidateModel || !candidate) { setKeyStatus("请填写 API 地址、模型名称和 API Key。"); return; }
    setKeyTesting(true); setKeyStatus("正在测试模型连接…");
    try {
      const response = await fetch(`${REVIEW_API_BASE_URL}/api/test-key`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${candidate}` }, body: JSON.stringify({ apiUrl: candidateUrl, model: candidateModel, maxOutputTokens }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "连接测试失败。");
      sessionStorage.setItem("review-output-budget", String(maxOutputTokens));
      sessionStorage.setItem("review-api-key", candidate);
      sessionStorage.setItem("review-api-url", candidateUrl); sessionStorage.setItem("review-model", candidateModel);
      setApiKey(candidate); setKeyDraft(candidate); setApiUrl(candidateUrl); setModel(candidateModel); setApiUrlDraft(candidateUrl); setModelDraft(candidateModel); setKeyConnected(true);
      setKeyStatus("连接成功，已保存到当前浏览器会话。刷新页面后仍可使用，关闭浏览器会话后清除。");
    } catch (error) {
      setKeyConnected(false);
      setKeyStatus(error.message || "连接测试失败，请检查网络与 API Key。");
    } finally { setKeyTesting(false); }
  }

  async function addBatchFiles(fileList) {
    if (busy || batchBusy) return;
    const files = Array.from(fileList || []).filter((file) => supportedFile(file));
    if (!files.length) { setNotice("请选择DOC、DOCX或PDF案例文档。"); return; }
    setBatchReading(true); setBatchBusy(true); setBatchProgress(`正在读取 ${files.length} 份案例文档…`);
    const added = [];
    for (const file of files) {
      const item = { id: crypto.randomUUID(), name: file.name, category: 1, text: "", sourceFile: file, status: "读取中", result: null, error: "", templateOverride: false };
      try {
        item.text = await readDocument(file, readDocx);
        item.category = batchDeclaredCategory || suggestCategory(item.text);
        item.template = checkTemplate(item.text, item.category);
        item.status = item.template.status === "符合模板" ? "待评分" : "待核对模板";
      }
      catch (error) { item.status = "读取失败"; item.error = error.message || "文档读取失败"; }
      added.push(item);
    }
    setBatchCases((current) => [...current, ...added]); setBatchProgress(""); setBatchBusy(false); setBatchReading(false);
    if (batchFileInput.current) batchFileInput.current.value = "";
  }

  async function reviewBatch() {
    if (busy || batchBusy) return;
    if (!apiKey || !apiUrl || !model) { setKeyDialogOpen(true); setKeyStatus("请先填写 API 地址、模型名称和 API Key 并测试连接，再开始批量评审。"); return; }
    const pending = batchCases.filter((item) => item.text && !item.result && item.status !== "正在评审" && (item.template?.status === "符合模板" || item.templateOverride));
    if (!pending.length) return;
    if (!window.confirm(`第一步模板核对后，${pending.length} 份进入 AI 评分。每份都会发送正文、类别和评分要点至你配置的模型服务，并消耗模型额度。是否继续？`)) return;
    stopBatch.current = false;
    setBatchBusy(true);
    let finished = 0;
    let succeeded = 0;
    let failed = 0;
    let stoppedForLimit = false;
    for (const item of pending) {
      if (stopBatch.current) break;
      const batchRubric = RUBRICS[item.category];
      setBatchCases((current) => current.map((entry) => entry.id === item.id ? { ...entry, status: "正在评审", error: "" } : entry));
      setBatchProgress(`正在评审 ${finished + 1}/${pending.length}：${item.name}`);
      try {
        const data = await requestWithRetry(() => fetch(`${REVIEW_API_BASE_URL}/api/score`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` }, body: JSON.stringify({ apiUrl, model, maxOutputTokens, category: batchRubric.name, text: item.text, rubric: batchRubric.rows.map(({ name, weight, points }) => ({ name, weight, points })) }) }), (seconds, attempt) => setBatchProgress(`${item.name}：等待${seconds}秒后重试（${attempt}/2），其他案例尚未发送。`));
        const byName = Object.fromEntries(data.results.map((row) => [row.indicator, row]));
        const results = batchRubric.rows.map((row) => ({ ...byName[row.name], max: row.weight }));
        const result = { ...data, results, total: results.reduce((sum, row) => sum + (Number(row.score) || 0), 0) };
        setBatchCases((current) => current.map((entry) => entry.id === item.id ? { ...entry, status: "评分完成·待复核", result } : entry));
        succeeded += 1;
      } catch (error) {
        failed += 1;
        setBatchCases((current) => current.map((entry) => entry.id === item.id ? { ...entry, status: "评审失败", error: error.message || "评分失败" } : entry));
        if ([429, 402, 401].includes(error.status)) stoppedForLimit = true;
      }
      finished += 1;
      if (stoppedForLimit || stopBatch.current) break;
      if (finished < pending.length) { setBatchProgress(`已完成${finished}/${pending.length}，等待${requestInterval}秒后处理下一份…`); await wait(requestInterval); }
    }
    setBatchProgress(`本批已处理 ${finished}/${pending.length} 份：成功 ${succeeded} 份，失败 ${failed} 份。${stoppedForLimit ? "服务商限制或权限错误，已暂停剩余案例；请根据该案例错误提示处理后继续。" : stopBatch.current ? "已暂停；再次开始将跳过已完成案例。" : "请人工复核分数、理由与引用。"}`); setBatchBusy(false);
  }

  function exportBatchExcel() {
    if (!batchCases.length) return;
    const summary = [["序号", "案例文件", "案例类别", "模板核对", "模板问题", "AI总分", "初筛建议", "模型", "综合评语", "处理状态", "本批筛出比例", "排名是否最终", "原始模板核对"]];
    const details = [["案例文件", "案例类别", "评价指标", "满分", "AI建议分", "评分理由", "正文引文"]];
    batchCases.forEach((item, index) => {
      const itemRubric = RUBRICS[item.category];
      const decision = screeningDecision(item, ranking);
      summary.push([index + 1, item.name, itemRubric.name, effectiveTemplate(item), item.template?.reasons.join("；") || "", item.result?.total ?? "", decision, item.result?.model || "", item.result?.overallComment || "", item.status, `${screenPercentage}%`, ranking.complete ? "是" : "暂定（评分未完成）", item.template?.status || "未核对"]);
      for (const result of item.result?.results || []) details.push([item.name, itemRubric.name, result.indicator, result.max, result.score, result.rationale, result.evidence]);
    });
    const contentTypes = `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`;
    const rootRels = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
    const workbook = `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="评审汇总" sheetId="1" r:id="rId1"/><sheet name="逐项评分" sheetId="2" r:id="rId2"/></sheets></workbook>`;
    const bookRels = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>`;
    const blob = zipStore([["[Content_Types].xml", contentTypes], ["_rels/.rels", rootRels], ["xl/workbook.xml", workbook], ["xl/_rels/workbook.xml.rels", bookRels], ["xl/worksheets/sheet1.xml", sheetXml(summary)], ["xl/worksheets/sheet2.xml", sheetXml(details)]]);
    const link = document.createElement("a"); const url = URL.createObjectURL(blob); link.href = url; link.download = `AI案例批量评审_${new Date().toISOString().slice(0, 10)}.xlsx`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportTemplateFailures() {
    const failures = templateFailures(batchCases);
    if (!failures.length) return;
    const rows = [["序号", "案例文件", "核对类别", "模板核对结果", "不符合原因", "人工确认继续评分"]];
    failures.forEach((item, index) => rows.push([index + 1, item.name, RUBRICS[item.category].name, item.template.status, item.template.reasons.join("；"), item.templateOverride ? "是" : "否"]));
    const contentTypes = `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`;
    const rootRels = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
    const workbook = `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="模板不符合" sheetId="1" r:id="rId1"/></sheets></workbook>`;
    const bookRels = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`;
    const blob = zipStore([["[Content_Types].xml", contentTypes], ["_rels/.rels", rootRels], ["xl/workbook.xml", workbook], ["xl/_rels/workbook.xml.rels", bookRels], ["xl/worksheets/sheet1.xml", sheetXml(rows)]]);
    const link = document.createElement("a"); const url = URL.createObjectURL(blob); link.href = url; link.download = `案例模板不符合名单_${new Date().toISOString().slice(0, 10)}.xlsx`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function fetchModels() {
    if (!apiUrlDraft.trim() || !keyDraft.trim()) { setKeyStatus("请先填写接口地址和API Key。"); return; }
    setModelLoading(true); setKeyStatus("正在获取模型列表…");
    try {
      const response = await fetch(`${REVIEW_API_BASE_URL}/api/models`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${keyDraft.trim()}` }, body: JSON.stringify({ apiUrl: apiUrlDraft.trim() }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "无法获取模型列表，可手动填写模型ID。");
      setAvailableModels(data.models); setKeyStatus(`获取到${data.models.length}个模型，请选择并测试连接。模型列表不保证全部有调用权限。`);
    } catch (error) { setAvailableModels([]); setKeyStatus(error.message); }
    finally { setModelLoading(false); }
  }

  async function exportBatchWord() {
    setReportBusy(true);
    try {
      const { createReviewReport } = await import("./reportDocument.js");
      const blob = await createReviewReport(batchCases, ranking, screenPercentage);
      const url = URL.createObjectURL(blob), link = document.createElement("a");
      link.href = url; link.download = `案例批量初审完整报告_${new Date().toISOString().slice(0, 10)}.docx`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { console.error("Report generation failed", error); setBatchProgress("Word报告生成失败，请重试或先导出Excel保留结果。"); }
    finally { setReportBusy(false); }
  }

  function clearApiKey() {
    for (const key of ["review-api-key", "review-api-url", "review-model", "review-output-budget"]) sessionStorage.removeItem(key);
    setApiKey(""); setKeyDraft(""); setApiUrl(""); setModel(""); setApiUrlDraft(""); setModelDraft(""); setKeyConnected(false); setKeyStatus("已清除本次浏览器会话中保存的模型配置。");
  }

  function saveReview() {
    const record = { title: doc.title, fileName: doc.fileName, category: rubric.name, total, filledCount: assigned, rowCount: rubric.rows.length, scores: { ...scores }, comment, savedAt: new Date().toLocaleString("zh-CN"), demo: doc.demo };
    setHistory((items) => [record, ...items]);
    setNotice("评审草稿已保存在本页面会话中。");
  }

  function exportReview() {
    const payload = { caseTitle: doc.title, category: rubric.name, rubric: rubric.rows.map((row) => ({ indicator: row.name, maxScore: row.weight, score: scores[row.name] === "" ? null : Number(scores[row.name]), evidence: aiReview?.byName[row.name]?.evidence || makeEvidence(doc.text, row, doc.demo), aiRationale: aiReview?.byName[row.name]?.rationale || "", standard: row.points })), totalScore: assigned ? total : null, reviewerComment: comment, model: aiReview?.model || null, aiReviewedAt: aiReview?.reviewedAt || null, exportedAt: new Date().toISOString(), status: aiReview ? "AI初审建议；需人工复核" : "人工评审记录" };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `${doc.title || "案例评审"}-评审记录.json`; anchor.click(); URL.revokeObjectURL(url);
  }

  return (
    <div className="app-shell" style={{ "--campus-background-image": `url("${import.meta.env.BASE_URL}assets/campus-background.jpg")` }}>
      <header className="topbar">
        <div className="brand">
          <img src={`${import.meta.env.BASE_URL}assets/school-emblem.png`} alt="华东师范大学校徽" />
          <div><strong>第四届中小学教师AI创新教学案例大赛</strong><span>案例评审系统</span></div>
        </div>
        <nav className="main-nav" aria-label="主导航">
          <button className={view === "review" ? "active" : ""} onClick={() => setView("review")}>评审工作台</button>
          <button className={view === "batch" ? "active" : ""} onClick={() => setView("batch")}>批量评审</button>
          <button className={view === "history" ? "active" : ""} onClick={() => setView("history")}>评审记录</button>
          <button className={view === "standards" ? "active" : ""} onClick={() => setView("standards")}>评分标准</button>
        </nav>
        <button className="top-meta settings-button" disabled={busy || batchBusy} onClick={() => { setKeyDraft(apiKey); setApiUrlDraft(apiUrl); setModelDraft(model); setKeyStatus(""); setKeyDialogOpen(true); }}><span className={`key-indicator ${apiKey && apiUrl && model ? "ready" : ""}`} />{apiKey && apiUrl && model ? "模型已配置" : "模型设置 · 配置 API"}</button>
      </header>

      {view === "batch" && <main className="secondary-view batch-view">
        <div className="page-heading"><div><p className="eyebrow">BATCH CASE REVIEW / 批量初审</p><h1>AI案例批量评审</h1><p className="subheading">先核对模板，再逐份评分；按本批总分排名生成可调整的筛出建议。</p></div><div className="heading-actions"><input ref={batchFileInput} type="file" accept=".doc,.docx,.pdf" multiple hidden onChange={(event) => addBatchFiles(event.target.files)} /><button className="button primary" disabled={busy || batchBusy} onClick={() => batchFileInput.current?.click()}>批量上传文档</button></div></div>
        <div className="batch-category-setting"><label htmlFor="batch-declared-category">本次上传案例的申报类别</label><select id="batch-declared-category" value={batchDeclaredCategory} disabled={batchBusy} onChange={(event) => setBatchDeclaredCategory(Number(event.target.value))}><option value={0}>未知 · 按文档标题识别</option>{Object.entries(RUBRICS).map(([id, item]) => <option key={id} value={id}>{id}. {item.name}</option>)}</select><span>如果知道申报类别，请在上传前选择；这样才能识别错用其他类别模板的案例。此设置只影响之后上传的文件。</span></div>
        {batchProgress && <div className="notice batch-notice" role="status">{batchProgress}</div>}
        <div className="batch-category-setting"><label htmlFor="screen-percentage">评分阶段筛出比例</label><input id="screen-percentage" type="number" min="0" max="100" value={screenPercentage} onChange={(e) => setScreenPercentage(Math.min(100, Math.max(0, Number(e.target.value))))} /><span>% · 分数从低到高排名，同分分界待人工确认。</span><label htmlFor="request-interval">请求间隔</label><input id="request-interval" type="number" min="5" max="120" value={requestInterval} disabled={batchBusy} onChange={(e) => setRequestInterval(Math.min(120, Math.max(5, Number(e.target.value))))} /><span>秒 · 逐份处理</span></div>
        {batchCases.length > 0 && <div className="notice batch-notice" role="status">第一步模板不符 {failures.length} 份；第二步已评分 {scoredCount}/{ranking.eligible} 份，按 {screenPercentage}% 目标约筛 {ranking.target} 份，当前排名建议筛出 {ranking.excluded} 份。{ranking.tied ? "分界同分案例待人工确认。" : ""}{!ranking.complete ? "评分未全部完成，排名为暂定结果。" : ""}</div>}
        <section className="batch-panel panel">
          <div className="batch-toolbar"><div><span className="panel-kicker">案例队列</span><h2>本批案例 <span className="count">{batchCases.length} 份</span></h2><p>上传后立即完成框架核对，导出模板不符名单无需 API。AI 评分另需配置模型；建议分批处理并及时导出。</p></div><div className="heading-actions"><button className="button quiet" disabled={!batchCases.length || batchBusy} onClick={() => setBatchCases([])}>清空列表</button><button className="button quiet" disabled={!failures.length} onClick={exportTemplateFailures}>导出模板不符名单</button><button className="button quiet" disabled={!batchCases.length} onClick={exportBatchExcel}>导出 Excel</button><button className="button quiet" disabled={!batchCases.length || reportBusy} onClick={exportBatchWord}>{reportBusy ? "生成报告…" : "导出完整Word报告"}</button>{batchBusy && !batchReading && <button className="button quiet" onClick={() => { stopBatch.current = true; setBatchProgress("将在当前案例处理完后暂停。"); }}>暂停评分</button>}<button className="button ai-button" disabled={busy || batchBusy || !batchCases.some((item) => item.text && !item.result && (item.template?.status === "符合模板" || item.templateOverride))} onClick={reviewBatch}>{batchBusy ? batchReading ? "正在读取…" : "正在 AI 评分…" : "开始 AI 评分"}</button></div></div>
          {!batchCases.length ? <div className="empty-state"><h2>上传案例文档</h2><p>支持DOC、DOCX和有文字层的PDF；扫描PDF请先OCR。正文将用于评分，不会保存在服务端。</p><button className="button primary" onClick={() => batchFileInput.current?.click()}>选择多个文件</button></div> : <div className="batch-list"><div className="batch-row batch-header"><span>案例文件</span><span>案例类别</span><span>状态</span><span>建议总分</span><span>操作</span></div>{orderedCases.map((item) => <article className="batch-row" key={item.id}><div className="batch-name"><strong title={item.name}>{item.name}</strong>{item.error && <small>{item.error}</small>}{item.template && <small>模板：{effectiveTemplate(item)}{item.template.reasons.length ? ` · ${item.template.reasons.join("；")}` : ""}</small>}</div><select aria-label={`${item.name}案例类别`} value={item.category} disabled={batchBusy || Boolean(item.result)} onChange={(event) => setBatchCases((current) => current.map((entry) => { if (entry.id !== item.id) return entry; const nextCategory = Number(event.target.value); const template = checkTemplate(entry.text, nextCategory); return { ...entry, category: nextCategory, template, templateOverride: false, status: template.status === "符合模板" ? "待评分" : "待核对模板" }; }))}>{Object.entries(RUBRICS).map(([id, itemRubric]) => <option key={id} value={id}>{id}. {itemRubric.name}</option>)}</select><span className={`batch-status ${item.result ? "done" : item.status === "评审失败" || item.status === "读取失败" ? "error" : ""}`}>{item.result ? screeningDecision(item, ranking) : item.status}</span><strong className="batch-score">{item.result ? `${item.result.total} / 100` : "—"}</strong><div className="batch-actions">{item.text && item.template?.status !== "符合模板" && <button className="text-button" disabled={batchBusy} onClick={() => setBatchCases((current) => current.map((entry) => entry.id === item.id ? { ...entry, templateOverride: !entry.templateOverride, status: entry.result ? "评分完成·待复核" : entry.templateOverride ? "待核对模板" : "人工确认·待评分" } : entry))}>{item.templateOverride ? "撤销确认" : "人工确认继续"}</button>}{item.text && <button className="text-button" disabled={batchBusy} onClick={() => { setCategory(item.category); setDoc({ title: item.name.replace(/\.(docx?|pdf)$/i, ""), fileName: item.name, text: item.text, sourceFile: item.sourceFile, demo: false, batchId: item.id }); setSingleTemplateOverride(item.templateOverride); setScores(item.result ? Object.fromEntries(item.result.results.map((row) => [row.indicator, row.score])) : {}); setAiReview(item.result ? { ...item.result, byName: Object.fromEntries(item.result.results.map((row) => [row.indicator, row])), reviewedAt: "批量评审结果" } : null); setComment(item.result?.overallComment || ""); setView("review"); }}>查看详情</button>}<button className="text-button remove-case" disabled={batchBusy} onClick={() => setBatchCases((current) => current.filter((entry) => entry.id !== item.id))}>移除</button></div></article>)}</div>}
          {batchCases.length > 0 && <p className="batch-footnote">Excel 包含全部案例的模板核对、评分与初筛建议，以及已评分案例的逐项依据。筛出建议须人工复核。</p>}
        </section>
      </main>}

      {view === "review" && <>
        <div className="page-heading">
          <div><p className="eyebrow">CASE REVIEW / 评审工作台</p><h1>案例初审与评分</h1><p className="subheading">依据大赛评审标准逐项查看材料与证据，形成可复核的评分记录。</p></div>
          <div className="heading-actions"><button className="button quiet" disabled={busy || batchBusy} onClick={() => fileInput.current?.click()}>更换案例文档</button><input ref={fileInput} type="file" accept=".doc,.docx,.pdf" hidden onChange={(e) => loadFile(e.target.files?.[0])} /></div>
        </div>
        {templateResult && <div className="notice" role="status">第一步 · 模板核对：{singleTemplateOverride ? "符合模板（人工确认）" : templateResult.status}。{templateResult.reasons.length ? templateResult.reasons.join("；") : "已检出对应模板的主要栏目。"} 模板判断基于提取文字，需结合原始 Word 复核。</div>}
        {(notice || busy) && <div className="notice" role="status">{busy ? notice || "正在处理，请等待…" : notice}</div>}
        <div className="workspace">
          <section className="document-panel panel">
            <div className="panel-head doc-head"><div><span className="panel-kicker">案例材料</span><h2 title={doc.title}>{doc.title}</h2><p className="file-meta">{doc.fileName} <span>·</span> {doc.demo ? "示例内容，非真实参赛案例" : `${doc.text.length.toLocaleString()} 字符已提取`}</p></div><button className="text-button" disabled={busy || batchBusy} onClick={() => fileInput.current?.click()}>上传文档</button></div>
            <div className="doc-toolbar"><div className="doc-tabs"><button className={documentView === "document" ? "selected" : ""} onClick={() => setDocumentView("document")}>文字解析</button><button className={documentView === "word" ? "selected" : ""} onClick={() => setDocumentView("word")}>原始文档</button><button className={documentView === "evidence" ? "selected" : ""} onClick={() => setDocumentView("evidence")}>证据定位</button></div><span className="doc-page">{documentView === "document" ? "正文文字视图" : documentView === "word" ? "原始页面预览" : `${rubric.rows.length} 项评审依据`}</span></div>
            {documentView === "word" ? <OriginalDocumentPreview file={doc.sourceFile} /> : documentView === "document" ? <article className="document-body">
              {doc.text.split(/\n+/).filter(Boolean).map((paragraph, index) => {
                const heading = /^(一、|二、|三、|四、|五、|\d+[.、])/.test(paragraph);
                return heading ? <h3 key={index}>{paragraph}</h3> : <p key={index}>{paragraph}</p>;
              })}
            </article> : <div className="evidence-list">{rubric.rows.map((row, index) => <article className="evidence-item" key={row.name}><div><span>0{index + 1} · {row.name}</span><p>{makeEvidence(doc.text, row, doc.demo)}</p></div><small>{doc.demo ? "示例文本定位" : "关键词辅助定位"}</small></article>)}</div>}
            <div className="doc-foot"><span>{documentView === "word" ? "原始文档预览" : "文档正文解析"}</span><span>{documentView === "word" ? "DOCX和PDF在浏览器预览；旧版DOC需下载核对" : "图片、视频与版式内容需人工检查"}</span></div>
          </section>

          <section className="review-panel panel">
            <div className="review-title"><div><span className="panel-kicker">评审与打分</span><h2>选择案例类别</h2></div><span className="review-state">初审建议 · 人工复核</span></div>
            <div className="category-grid" role="group" aria-label="选择案例类别">
              {Object.entries(RUBRICS).map(([id, item]) => <button key={id} className={`category-option ${Number(id) === category ? "chosen" : ""}`} onClick={() => switchCategory(Number(id))} disabled={busy || batchBusy} aria-pressed={Number(id) === category}><span className="category-no">0{id}</span><strong>{item.short}</strong><small>{item.name}</small></button>)}
            </div>
            <div className="category-note"><strong>当前标准</strong><span>{rubric.name} · {rubric.rows.map((row) => `${row.name} ${row.weight}%`).join(" / ")}</span></div>
            <div className="rubric-caption"><div><span className="panel-kicker">评分指标与依据</span><p>{rubric.intro}</p></div><span className="weights-total">权重合计 <b>{rubric.rows.reduce((s, row) => s + row.weight, 0)}%</b></span></div>
            <div className="rubric-table">
              <div className="rubric-header"><span>评价指标</span><span>权重</span><span>演示建议</span><span>您的评分</span><span>文档证据</span></div>
              {rubric.rows.map((row, index) => <details className="rubric-row" key={`${category}-${row.name}`} open={index === 0}>
                <summary className="rubric-summary">
                  <span className="indicator-name"><i>{String(index + 1).padStart(2, "0")}</i>{row.name}</span>
                  <span className="weight">{row.weight}<small>分</small></span>
                  <span className="suggestion">{aiReview?.byName[row.name] ? <><b>{aiReview.byName[row.name].score}</b><small>/ {row.weight}</small></> : doc.demo ? <><b>{row.sample}</b><small>/ {row.weight}</small></> : <><b className="pending-score">待评分</b><small>—</small></>}</span>
                  <span className="score-input-wrap" onClick={(e) => e.stopPropagation()}><input aria-label={`${row.name}人工评分`} type="number" min="0" max={row.weight} step="1" value={scores[row.name] ?? ""} placeholder="—" onChange={(e) => setScores((prev) => ({ ...prev, [row.name]: e.target.value === "" ? "" : Math.min(row.weight, Math.max(0, Number(e.target.value))) }))} /><small>/ {row.weight}</small></span>
                  <span className="evidence-link">展开依据</span>
                </summary>
                <div className="rubric-detail"><div className="points"><b>评审要点</b><ul>{row.points.map((point) => <li key={point}>{point}</li>)}</ul></div><div className="evidence"><b>{aiReview?.byName[row.name] ? "AI评分理由与原文依据" : "文档证据摘录"}</b><p>{aiReview?.byName[row.name]?.rationale || makeEvidence(doc.text, row, doc.demo)}</p>{aiReview?.byName[row.name]?.evidence && <blockquote>{aiReview.byName[row.name].evidence}</blockquote>}<small>{aiReview ? "AI 初审建议 · 请逐项核对" : doc.demo ? "示例文本定位 · 请核对" : "基于正文关键词的辅助定位 · 需人工核对"}</small></div></div>
              </details>)}
            </div>
            <div className="model-note"><b>{aiReview ? "AI初审已完成" : "初审与数据说明"}</b><span>{aiReview ? `${aiReview.model} · ${aiReview.reviewedAt}。建议分、理由与引用均需对照案例原文复核。` : "使用你配置的模型生成建议分。评分会消耗服务商额度；案例正文将在你确认后发送至所选 API 地址。"}</span></div>
            <label className="comment-label" htmlFor="review-comment">综合评语 <span>选填</span></label>
            <textarea id="review-comment" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="记录整体判断、需要补充的材料或复核意见…" rows="2" />
            <div className="score-footer"><div className="total-score"><span>当前总分</span><b>{assigned ? total : "—"}<small>/ 100</small></b><em>{assigned}/{rubric.rows.length} 项已填写</em></div><div className="footer-actions"><button className="button ai-button" disabled={busy || batchBusy} onClick={() => apiKey && apiUrl && model ? setConsentOpen(true) : setKeyDialogOpen(true)}>{busy ? "AI 正在初审…" : "AI 初审"}</button><button className="button quiet" onClick={saveReview}>保存草稿</button><button className="button primary" onClick={exportReview}>导出评审记录</button></div></div>
          </section>
        </div>
        <footer className="page-footer"><span>评审建议用于辅助核对；最终意见由评审专家确认。</span><span>华东师范大学 · 第四届中小学教师AI创新教学案例大赛</span></footer>
      </>}

      {keyDialogOpen && <div className="consent-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setKeyDialogOpen(false); }}><section className="consent-dialog key-dialog" role="dialog" aria-modal="true" aria-labelledby="key-title"><span className="panel-kicker">MODEL CONNECTION / 模型连接</span><h2 id="key-title">配置模型 API</h2><p>支持OpenAI兼容的Chat Completions和Responses接口，按地址自动识别。输入服务商提供的完整 HTTPS 接口地址、模型名称和 API Key。配置仅保存在当前浏览器会话；评分时通过本系统服务端转发至所选 API 地址。</p><label className="comment-label" htmlFor="api-url-input">API 地址（/chat/completions 或 /responses）</label><input id="api-url-input" className="api-key-input" type="url" autoComplete="url" spellCheck="false" value={apiUrlDraft} onChange={(event) => { setApiUrlDraft(event.target.value); setAvailableModels([]); setKeyConnected(false); setKeyStatus(""); }} placeholder="https://api.example.com/v1/chat/completions" /><button className="button quiet model-fetch" disabled={modelLoading || keyTesting} onClick={fetchModels}>{modelLoading ? "获取中…" : "自动获取可用模型"}</button>{availableModels.length > 0 && <select className="api-key-input" aria-label="选择可用模型" value={availableModels.includes(modelDraft) ? modelDraft : ""} onChange={(e) => { setModelDraft(e.target.value); setKeyConnected(false); }}><option value="">请选择模型</option>{availableModels.map((id) => <option key={id} value={id}>{id}</option>)}</select>}<label className="comment-label api-field-label" htmlFor="model-input">模型名称</label><input id="model-input" className="api-key-input" type="text" autoComplete="off" spellCheck="false" value={modelDraft} onChange={(event) => { setModelDraft(event.target.value); setKeyConnected(false); setKeyStatus(""); }} placeholder="填写服务商提供的 model ID" /><label className="comment-label api-field-label" htmlFor="api-key-input">API Key</label><input id="api-key-input" className="api-key-input" type="password" autoComplete="off" spellCheck="false" value={keyDraft} onChange={(event) => { setKeyDraft(event.target.value); setAvailableModels([]); setKeyConnected(false); setKeyStatus(""); }} placeholder="粘贴你的 API Key" /><label className="comment-label api-field-label" htmlFor="output-budget">最大输出预算（含推理用量）</label><input id="output-budget" className="api-key-input" type="number" min="1024" max="32768" step="1024" value={maxOutputTokens} onChange={(e) => setMaxOutputTokens(Number(e.target.value))} /><div className={`key-status ${keyConnected ? "success" : ""}`} role="status">{keyStatus || (apiKey ? `已保存模型配置：${model}（Key 不显示）。` : "尚未配置模型 API。")}</div><p className="key-cost-note">模型列表由服务商接口提供，不支持时可手动填写。连接测试及自动重试会消耗模型额度；评分截断时最多增加预算重试一次。系统仅接受公开 HTTPS 服务地址，禁止本机及内部网络地址。不要在公共或共享电脑上保存个人 Key。</p><div className="consent-actions key-actions">{apiKey && <button className="button quiet" onClick={clearApiKey}>清除</button>}<button className="button quiet" onClick={() => setKeyDialogOpen(false)}>关闭</button><button className="button primary" disabled={keyTesting} onClick={testAndSaveKey}>{keyTesting ? "正在测试…" : "测试连接并保存"}</button></div></section></div>}
      {consentOpen && <div className="consent-overlay" role="presentation"><section className="consent-dialog" role="dialog" aria-modal="true" aria-labelledby="consent-title"><span className="panel-kicker">MODEL REVIEW / AI 初审</span><h2 id="consent-title">开始 AI 初审？</h2><p>系统将把当前案例正文、所选类别和对应评分要点发送到你配置的模型服务，生成逐项评分建议、理由及原文引用。</p><p>模型调用会消耗你的服务商额度。AI 建议仅供参考，最终评分由评审员确认。</p><div className="consent-case"><span>案例</span><strong>{doc.title}</strong><span>类别</span><strong>{rubric.name}</strong></div><div className="consent-actions"><button className="button quiet" onClick={() => setConsentOpen(false)}>取消</button><button className="button primary" onClick={runAIReview}>确认发送并初审</button></div></section></div>}

      {view === "standards" && <main className="secondary-view"><div className="page-heading"><div><p className="eyebrow">RUBRIC / 评审依据</p><h1>四类案例评分标准</h1><p className="subheading">各项指标依据2026年10月7日提供的新版三份评审标准文档，AI 初审与人工评审使用同一套要点。</p></div><button className="button primary" onClick={() => setView("review")}>返回评审</button></div><div className="standards-grid">{Object.entries(RUBRICS).map(([id, item]) => <section className="standard-card panel" key={id}><div className="standard-top"><span>类别 0{id}</span><strong>{item.rows.reduce((s, row) => s + row.weight, 0)}<small>%</small></strong></div><h2>{item.name}</h2><p>{item.intro}</p>{item.rows.map((row) => <section className="standard-row" key={row.name}><div className="standard-row-heading"><strong>{row.name}</strong><b>{row.weight}%</b></div><ol>{row.points.map((point) => <li key={point}>{point}</li>)}</ol></section>)}</section>)}</div></main>}

      {view === "history" && <main className="secondary-view"><div className="page-heading"><div><p className="eyebrow">REVIEW LOG / 本地会话</p><h1>评审记录</h1><p className="subheading">当前原型仅在本次页面会话中保留草稿，不会上传或持久化保存。</p></div><button className="button quiet" onClick={() => setView("review")}>返回评审</button></div><section className="history-panel panel">{history.length === 0 ? <div className="empty-state"><h2>还没有保存的评审草稿</h2><p>在评审工作台保存后，记录会显示在这里。</p><button className="button primary" onClick={() => setView("review")}>开始评审</button></div> : history.map((item, index) => <article className="history-item" key={`${item.savedAt}-${index}`}><div><strong>{item.title}</strong><p>{item.category} · {item.fileName} · {item.savedAt} · {item.filledCount}/{item.rowCount} 项已填写</p></div><b>{item.filledCount ? item.total : "—"}<small> / 100</small></b></article>)}</section></main>}
    </div>
  );
}

export { App };
