"use strict";

/**
 * 队名规范化，与 match_merge.js 逻辑保持一致但独立维护。
 * 目标：让 "EDG"、"edward gaming"、"Edward Gaming Esports" 产生相同的 base token。
 */

const STRIP_SUFFIXES = [
  "esports", "esport", "gaming", "team", "club", "fc",
  "e-sports", "e sports",
];

function normalize(name) {
  let s = String(name || "")
    .toLowerCase()
    .replace(/[·\-—_·•]+/g, " ")   // 各种连字符 → 空格
    .replace(/[^\w\s一-鿿]/g, "") // 去标点，保留 CJK
    .replace(/\s+/g, " ")
    .trim();

  // 去末尾通用后缀
  for (const suffix of STRIP_SUFFIXES) {
    if (s.endsWith(" " + suffix)) {
      s = s.slice(0, s.length - suffix.length - 1).trim();
      break;
    }
  }
  return s;
}

/**
 * 简单 token overlap 相似度：交集 / 并集（Jaccard on words）
 * 对 "edward gaming" vs "edg" 效果差，但对 "natus vincere" vs "navi" 也差。
 * 主要用于候选列表粗过滤，精确匹配靠 acronym 字段。
 */
function similarity(a, b) {
  const ta = new Set(normalize(a).split(" ").filter(Boolean));
  const tb = new Set(normalize(b).split(" ").filter(Boolean));
  const intersection = [...ta].filter((t) => tb.has(t)).length;
  const union = new Set([...ta, ...tb]).size;
  return union === 0 ? 0 : intersection / union;
}

/**
 * 检查 shortName 是否可能是 fullName 的首字母缩写。
 * "EDG" → "Edward Gaming" ✓（E·d·G... 不严格匹配，需放宽）
 * 策略：shortName 每个字母是否都出现在 fullName 的单词首字母里。
 */
function isAcronymOf(shortName, fullName) {
  const short = normalize(shortName).replace(/\s/g, "").toUpperCase();
  if (short.length > 6 || short.length < 2) return false;
  const initials = normalize(fullName)
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase())
    .join("");
  // short 的所有字母都能在 initials 里找到（按序）
  let idx = 0;
  for (const ch of short) {
    const found = initials.indexOf(ch, idx);
    if (found === -1) return false;
    idx = found + 1;
  }
  return true;
}

module.exports = { normalize, similarity, isAcronymOf };
