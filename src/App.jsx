import { useMemo, useRef, useState } from "react";

const REVIEW_API_BASE_URL = (import.meta.env.VITE_REVIEW_API_BASE_URL || "").replace(/\/+$/, "");

const RUBRICS = {
  1: {
    name: "AI赋能教学案例",
    short: "AI赋能教学",
    intro: "关注人工智能如何优化教师教学设计与课堂实施。",
    rows: [
      { name: "规范性", weight: 10, points: ["材料齐全，文本结构清晰，重点突出，不存在意识形态问题。", "视频画面稳定清楚，声画同步，讲解简洁流畅、详略得当。", "AI使用遵循规范，并说明技术选用依据，符合伦理要求。"], sample: 8 },
      { name: "教学设计", weight: 25, points: ["教学目标符合课程标准，指向学生核心素养。", "教学主题明确，符合学生发展水平，贴合学生生活、兴趣和需要。", "借助人工智能技术优化教学设计、创设教学情境、广泛发掘教学资源、开展教学评价等，破解教学重难点。", "方案体现以学生发展为中心的理念，促进教学目标的实现及核心素养的落实。"], sample: 20 },
      { name: "教学实施", weight: 30, points: ["清晰、准确、有条理地阐释教学内容，并根据课堂情况进行有效调整，突破难点，展现教师的教学机智与教学风格。", "借助人工智能技术为学生提供了个性化资源、学习体验与实施反馈，有效突破教学重难点，促进学生深度学习。", "有意识地培养学生恰当使用人工智能的意识与方法。", "教学过程与技术使用均非常流畅，能熟练处理人工智能在教学中可能出现的技术故障和安全问题。", "将正确的情感态度和价值观渗透到课堂教学中。"], sample: 24 },
      { name: "教学效果", weight: 25, points: ["学生的课堂参与度高，教学目标达成度高。", "建立合理的评估方法和指标，有效评估学生学习成果和教学效果。", "师生关系融洽和谐，学习氛围民主平等、积极向上。", "学生能辩证地看待和运用人工智能产品。（如若课堂中未有学生使用AI工具的环节，则该指标可忽略）"], sample: 19 },
      { name: "教学创新", weight: 10, points: ["在教学内容、教学方法、教学模式、AI应用等方面有创新，具有示范、推广价值。"], sample: 8 },
    ],
  },
  2: {
    name: "AI支持学生学习案例",
    short: "AI支持学习",
    intro: "关注学生使用人工智能开展自主、合作与探究学习的过程。",
    rows: [
      { name: "规范性", weight: 10, points: ["材料齐全，文本结构清晰，重点突出，不存在意识形态问题。", "视频画面稳定清楚，声画同步，讲解简洁流畅、详略得当。", "使用人工智能相关技术时遵循规范，并说明技术来源与使用依据，符合伦理要求。"], sample: 8 },
      { name: "教学设计", weight: 25, points: ["教学目标符合课程标准，指向学生核心素养。", "教学主题明确，符合学生发展水平，贴合学生生活、兴趣和需要。", "学习活动以学生为中心展开，强调学生充分利用AI技术工具开展自主、合作、探究学习。", "学习任务具体合理，具有现实意义和挑战性，支持学生在完成任务的过程中深化对相关知识、方法的理解与运用。", "提供了与主题密切相关的资源、支架等学习支持，帮助学生有效开展学习。", "学习评价指向学习目标，设计清晰合理，可操作性强。"], sample: 20 },
      { name: "教学实施", weight: 30, points: ["教师清晰地介绍学习任务、评价标准和活动安排，并确认学生理解。", "学生有序且高效地运用相关资源和工具开展学习，AI工具在学生学习过程中发挥重要的支撑作用。", "教师及时了解学生学习进展，给予针对性指导，必要时根据学生情况调整活动安排。", "教学过程与技术使用均非常流畅，师生能够熟练运用AI工具，灵活处理学习过程中的技术问题和安全问题。", "将正确的情感态度和价值观渗透到课堂教学中。"], sample: 23 },
      { name: "教学效果", weight: 25, points: ["学生的课堂参与度高，教学目标达成度高。", "学习成果体现了学生的批判性思考或创造性的解决方案，以及对AI技术工具的辩证理解与有效运用。", "师生关系融洽和谐，学习氛围民主平等、积极向上。"], sample: 19 },
      { name: "教学创新", weight: 10, points: ["在教学内容、教学方法、教学模式等方面有创新，具有示范推广价值。"], sample: 8 },
    ],
  },
  3: {
    name: "智能体开发与应用案例",
    short: "智能体开发",
    intro: "关注真实需求、智能体设计实现及应用成效证据。",
    rows: [
      { name: "规范性", weight: 10, points: ["材料齐全，文本结构清晰，重点突出，不存在意识形态问题。", "智能体功能说明清晰，操作指引明确，评审者可顺利体验智能体核心功能。", "AI使用遵循规范，符合伦理要求，注意数据安全与隐私保护，对智能体输出内容的可靠性有必要的提示与约束。"], sample: 8 },
      { name: "需求分析与方案设计", weight: 20, points: ["需求分析准确深入，清晰识别教学、评价、教研或日常管理等工作中的真实痛点与难点，问题具有普遍性或代表性。", "功能定位合理，与需求高度匹配，目标明确可衡量。", "方案设计思路清晰，技术路线可行，体现对智能体能力边界的合理认知与预期。"], sample: 15 },
      { name: "开发实现", weight: 30, points: ["智能体核心提示词设计规范、专业，角色定位、任务指令、约束条件等要素完整，能有效引导智能体稳定输出高质量结果。", "扩展功能（如知识库、插件、工作流等，如有）设计合理，与核心功能协同配合，提升智能体整体能力。", "开发过程体现迭代优化意识，对遇到的问题有深入分析并有效解决。", "智能体输出结果质量稳定、准确可靠，符合相关工作的专业要求。"], sample: 23 },
      { name: "应用成效", weight: 25, points: ["应用场景真实，应用过程描述详实，人机协作方式合理高效。", "智能体在实际应用中有效解决或缓解了所识别的痛点难点，切实体现“减负提质”的效果。", "应用成效有具体数据或事实支撑，如工作效率提升、结果质量改善、难点突破等。", "对智能体输出结果有批判性审视，能识别并说明其局限性与适用边界。"], sample: 19 },
      { name: "创新与可推广性", weight: 15, points: ["在需求洞察、功能设计、技术实现或应用模式等方面有创新，不同于常见通用方案。", "智能体具有较好的可迁移性和适应性，能推广至不同群体、不同领域或不同地域的应用场景。", "开发与应用经验具有参考价值，能为其他教师开发和应用智能体提供借鉴。"], sample: 11 },
    ],
  },
  4: {
    name: "教师智能素养提升组织实施案例",
    short: "组织实施",
    intro: "关注立足本地实际的研修设计、实施路径与教师发展成效。",
    rows: [
      { name: "规范性", weight: 15, points: ["案例真实完整，思路清晰，内容聚焦，表述严谨，不存在意识形态问题，符合伦理安全要求。", "视频画面稳定清楚，声画同步，讲解简洁流畅、详略得当。"], sample: 12 },
      { name: "问题与解决思路", weight: 50, points: ["问题具有现实意义，是教师智能素养提升的关键问题。", "立足本地/本校实际，探索、创新教师智能素养提升的研修模式、评价方式、培训团队建设、资源开发模式等。", "以任务为驱动，以成果为导向，对培训、教研、实践、展示进行贯通性设计。", "用图表清晰展示案例模式、方法和策略，所采用的模式、方法和策略可操作、可迁移。"], sample: 39 },
      { name: "成效与创新", weight: 35, points: ["有效推动教师立足岗位开展高质量学习与实践，促进本地区或本单位教师智能素养提升，成果丰富、成效显著，并有数据支持。", "解决思路具有示范推广价值。"], sample: 27 },
    ],
  },
};

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
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchProgress, setBatchProgress] = useState("");
  const rubric = RUBRICS[category];
  const assigned = rubric.rows.filter((row) => scores[row.name] !== "" && scores[row.name] != null).length;
  const total = useMemo(() => rubric.rows.reduce((sum, row) => sum + (Number(scores[row.name]) || 0), 0), [rubric, scores]);

  async function loadFile(file) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".docx")) { setNotice("请上传 .docx 格式的案例文档。"); return; }
    setBusy(true); setNotice("");
    try {
      const text = await readDocx(file);
      setDoc({ title: file.name.replace(/\.docx$/i, ""), fileName: file.name, text, demo: false });
      setDocumentView("document");
      setScores(Object.fromEntries(RUBRICS[category].rows.map((row) => [row.name, ""])));
      setAiReview(null);
      setComment("");
      setNotice("文档已读取。配置模型 API 后即可生成初审建议，需由评审员复核。");
      setView("review");
    } catch (error) { setNotice(error.message || "文档读取失败，请确认文件未损坏。"); }
    finally { setBusy(false); if (fileInput.current) fileInput.current.value = ""; }
  }

  function switchCategory(id) {
    setCategory(id);
    setScores(Object.fromEntries(RUBRICS[id].rows.map((row) => [row.name, doc.demo ? row.sample : ""])));
    setAiReview(null);
    setComment("");
    setNotice("");
  }

  async function runAIReview() {
    if (!apiKey || !apiUrl || !model) { setKeyDialogOpen(true); setNotice("请先在模型设置中填写 API 地址、模型名称和 API Key 并测试连接。"); return; }
    setConsentOpen(false);
    setBusy(true); setNotice("");
    try {
      const response = await fetch(`${REVIEW_API_BASE_URL}/api/score`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          category: rubric.name,
          apiUrl,
          model,
          text: doc.text,
          rubric: rubric.rows.map(({ name, weight, points }) => ({ name, weight, points })),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "AI 初审失败，请稍后重试。");
      const byName = Object.fromEntries(data.results.map((item) => [item.indicator, item]));
      setScores(Object.fromEntries(rubric.rows.map((row) => [row.name, byName[row.name]?.score ?? ""])));
      setAiReview({ ...data, byName, reviewedAt: new Date().toLocaleString("zh-CN") });
      setComment(data.overallComment || "");
      setNotice("AI 初审建议已生成。请逐项核对评分理由与原文证据，再确认最终评分。");
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
      const response = await fetch(`${REVIEW_API_BASE_URL}/api/test-key`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${candidate}` }, body: JSON.stringify({ apiUrl: candidateUrl, model: candidateModel }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "连接测试失败。");
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
    const files = Array.from(fileList || []).filter((file) => file.name.toLowerCase().endsWith(".docx"));
    if (!files.length) { setNotice("请选择 .docx 格式的案例文档。"); return; }
    setBatchBusy(true); setBatchProgress(`正在读取 ${files.length} 份 DOCX 文档…`);
    const added = [];
    for (const file of files) {
      const item = { id: crypto.randomUUID(), name: file.name, category: 1, text: "", status: "读取中", result: null, error: "" };
      try { item.text = await readDocx(file); item.status = "待评审"; }
      catch (error) { item.status = "读取失败"; item.error = error.message || "文档读取失败"; }
      added.push(item);
    }
    setBatchCases((current) => [...current, ...added]); setBatchProgress(""); setBatchBusy(false);
    if (batchFileInput.current) batchFileInput.current.value = "";
  }

  async function reviewBatch() {
    if (!apiKey || !apiUrl || !model) { setKeyDialogOpen(true); setKeyStatus("请先填写 API 地址、模型名称和 API Key 并测试连接，再开始批量评审。"); return; }
    const pending = batchCases.filter((item) => item.text && !item.result && item.status !== "正在评审");
    if (!pending.length) return;
    if (!window.confirm(`即将依次评审 ${pending.length} 份案例。每份案例都会发送正文、类别和评分要点至你配置的模型服务，并消耗你的模型额度。是否继续？`)) return;
    setBatchBusy(true);
    let finished = 0;
    for (const item of pending) {
      const batchRubric = RUBRICS[item.category];
      setBatchCases((current) => current.map((entry) => entry.id === item.id ? { ...entry, status: "正在评审", error: "" } : entry));
      setBatchProgress(`正在评审 ${finished + 1}/${pending.length}：${item.name}`);
      try {
        const response = await fetch(`${REVIEW_API_BASE_URL}/api/score`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` }, body: JSON.stringify({ apiUrl, model, category: batchRubric.name, text: item.text, rubric: batchRubric.rows.map(({ name, weight, points }) => ({ name, weight, points })) }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "AI 初审失败");
        const byName = Object.fromEntries(data.results.map((row) => [row.indicator, row]));
        const results = batchRubric.rows.map((row) => ({ ...byName[row.name], max: row.weight }));
        const result = { ...data, results, total: results.reduce((sum, row) => sum + (Number(row.score) || 0), 0) };
        setBatchCases((current) => current.map((entry) => entry.id === item.id ? { ...entry, status: "待人工复核", result } : entry));
      } catch (error) {
        setBatchCases((current) => current.map((entry) => entry.id === item.id ? { ...entry, status: "评审失败", error: error.message || "评分失败" } : entry));
      }
      finished += 1;
    }
    setBatchProgress(`本批评审完成：${finished} 份；请人工复核分数、理由与引用。`); setBatchBusy(false);
  }

  function exportBatchExcel() {
    const done = batchCases.filter((item) => item.result);
    if (!done.length) return;
    const summary = [["序号", "案例文件", "案例类别", "总分", "模型", "综合评语", "状态"]];
    const details = [["案例文件", "案例类别", "评价指标", "满分", "AI建议分", "评分理由", "正文引文"]];
    done.forEach((item, index) => {
      const itemRubric = RUBRICS[item.category];
      summary.push([index + 1, item.name, itemRubric.name, item.result.total, item.result.model, item.result.overallComment, "AI初审建议 · 待人工复核"]);
      for (const result of item.result.results) details.push([item.name, itemRubric.name, result.indicator, result.max, result.score, result.rationale, result.evidence]);
    });
    const contentTypes = `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`;
    const rootRels = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
    const workbook = `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="评审汇总" sheetId="1" r:id="rId1"/><sheet name="逐项评分" sheetId="2" r:id="rId2"/></sheets></workbook>`;
    const bookRels = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>`;
    const blob = zipStore([["[Content_Types].xml", contentTypes], ["_rels/.rels", rootRels], ["xl/workbook.xml", workbook], ["xl/_rels/workbook.xml.rels", bookRels], ["xl/worksheets/sheet1.xml", sheetXml(summary)], ["xl/worksheets/sheet2.xml", sheetXml(details)]]);
    const link = document.createElement("a"); const url = URL.createObjectURL(blob); link.href = url; link.download = `AI案例批量评审_${new Date().toISOString().slice(0, 10)}.xlsx`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function clearApiKey() {
    for (const key of ["review-api-key", "review-api-url", "review-model"]) sessionStorage.removeItem(key);
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
        <button className="top-meta settings-button" onClick={() => { setKeyDraft(apiKey); setApiUrlDraft(apiUrl); setModelDraft(model); setKeyStatus(""); setKeyDialogOpen(true); }}><span className={`key-indicator ${apiKey && apiUrl && model ? "ready" : ""}`} />{apiKey && apiUrl && model ? "模型已配置" : "模型设置 · 配置 API"}</button>
      </header>

      {view === "batch" && <main className="secondary-view batch-view">
        <div className="page-heading"><div><p className="eyebrow">BATCH CASE REVIEW / 批量初审</p><h1>AI案例批量评审</h1><p className="subheading">批量读取 DOCX 正文，逐份评审并导出 Excel 汇总与逐项依据。</p></div><div className="heading-actions"><input ref={batchFileInput} type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" multiple hidden onChange={(event) => addBatchFiles(event.target.files)} /><button className="button primary" disabled={batchBusy} onClick={() => batchFileInput.current?.click()}>批量上传 DOCX</button></div></div>
        {batchProgress && <div className="notice batch-notice" role="status">{batchProgress}</div>}
        <section className="batch-panel panel">
          <div className="batch-toolbar"><div><span className="panel-kicker">案例队列</span><h2>本批案例 <span className="count">{batchCases.length} 份</span></h2><p>每份案例可单独选择类别；评审按队列逐篇发送。</p></div><div className="heading-actions"><button className="button quiet" disabled={!batchCases.length || batchBusy} onClick={() => setBatchCases([])}>清空列表</button><button className="button quiet" disabled={!batchCases.some((item) => item.result)} onClick={exportBatchExcel}>导出 Excel</button><button className="button ai-button" disabled={batchBusy || !batchCases.some((item) => item.text && !item.result)} onClick={reviewBatch}>{batchBusy ? "正在批量评审…" : "开始批量评审"}</button></div></div>
          {!batchCases.length ? <div className="empty-state"><h2>上传 DOCX 案例文档</h2><p>支持一次选择多份 Word 文档。正文将用于评分，不会保存在服务端。</p><button className="button primary" onClick={() => batchFileInput.current?.click()}>选择多个文件</button></div> : <div className="batch-list"><div className="batch-row batch-header"><span>案例文件</span><span>案例类别</span><span>状态</span><span>建议总分</span><span>操作</span></div>{batchCases.map((item) => <article className="batch-row" key={item.id}><div className="batch-name"><strong title={item.name}>{item.name}</strong>{item.error && <small>{item.error}</small>}</div><select aria-label={`${item.name}案例类别`} value={item.category} disabled={batchBusy || Boolean(item.result)} onChange={(event) => setBatchCases((current) => current.map((entry) => entry.id === item.id ? { ...entry, category: Number(event.target.value) } : entry))}>{Object.entries(RUBRICS).map(([id, itemRubric]) => <option key={id} value={id}>{id}. {itemRubric.name}</option>)}</select><span className={`batch-status ${item.result ? "done" : item.status === "评审失败" || item.status === "读取失败" ? "error" : ""}`}>{item.status}</span><strong className="batch-score">{item.result ? `${item.result.total} / 100` : "—"}</strong><div className="batch-actions">{item.result && <button className="text-button" onClick={() => { setCategory(item.category); setDoc({ title: item.name.replace(/\.docx$/i, ""), fileName: item.name, text: item.text, demo: false }); setScores(Object.fromEntries(item.result.results.map((row) => [row.indicator, row.score]))); setAiReview({ ...item.result, byName: Object.fromEntries(item.result.results.map((row) => [row.indicator, row])), reviewedAt: "批量评审结果" }); setComment(item.result.overallComment || ""); setView("review"); }}>查看详情</button>}<button className="text-button remove-case" disabled={batchBusy} onClick={() => setBatchCases((current) => current.filter((entry) => entry.id !== item.id))}>移除</button></div></article>)}</div>}
          {batchCases.some((item) => item.result) && <p className="batch-footnote">Excel 包含评审汇总与逐项评分两张表；AI分数、理由和引文均为初审建议，需人工复核。</p>}
        </section>
      </main>}

      {view === "review" && <>
        <div className="page-heading">
          <div><p className="eyebrow">CASE REVIEW / 评审工作台</p><h1>案例初审与评分</h1><p className="subheading">依据大赛评审标准逐项查看材料与证据，形成可复核的评分记录。</p></div>
          <div className="heading-actions"><button className="button quiet" onClick={() => fileInput.current?.click()}>更换案例文档</button><input ref={fileInput} type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" hidden onChange={(e) => loadFile(e.target.files?.[0])} /></div>
        </div>
        {(notice || busy) && <div className="notice" role="status">{busy ? "正在读取 DOCX 文档…" : notice}</div>}
        <div className="workspace">
          <section className="document-panel panel">
            <div className="panel-head doc-head"><div><span className="panel-kicker">案例材料</span><h2 title={doc.title}>{doc.title}</h2><p className="file-meta">{doc.fileName} <span>·</span> {doc.demo ? "示例内容，非真实参赛案例" : `${doc.text.length.toLocaleString()} 字符已提取`}</p></div><button className="text-button" onClick={() => fileInput.current?.click()}>上传 DOCX</button></div>
            <div className="doc-toolbar"><div className="doc-tabs"><button className={documentView === "document" ? "selected" : ""} onClick={() => setDocumentView("document")}>文档内容</button><button className={documentView === "evidence" ? "selected" : ""} onClick={() => setDocumentView("evidence")}>证据定位</button></div><span className="doc-page">{documentView === "document" ? "正文文字视图" : `${rubric.rows.length} 项评审依据`}</span></div>
            {documentView === "document" ? <article className="document-body">
              {doc.text.split(/\n+/).filter(Boolean).map((paragraph, index) => {
                const heading = /^(一、|二、|三、|四、|五、|\d+[.、])/.test(paragraph);
                return heading ? <h3 key={index}>{paragraph}</h3> : <p key={index}>{paragraph}</p>;
              })}
            </article> : <div className="evidence-list">{rubric.rows.map((row, index) => <article className="evidence-item" key={row.name}><div><span>0{index + 1} · {row.name}</span><p>{makeEvidence(doc.text, row, doc.demo)}</p></div><small>{doc.demo ? "示例文本定位" : "关键词辅助定位"}</small></article>)}</div>}
            <div className="doc-foot"><span>DOCX 正文解析</span><span>图片、视频与版式内容需人工检查</span></div>
          </section>

          <section className="review-panel panel">
            <div className="review-title"><div><span className="panel-kicker">评审与打分</span><h2>选择案例类别</h2></div><span className="review-state">初审建议 · 人工复核</span></div>
            <div className="category-grid" role="group" aria-label="选择案例类别">
              {Object.entries(RUBRICS).map(([id, item]) => <button key={id} className={`category-option ${Number(id) === category ? "chosen" : ""}`} onClick={() => switchCategory(Number(id))} aria-pressed={Number(id) === category}><span className="category-no">0{id}</span><strong>{item.short}</strong><small>{item.name}</small></button>)}
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
            <div className="score-footer"><div className="total-score"><span>当前总分</span><b>{assigned ? total : "—"}<small>/ 100</small></b><em>{assigned}/{rubric.rows.length} 项已填写</em></div><div className="footer-actions"><button className="button ai-button" disabled={busy} onClick={() => apiKey && apiUrl && model ? setConsentOpen(true) : setKeyDialogOpen(true)}>{busy ? "AI 正在初审…" : "AI 初审"}</button><button className="button quiet" onClick={saveReview}>保存草稿</button><button className="button primary" onClick={exportReview}>导出评审记录</button></div></div>
          </section>
        </div>
        <footer className="page-footer"><span>评审建议用于辅助核对；最终意见由评审专家确认。</span><span>华东师范大学 · 第四届中小学教师AI创新教学案例大赛</span></footer>
      </>}

      {keyDialogOpen && <div className="consent-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setKeyDialogOpen(false); }}><section className="consent-dialog key-dialog" role="dialog" aria-modal="true" aria-labelledby="key-title"><span className="panel-kicker">MODEL CONNECTION / 模型连接</span><h2 id="key-title">配置模型 API</h2><p>支持兼容 OpenAI Chat Completions 格式的模型服务。输入服务商提供的完整 HTTPS 接口地址、模型名称和 API Key。配置仅保存在当前浏览器会话；评分时通过本系统服务端转发至所选 API 地址。</p><label className="comment-label" htmlFor="api-url-input">API 地址</label><input id="api-url-input" className="api-key-input" type="url" autoComplete="url" spellCheck="false" value={apiUrlDraft} onChange={(event) => { setApiUrlDraft(event.target.value); setKeyConnected(false); setKeyStatus(""); }} placeholder="https://api.example.com/v1/chat/completions" /><label className="comment-label api-field-label" htmlFor="model-input">模型名称</label><input id="model-input" className="api-key-input" type="text" autoComplete="off" spellCheck="false" value={modelDraft} onChange={(event) => { setModelDraft(event.target.value); setKeyConnected(false); setKeyStatus(""); }} placeholder="填写服务商提供的 model ID" /><label className="comment-label api-field-label" htmlFor="api-key-input">API Key</label><input id="api-key-input" className="api-key-input" type="password" autoComplete="off" spellCheck="false" value={keyDraft} onChange={(event) => { setKeyDraft(event.target.value); setKeyConnected(false); setKeyStatus(""); }} placeholder="粘贴你的 API Key" /><div className={`key-status ${keyConnected ? "success" : ""}`} role="status">{keyStatus || (apiKey ? `已保存模型配置：${model}（Key 不显示）。` : "尚未配置模型 API。")}</div><p className="key-cost-note">连接测试会发送一次极短请求并产生少量模型用量。系统仅接受公开 HTTPS 服务地址，禁止本机及内部网络地址。不要在公共或共享电脑上保存个人 Key。</p><div className="consent-actions key-actions">{apiKey && <button className="button quiet" onClick={clearApiKey}>清除</button>}<button className="button quiet" onClick={() => setKeyDialogOpen(false)}>关闭</button><button className="button primary" disabled={keyTesting} onClick={testAndSaveKey}>{keyTesting ? "正在测试…" : "测试连接并保存"}</button></div></section></div>}
      {consentOpen && <div className="consent-overlay" role="presentation"><section className="consent-dialog" role="dialog" aria-modal="true" aria-labelledby="consent-title"><span className="panel-kicker">MODEL REVIEW / AI 初审</span><h2 id="consent-title">开始 AI 初审？</h2><p>系统将把当前案例正文、所选类别和对应评分要点发送到你配置的模型服务，生成逐项评分建议、理由及原文引用。</p><p>模型调用会消耗你的服务商额度。AI 建议仅供参考，最终评分由评审员确认。</p><div className="consent-case"><span>案例</span><strong>{doc.title}</strong><span>类别</span><strong>{rubric.name}</strong></div><div className="consent-actions"><button className="button quiet" onClick={() => setConsentOpen(false)}>取消</button><button className="button primary" onClick={runAIReview}>确认发送并初审</button></div></section></div>}

      {view === "standards" && <main className="secondary-view"><div className="page-heading"><div><p className="eyebrow">RUBRIC / 评审依据</p><h1>四类案例评分标准</h1><p className="subheading">各项指标说明依据三份评审标准文档整理，AI 初审与人工评审使用同一套要点。</p></div><button className="button primary" onClick={() => setView("review")}>返回评审</button></div><div className="standards-grid">{Object.entries(RUBRICS).map(([id, item]) => <section className="standard-card panel" key={id}><div className="standard-top"><span>类别 0{id}</span><strong>{item.rows.reduce((s, row) => s + row.weight, 0)}<small>%</small></strong></div><h2>{item.name}</h2><p>{item.intro}</p>{item.rows.map((row) => <section className="standard-row" key={row.name}><div className="standard-row-heading"><strong>{row.name}</strong><b>{row.weight}%</b></div><ol>{row.points.map((point) => <li key={point}>{point}</li>)}</ol></section>)}</section>)}</div></main>}

      {view === "history" && <main className="secondary-view"><div className="page-heading"><div><p className="eyebrow">REVIEW LOG / 本地会话</p><h1>评审记录</h1><p className="subheading">当前原型仅在本次页面会话中保留草稿，不会上传或持久化保存。</p></div><button className="button quiet" onClick={() => setView("review")}>返回评审</button></div><section className="history-panel panel">{history.length === 0 ? <div className="empty-state"><h2>还没有保存的评审草稿</h2><p>在评审工作台保存后，记录会显示在这里。</p><button className="button primary" onClick={() => setView("review")}>开始评审</button></div> : history.map((item, index) => <article className="history-item" key={`${item.savedAt}-${index}`}><div><strong>{item.title}</strong><p>{item.category} · {item.fileName} · {item.savedAt} · {item.filledCount}/{item.rowCount} 项已填写</p></div><b>{item.filledCount ? item.total : "—"}<small> / 100</small></b></article>)}</section></main>}
    </div>
  );
}

export { App };
