import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType } from "docx";
import { RUBRICS, RUBRIC_VERSION } from "./rubrics.js";
import { effectiveTemplate, orderCases, screeningDecision, templateFailures } from "./batchScreening.js";

export async function createReviewReport(items, ranking, percentage) {
  const p = (text, options = {}) => new Paragraph({ children: [new TextRun({ text: String(text), font: "宋体" })], spacing: { after: 140 }, ...options });
  const cell = (text) => new TableCell({ children: [p(text)] });
  const children = [p("第四届中小学教师AI创新教学案例大赛初审报告", { heading: HeadingLevel.TITLE }),
    p(`生成日期 ${new Date().toLocaleString("zh-CN")}　评分标准版本 ${RUBRIC_VERSION}`),
    p(`本批共${items.length}份案例，已完成评分${ranking.scored}份，待评分${ranking.eligible - ranking.scored}份。未经人工确认的模板不符${templateFailures(items).length}份。`),
    p(`评分阶段按已评分案例总分从低到高排序，目标比例${percentage}%，目标约${ranking.target}份。当前建议筛出${ranking.excluded}份。模板不符单独列出，不混入评分排名；分界同分需人工确认。${ranking.complete ? "" : "评分尚未全部完成，排名为暂定结果。"}`),
    p("以下分数与筛选意见均为AI初审建议。人工模板确认仅表示允许进入评分，不代表案例质量通过。未完成或读取失败的案例不记作零分。正文引文需人工核对，图片、视频及外部链接的实际效果未由本系统验证。")];
  orderCases(items).forEach((item, index) => {
    children.push(p(`${index + 1} ${item.name}`, { heading: HeadingLevel.HEADING_1, pageBreakBefore: true }),
      p(`类别 ${RUBRICS[item.category].name}`), p(`模板核对 ${effectiveTemplate(item)}`));
    if (item.template?.reasons.length) children.push(p(`原始规则核对记录 ${item.template.reasons.join("；")}`));
    children.push(p(`初筛建议 ${screeningDecision(item, ranking)}`));
    if (!item.result) { children.push(p(`评分状态 ${item.status}${item.error ? `。${item.error}` : ""}`)); return; }
    children.push(p(`AI总分 ${item.result.total} / 100　模型 ${item.result.model || "未记录"}`));
    children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [
      new TableRow({ tableHeader: true, children: [cell("评价指标"), cell("满分"), cell("得分")] }),
      ...item.result.results.map((r) => new TableRow({ children: [cell(r.indicator), cell(r.max ?? RUBRICS[item.category].rows.find((x) => x.name === r.indicator)?.weight), cell(r.score)] }))
    ] }));
    for (const row of item.result.results) children.push(p(row.indicator, { heading: HeadingLevel.HEADING_2 }),
      p(`得分说明 ${row.rationale || "未提供"}`), p(`正文依据 ${row.evidence || "未提供直接引文"}`));
    children.push(p("综合意见", { heading: HeadingLevel.HEADING_2 }), p(item.result.overallComment || "未提供"));
  });
  return Packer.toBlob(new Document({ styles: { default: { document: { run: { font: "宋体", size: 22 }, paragraph: { spacing: { line: 320 } } } } },
    sections: [{ properties: { page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } }, children }] }));
}
