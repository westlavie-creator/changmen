/**
 * 足球归一化 / 别名 canonical / 配对键（单一来源）。
 * server sport_team_plugin（PM∥PF 合场）与 client 足球 OB 本机合场共用；
 * 别名数据在 ./football_team_aliases.json，确认新映射沉淀到该表，禁止各端私建。
 * 禁止 import 电竞 team_db。
 * 边界：本模块只做「队名 token」归一；client 侧标题预剥离（括号注/让球后缀，stripSide）
 * 留在 client/web/src/runtime/footballMatchKey.ts，不进本模块，避免口径分裂。
 */
import aliasesRaw from "./football_team_aliases.json" with { type: "json" };

/** 队名填充词：归一后从 token 序列剔除（canonical 短名）。 */
const FILLER_TOKENS = new Set(["fc", "cf", "cd", "sc", "ac", "fk", "club"]);

/** 大小球/胜负标签不是队名。 */
const OUTCOME_LABELS = new Set(["大", "小", "大球", "小球", "over", "under", "o", "u"]);

let aliasMap: Map<string, string> | null = null;

function loadAliasMap() {
  if (aliasMap)
    return aliasMap;
  aliasMap = new Map();
  for (const [k, v] of Object.entries(aliasesRaw)) {
    if (k.startsWith("_"))
      continue;
    // 键按 normFootballTeamName 归一入库：键形态漂移（重音/连字符/大小写）自动消除。
    const key = normFootballTeamName(k);
    const val = String(v).trim().toLowerCase();
    if (key && val)
      aliasMap.set(key, val);
  }
  return aliasMap;
}

/**
 * 归一化：NFKD 去重音 + 小写 + 去撇号（避免 A's → a s）+ &→and + 非字母数字→空格 + 折叠空白。
 * @param {string} name
 * @returns {string}
 */
export function normFootballTeamName(name: string): string {
  return String(name || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[''`´]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9一-鿿]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * 队名 → canonical key：归一 → 别名表 → 去填充词。空串/结果标签返回 ""。
 * @param {string} name
 * @returns {string}
 */
export function resolveFootballTeamKey(name: string): string {
  const n = normFootballTeamName(name);
  if (!n || OUTCOME_LABELS.has(n))
    return "";
  const mapped = loadAliasMap().get(n) || n;
  return mapped.split(" ").filter((t: string) => !FILLER_TOKENS.has(t)).join(" ");
}

/**
 * 主客 → 排序队名对（朝向无关）。任一侧不可识别返回 null。
 * @param {string} home
 * @param {string} away
 * @returns {[string, string] | null}
 */
export function canonicalFootballTeamPair(home: string, away: string): [string, string] | null {
  const h = resolveFootballTeamKey(home);
  const a = resolveFootballTeamKey(away);
  if (!h || !a)
    return null;
  return h < a ? [h, a] : [a, h];
}
