export function effectiveTemplate(item) {
  return item.templateOverride ? "符合模板（人工确认）" : item.template?.status || "未核对";
}

export function templateFailures(items) {
  return items.filter((item) => item.template?.status === "不符合模板" && !item.templateOverride);
}

export function orderCases(items) {
  const priority = (item) => !item.templateOverride && item.template?.status === "不符合模板" ? 0
    : !item.templateOverride && item.template?.status === "待人工核对" ? 1 : item.status === "读取失败" ? 2 : 3;
  return [...items].sort((a, b) => priority(a) - priority(b));
}

// Template failures are separate from score ranking. Missing scores never become zero scores.
export function rankBatch(items, percentage = 50) {
  const eligible = items.filter((item) => item.text && (item.template?.status === "符合模板" || item.templateOverride));
  const scored = eligible.filter((item) => item.result && Number.isFinite(item.result.total));
  const sorted = [...scored].sort((a, b) => a.result.total - b.result.total);
  const target = Math.round(sorted.length * Math.max(0, Math.min(100, percentage)) / 100);
  const decisions = {};
  const tied = target > 0 && target < sorted.length && sorted[target - 1].result.total === sorted[target].result.total;
  const boundary = target ? sorted[target - 1]?.result.total : null;
  for (let i = 0; i < sorted.length; i++) {
    const item = sorted[i];
    decisions[item.id] = tied && item.result.total === boundary ? "分界同分·待人工确认" : i < target ? "按排名·建议筛出" : "按排名·建议保留";
  }
  return { decisions, target, boundary, tied, scored: scored.length, eligible: eligible.length,
    complete: scored.length === eligible.length, excluded: Object.values(decisions).filter((x) => x === "按排名·建议筛出").length };
}

export function screeningDecision(item, ranking) {
  if (!item.templateOverride && item.template?.status === "不符合模板") return "模板不符·建议筛出（需复核）";
  return ranking.decisions[item.id] || "未完成评分·待处理";
}
