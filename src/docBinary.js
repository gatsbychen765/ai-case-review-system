import * as CFB from "cfb";

// Word 97–2003 main text, following MS-DOC section 2.4.1 (piece table).
export function extractBinaryDoc(buffer) {
  const archive = CFB.read(new Uint8Array(buffer), { type: "array" });
  const stream = (name) => {
    const entry = CFB.find(archive, name);
    if (!entry?.content) throw new Error("DOC结构不完整，请用Word另存为DOCX。");
    return new Uint8Array(entry.content);
  };
  const word = stream("WordDocument"), w = new DataView(word.buffer, word.byteOffset, word.byteLength);
  if (w.getUint16(0, true) !== 0xa5ec || w.getUint16(2, true) < 0xc1) throw new Error("此DOC版本暂不支持，请另存为DOCX。");
  const flags = w.getUint16(10, true);
  if (flags & 0x8100) throw new Error("DOC已加密，请先解除密码保护。");
  const table = stream(flags & 0x0200 ? "1Table" : "0Table");
  let offset = 32;
  offset += 2 + w.getUint16(offset, true) * 2;
  const longCount = w.getUint16(offset, true);
  if (longCount < 4) throw new Error("DOC头部无效。");
  const mainLength = w.getUint32(offset + 2 + 3 * 4, true);
  offset += 2 + longCount * 4;
  const pairCount = w.getUint16(offset, true);
  if (pairCount <= 33) throw new Error("DOC缺少正文索引，请另存为DOCX。");
  const clxOffset = w.getUint32(offset + 2 + 33 * 8, true), clxLength = w.getUint32(offset + 6 + 33 * 8, true);
  if (!clxLength || clxOffset + clxLength > table.length) throw new Error("DOC正文索引损坏。");
  const t = new DataView(table.buffer, table.byteOffset, table.byteLength);
  let cursor = clxOffset;
  while (table[cursor] === 1) cursor += 3 + t.getUint16(cursor + 1, true);
  if (table[cursor] !== 2) throw new Error("DOC正文索引无法识别。");
  const size = t.getUint32(cursor + 1, true), start = cursor + 5, count = (size - 4) / 12;
  if (!Number.isInteger(count) || count < 1 || start + size > table.length) throw new Error("DOC分段索引损坏。");
  const chunks = [];
  for (let i = 0; i < count; i++) {
    const cp = t.getUint32(start + i * 4, true), end = Math.min(t.getUint32(start + (i + 1) * 4, true), mainLength);
    if (cp >= mainLength) break;
    if (end < cp) throw new Error("DOC正文顺序无效。");
    const fc = t.getUint32(start + (count + 1) * 4 + i * 8 + 2, true), compressed = Boolean(fc & 0x40000000);
    const at = (fc & 0x3fffffff) / (compressed ? 2 : 1), length = (end - cp) * (compressed ? 1 : 2);
    if (at + length > word.length) throw new Error("DOC正文损坏或不完整。");
    chunks.push(new TextDecoder(compressed ? "windows-1252" : "utf-16le").decode(word.subarray(at, at + length)));
  }
  // Preserve displayed field values, remove field instructions and control characters.
  return chunks.join("").replace(/\x13[^\x14\x15]*\x14/g, "").replace(/\x13[^\x15]*\x15/g, "")
    .replace(/[\r\x07\x0b\x0c]/g, "\n").replace(/[\x00-\x08\x0e-\x1f]/g, "").replace(/\n{3,}/g, "\n\n").trim();
}
