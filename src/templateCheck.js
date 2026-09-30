// 按用户提供的三份案例信息表模板核对结构；这里只检查可从 DOCX 正文确认的项目。
const TEMPLATES = {
  1: { title: "中小学人工智能教学应用案例", sections: ["基本信息", "案例介绍", "教学设计", "实施过程", "实施成效", "总结与反思"] },
  2: { title: "中小学人工智能教学应用案例", sections: ["基本信息", "案例介绍", "教学设计", "实施过程", "实施成效", "总结与反思"] },
  3: { title: "教育智能体开发与应用案例", sections: ["基本信息", "智能体开发过程", "需求分析", "功能实现", "智能体应用实践", "创新与可推广性"] },
  4: { title: "中小学教师智能素养提升案例", sections: ["基本信息", "案例描述与特点", "背景与问题", "问题解决思路", "实施成效"] },
};

export function suggestCategory(text) {
  const first = String(text).slice(0, 250);
  if (first.includes(TEMPLATES[3].title)) return 3;
  if (first.includes(TEMPLATES[4].title)) return 4;
  if (first.includes(TEMPLATES[1].title)) {
    const selectedTwo = /[√✓✔☑●■]\s*类别二/.test(text.slice(0, 1200));
    return selectedTwo ? 2 : 1;
  }
  return 1;
}

export function checkTemplate(text, category) {
  const template = TEMPLATES[category];
  const source = String(text || "");
  const head = source.slice(0, 300);
  const otherTitle = Object.entries(TEMPLATES).find(([id, item]) => Number(id) !== Number(category) && item.title !== template.title && head.includes(item.title));
  const missing = template.sections.filter((section) => !source.includes(section));
  const reasons = [];
  if (otherTitle) reasons.push(`文档标题属于类别 ${otherTitle[0]} 的模板`);
  if (!head.includes(template.title)) reasons.push(`未见模板标题“${template.title}”`);
  if (missing.length) reasons.push(`未见栏目：${missing.join("、")}`);
  if (source.length < 500) reasons.push("提取的正文不足 500 字，可能是空白模板或材料不完整");
  const status = otherTitle || missing.length >= 2 || source.length < 200 ? "不符合模板" : reasons.length ? "待人工核对" : "符合模板";
  return { status, reasons, template: template.title };
}
