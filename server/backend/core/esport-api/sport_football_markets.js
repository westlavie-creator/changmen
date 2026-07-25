/**
 * 体育盘口规范（足球为主；moneyline/spreads/totals 常量亦供棒球 Gamma 共用）。
 * 仅 sport_* 路径使用；禁止写入电竞 client_matches。
 */

export const FOOTBALL_LEAGUE_CODES = [
  "epl",
  "lal",
  "bun",
  "fl1",
  "sea",
  "ucl",
  "uel",
  "mls",
  "ere",
  "por",
  "uef",
  "fif",
  "mex",
  "bra",
  "arg",
  "copa",
  "jap",
  "afc",
  "caf",
  "chi",
  "chi2",
];

/** 联赛解析失败时的兜底码；跨馆合并时仅此类可挂到真实联赛 */
export const FOOTBALL_FALLBACK_GAMES = new Set(["uef", "fif"]);

export const MARKET_MONEYLINE = "moneyline";
export const MARKET_SPREADS = "spreads";
export const MARKET_TOTALS = "totals";

/**
 * 体育 Bet 行 ID：matchId*100+seq，避免全量线 seq≥10 与邻场撞号（旧 *10 会撞）。
 * @param {number|string} matchId
 * @param {number|string} betSeq
 */
export function encodeSportBetId(matchId, betSeq) {
  const m = Number(matchId) || 0;
  const s = Number(betSeq) || 0;
  return m * 100 + s;
}

/**
 * 开赛时间小时桶（与 team-resolver pairKey 同构）。
 * @param {number} startTimeMs
 */
export function sportHourBucket(startTimeMs) {
  const t = Number(startTimeMs) || 0;
  if (t <= 0)
    return 0;
  return Math.floor(t / (60 * 60 * 1000));
}

/** Gamma / PF 兄弟盘事件后缀 */
const SIBLING_SUFFIX_RE = /\s+-\s+(More Markets|Total Corners|Exact Score|Halftime Result|Second Half Result|First Team to Score|Team Totals?|Corners)\s*$/i;

/** 让球线后缀：`Yunnan Yukun FC (-1.5)` */
const HANDICAP_SUFFIX_RE = /\s*\([+-]?\d+(?:\.\d+)?\)\s*/g;

/**
 * 去掉队名末尾让球标注，避免同场拆成两卡。
 * @param {string} name
 */
export function stripFootballHandicapSuffix(name) {
  return String(name || "")
    .replace(/\s*\([+-]?\d+(?:\.\d+)?\)\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * @param {string} title
 */
export function baseFootballEventTitle(title) {
  let t = String(title || "").replace(SIBLING_SUFFIX_RE, "").trim();
  // "A (-1.5) vs B (-1.5)" / "A vs B - More Markets" → "A vs B"
  t = t.replace(HANDICAP_SUFFIX_RE, " ").replace(/\s+/g, " ").trim();
  return t;
}

/**
 * @param {string} title
 */
export function isFootballSiblingEventTitle(title) {
  const raw = String(title || "");
  if (SIBLING_SUFFIX_RE.test(raw))
    return true;
  // 两侧队名都带让球线 → 盘口兄弟场（勿当独立主场）
  const parts = raw.split(/\s+vs\.?\s+/i);
  if (parts.length < 2)
    return false;
  const lineRe = /\([+-]?\d+(?:\.\d+)?\)/;
  return lineRe.test(parts[0]) && lineRe.test(parts.slice(1).join(" vs "));
}

/**
 * @param {unknown} raw
 * @returns {number|null}
 */
export function parseMarketLine(raw) {
  if (raw == null || raw === "")
    return null;
  const n = Number(raw);
  if (Number.isFinite(n))
    return n;
  const m = String(raw).match(/([+-]?\d+(?:\.\d+)?)/);
  if (!m)
    return null;
  const v = Number(m[1]);
  return Number.isFinite(v) ? v : null;
}

/**
 * 从盘口标题解析 line（PF `Henan FC (-1.5)` / `O/U 2.5`）。
 * @param {string} title
 */
export function parseLineFromTitle(title) {
  const s = String(title || "");
  const ou = s.match(/\bO\/U\s*([+-]?\d+(?:\.\d+)?)/i)
    || s.match(/\b(?:over|under)\s+([+-]?\d+(?:\.\d+)?)/i);
  if (ou)
    return parseMarketLine(ou[1]);
  const paren = s.match(/\(([+-]?\d+(?:\.\d+)?)\)/);
  if (paren)
    return parseMarketLine(paren[1]);
  return parseMarketLine(s);
}

/**
 * @param {string} marketCode
 * @param {number|null|undefined} line
 */
export function marketBetKey(marketCode, line) {
  const code = String(marketCode || MARKET_MONEYLINE).toLowerCase();
  if (code === MARKET_MONEYLINE || line == null || !Number.isFinite(Number(line)))
    return `${code}|`;
  return `${code}|${Number(line)}`;
}

/**
 * @param {string} marketCode
 * @param {number|null|undefined} line
 */
export function displayBetName(marketCode, line) {
  const code = String(marketCode || "").toLowerCase();
  if (code === MARKET_SPREADS) {
    const n = Number(line);
    if (!Number.isFinite(n))
      return "让球";
    const sign = n > 0 ? `+${n}` : String(n);
    return `让球 ${sign}`;
  }
  if (code === MARKET_TOTALS) {
    const n = Number(line);
    return Number.isFinite(n) ? `大小 ${n}` : "大小球";
  }
  return "全场胜负";
}

/**
 * 主让球线：优先 |1.5|，其次 |2.5|；同绝对值取负线（主队让球）优先。
 * @param {number[]} lines
 * @returns {number|null}
 */
export function pickMainSpreadLine(lines) {
  const uniq = [...new Set((lines || []).map(Number).filter(Number.isFinite))];
  if (!uniq.length)
    return null;
  for (const prefer of [1.5, 2.5]) {
    const neg = uniq.find(l => l === -prefer);
    if (neg != null)
      return neg;
    const pos = uniq.find(l => l === prefer);
    if (pos != null)
      return pos;
    const any = uniq.find(l => Math.abs(l) === prefer);
    if (any != null)
      return any;
  }
  uniq.sort((a, b) => Math.abs(a) - Math.abs(b) || a - b);
  return uniq[0];
}

/**
 * 主大小球线：优先 2.5，其次 3.5。
 * @param {number[]} lines
 * @returns {number|null}
 */
export function pickMainTotalLine(lines) {
  const uniq = [...new Set((lines || []).map(Number).filter(Number.isFinite))];
  if (!uniq.length)
    return null;
  for (const prefer of [2.5, 3.5]) {
    if (uniq.includes(prefer))
      return prefer;
  }
  uniq.sort((a, b) => a - b);
  return uniq[0];
}

/**
 * 足球列表展示：胜负 + 全部让球线 + 全部大小球线（按 line 排序）。
 * @param {object[]} bets
 * @returns {object[]}
 */
export function selectFootballDisplayBets(bets) {
  const list = Array.isArray(bets) ? bets : [];
  const money = list.filter(b => {
    const code = String(b.MarketCode || "").toLowerCase();
    if (code === MARKET_MONEYLINE)
      return true;
    if (code)
      return false;
    return String(b.Name || "").toLowerCase() === "moneyline";
  });
  const spreads = list
    .filter(b => String(b.MarketCode) === MARKET_SPREADS)
    .slice()
    .sort((a, b) => Number(a.Line) - Number(b.Line));
  const totals = list
    .filter(b => String(b.MarketCode) === MARKET_TOTALS)
    .slice()
    .sort((a, b) => Number(a.Line) - Number(b.Line));

  /** @type {object[]} */
  const out = [];
  if (money.length)
    out.push(money[0]);
  else {
    const legacy = list.find(b => !b.MarketCode && Number(b.Map) === 0);
    if (legacy)
      out.push(legacy);
  }
  out.push(...spreads);
  out.push(...totals);
  return out;
}

/**
 * 把 line 规范成相对「主队」的让球（翻转主客时取反）。
 * @param {number|null} line
 * @param {boolean} flipped
 */
export function orientSpreadLine(line, flipped) {
  if (line == null || !Number.isFinite(Number(line)))
    return null;
  const n = Number(line);
  return flipped ? -n : n;
}

/**
 * PF/PM 文本 → 足球联赛 Game 码；对不上返回 null（调用方兜底）。
 * @param {string} text
 */
export function resolveFootballLeagueFromText(text) {
  const raw = String(text || "").toLowerCase();
  if (!raw)
    return null;
  const table = [
    [/\b(epl|premier league)\b/, "epl"],
    [/\b(lal|la liga|laliga)\b/, "lal"],
    [/\b(bun|bundesliga)\b/, "bun"],
    [/\b(fl1|ligue 1)\b/, "fl1"],
    [/\b(sea|serie a)\b/, "sea"],
    [/\b(ucl|champions league)\b/, "ucl"],
    [/\b(uel|europa league)\b/, "uel"],
    [/\bmls\b/, "mls"],
    [/\b(ere|eredivisie)\b/, "ere"],
    [/\b(por|primeira liga|liga portugal)\b/, "por"],
    [/\b(uef|uefa)\b/, "uef"],
    [/\b(fif|fifa|world cup)\b/, "fif"],
    [/\b(mex|liga mx)\b/, "mex"],
    [/\b(bra|brasileir)/, "bra"],
    [/\b(arg|primera(?:\s+divisi[oó]n)?|argentina)\b/, "arg"],
    // 仅美洲杯；勿用裸 \bcopa\b（会误伤 Copa del Rey / Copa Libertadores 等）
    [/\bcopa\s+am[eé]rica\b|\bamerica'?s?\s+cup\b|美洲杯/, "copa"],
    [/\b(jap|j-?league)\b/, "jap"],
    [/\b(afc)\b/, "afc"],
    [/\b(caf)\b/, "caf"],
    [/\b(chi2|china league one)\b/, "chi2"],
    [/\b(chi|csl|chinese super league)\b|中超/, "chi"],
  ];
  for (const [re, code] of table) {
    if (re.test(raw))
      return code;
  }
  const allow = new Set(FOOTBALL_LEAGUE_CODES);
  const token = raw.trim();
  if (allow.has(token))
    return token;
  return null;
}
