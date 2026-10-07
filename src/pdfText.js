// PDFs can paint substitute fonts later than the surrounding characters.
// Reconstruct rows by coordinates rather than PDF drawing order.
export function textInReadingOrder(items) {
  const lines = [];
  for (const item of items.filter((x) => typeof x.str === "string" && x.str.trim()).sort((a, b) => b.transform[5] - a.transform[5])) {
    const y = item.transform[5], tolerance = Math.max(2, Math.abs(item.height || 0) * .3);
    let line = lines.find((x) => Math.abs(x.y - y) <= tolerance);
    if (!line) { line = { y, items: [] }; lines.push(line); }
    line.items.push(item);
  }
  return lines.sort((a, b) => b.y - a.y).map((line) => line.items.sort((a, b) => a.transform[4] - b.transform[4]).map((x) => x.str).join(" ")).join("\n");
}
