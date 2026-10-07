import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType } from "docx";
import { RUBRICS, RUBRIC_VERSION } from "./rubrics.js";
import { effectiveTemplate, orderCases, screeningDecision, templateFailures } from "./batchScreening.js";

const p = (text, options = {}) => new Paragraph({ children: [new TextRun({ text: String(text), font: "宋体" })], spacing: { after: 140 }, ...options });
const cell = (text) => new TableCell({ children: [p(text)] });
const stamp = () => new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
const disclaimer = "分数与筛选意见为AI初审建议。人工模板确认仅表示模板审核结论，不代表案例质量通过。未评分、读取失败的案例不计零分。OCR文字、正文引用、图片、视频及外部链接需人工复核。";

function caseParagraphs(item, ranking, index, pageBreakBefore = false) {
  const children = [p(`${index + 1} ${item.name}`, { heading: HeadingLevel.HEADING_1, pageBreakBefore }),
    p(`类别 ${RUBRICS[item.category].name}`), p("模板审核", { heading: HeadingLevel.HEADING_2 }),
    p(`最终模板结论 ${effectiveTemplate(item)}`), p(`原始框架识别 ${item.template?.status || "未完成"}`)];
  children.push(p(`规则核对依据 ${item.template?.reasons?.length ? item.template.reasons.join("；") : item.template ? "检出对应模板的主要栏目" : "文档尚未成功读取"}`));
  children.push(p(`人工核对 ${item.templateOverride ? "确认符合模板" : item.templateRejected ? "确认不符合模板" : "未作人工确认"}${item.templateReviewedAt ? `　记录时间 ${item.templateReviewedAt}` : ""}`));
  if (item.templateReviewNote) children.push(p(`人工核对说明 ${item.templateReviewNote}`));
  if (item.metadata?.ocrPages?.length) children.push(p(`OCR识别页 ${item.metadata.ocrPages.map((x) => `${x.page}（置信度${Math.round(x.confidence || 0)}%）`).join("、")}，文字须对照原文复核`));
  if (item.metadata?.blankPages?.length) children.push(p(`检测到空白页 ${item.metadata.blankPages.join("、")}`));
  if (item.metadata?.warnings?.length) children.push(p(`解析提示 ${item.metadata.warnings.join("；")}`));
  children.push(p("案例评价", { heading: HeadingLevel.HEADING_2 }), p(`初筛建议 ${screeningDecision(item, ranking)}`));
  if (!item.result) { children.push(p(`评分状态 ${item.status}${item.error ? `。${item.error}` : ""}`), p("未产生AI评分，不记零分。")); return children; }
  children.push(p(`AI总分 ${item.result.total} / 100　模型 ${item.result.model || "未记录"}`));
  children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [
    new TableRow({ tableHeader: true, children: [cell("评价指标"), cell("满分"), cell("得分")] }),
    ...item.result.results.map((r) => new TableRow({ children: [cell(r.indicator), cell(r.max ?? RUBRICS[item.category].rows.find((x) => x.name === r.indicator)?.weight), cell(r.score)] }))
  ] }));
  for (const row of item.result.results) children.push(p(row.indicator, { heading: HeadingLevel.HEADING_3 }),
    p(`得分说明 ${row.rationale || "未提供"}`), p(`正文依据 ${row.evidence || "未提供直接引文"}`));
  children.push(p("综合意见", { heading: HeadingLevel.HEADING_2 }), p(item.result.overallComment || "未提供"));
  return children;
}

function packDocument(children) {
  return Packer.toBlob(new Document({ styles: { default: { document: { run: { font: "宋体", size: 22 }, paragraph: { spacing: { line: 320 } } } } },
    sections: [{ properties: { page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } }, children }] }));
}

export async function createReviewReport(items, ranking, percentage) {
  const children = [p("第四届中小学教师AI创新教学案例大赛初审报告", { heading: HeadingLevel.TITLE }),
    p(`生成日期 ${stamp()}　评分标准版本 ${RUBRIC_VERSION}`),
    p(`本批共${items.length}份案例，已完成评分${ranking.scored}份，待评分${ranking.eligible - ranking.scored}份。模板不符${templateFailures(items).length}份，其中人工确认不符合${items.filter((item) => item.templateRejected).length}份。`),
    p(`评分阶段按已评分案例总分从低到高排序，目标比例${percentage}%，目标约${ranking.target}份。当前建议筛出${ranking.excluded}份。模板不符单独列出，不混入评分排名；分界同分需人工确认。${ranking.complete ? "" : "评分尚未全部完成，排名为暂定结果。"}`),
    p(disclaimer)];
  orderCases(items).forEach((item, index) => {
    children.push(...caseParagraphs(item, ranking, index, true));
  });
  return packDocument(children);
}

export function createCaseReport(item, ranking, percentage) {
  return packDocument([p("案例模板审核与评价报告", { heading: HeadingLevel.TITLE }),
    p(`生成日期 ${stamp()}　评分标准版本 ${RUBRIC_VERSION}`),
    p(`本案例采用所在批次的评分排名，批次筛出比例${percentage}%。${ranking.complete ? "" : "本批尚未全部评分，排名暂定。"}`),
    ...caseParagraphs(item, ranking, 0), p(disclaimer)]);
}

export function safeReportName(name, index) {
  const base = String(name).replace(/\.(docx?|pdf)$/i, "").normalize("NFC").replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").replace(/[. ]+$/g, "").slice(0, 80) || "未命名案例";
  return `${String(index + 1).padStart(4, "0")}_${base}_审核报告.docx`;
}

export async function createReportPackage(items, ranking, percentage, onProgress = () => {}) {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  onProgress(`正在生成完整汇总报告（共${items.length}份案例）…`);
  zip.file("完整汇总报告.docx", await (await createReviewReport(items, ranking, percentage)).arrayBuffer());
  const sorted = orderCases(items);
  const usedNames = new Set();
  for (let i = 0; i < sorted.length; i++) {
    onProgress(`正在生成各案例Word ${i + 1}/${sorted.length}：${sorted[i].name}`);
    const blob = await createCaseReport(sorted[i], ranking, percentage);
    let name = safeReportName(sorted[i].name, i), suffix = 2;
    while (usedNames.has(name.toLocaleLowerCase("en-US"))) name = safeReportName(`${sorted[i].name}_${suffix++}`, i);
    usedNames.add(name.toLocaleLowerCase("en-US"));
    zip.file(`各案例报告/${name}`, await blob.arrayBuffer());
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return zip.generateAsync({ type: "blob", compression: "STORE" }, (update) => onProgress(`正在打包报告 ${Math.round(update.percent)}%…`));
}
