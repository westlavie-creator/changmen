// quick test for IM parse
const CN_DIGIT = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5 };
function parseImMapFromBetName(name) {
  const text = String(name || "").replace(/\s+/g, "");
  if (!text || /全场/.test(text)) return 0;
  const m = text.match(/第([一二三四五六七八九十\d]+)局/);
  if (!m) return 0;
  const token = m[1];
  if (/^\d+$/.test(token)) return Number(token) || 0;
  if (token.length === 1) return CN_DIGIT[token] ?? 0;
  return 0;
}
function imBetNameIsMapWinner(name) {
  const text = String(name || "");
  if (!text) return false;
  if (/全场/.test(text)) return false;
  return /第\s*.+\s*局.*胜/.test(text) || /局.*胜利/.test(text);
}
const names = ["第 一 局胜利 (滚球)", "第 三 局胜利", "全场胜负"];
for (const n of names) {
  console.log(n, "map=", parseImMapFromBetName(n), "win=", imBetNameIsMapWinner(n));
}
