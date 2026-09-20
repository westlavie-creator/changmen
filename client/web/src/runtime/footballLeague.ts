import type { ViewMatch } from "@/models/match";
import {
  getGameCodeForPlatformId,
  getGameDisplayName,
  resolveGameCode,
} from "@changmen/shared/catalog/game_catalog.browser";

const UNMAPPED = "unknown_fb";
const UNMAPPED_LABEL = "未分类";

/** catalog 未挂 OB tid 的补充映射（与 football_ob_league_map.json 对齐） */
const EXTRA_OB_TID: Record<string, string> = {
  359: "bra",
  328: "ere",
  572: "por",
  1906: "mex",
  3384: "arg",
  90: "jap",
};

/** OB 联赛全称 / 热门短名 → catalog code；对不上再退回 tnjc/tn 原文。 */
const LEAGUE_TEXT: Array<[RegExp, string]> = [
  [/欧冠|欧洲冠军联赛|champions\s+league|\bucl\b/u, "ucl"],
  [/欧协联|欧协资|欧洲协会联赛|conference\s+league/u, "uecl"],
  [/欧洲联赛|欧罗巴联赛|欧联资|(?<![\p{L}\p{N}_])欧联(?![\p{L}\p{N}_])|europa\s+league|\buel\b/u, "uel"],
  [/英超|英格兰超级|premier\s+league|\bepl\b/u, "epl"],
  [/西甲|西班牙甲级|la\s*liga|\blal\b/u, "lal"],
  [/德甲|德国甲级|bundesliga|\bbun\b/u, "bun"],
  [/法甲|法国甲级|ligue\s*1|\bfl1\b/u, "fl1"],
  [/意甲|意大利甲级|serie\s*a|\bsea\b/u, "sea"],
  [/中超|中国超级|chinese\s+super/u, "chi"],
  [/\bmls\b|美职联|美国职业大联盟/u, "mls"],
  [/荷甲|荷兰甲级|eredivisie|\bere\b/u, "ere"],
  [/葡超|葡萄牙超级|primeira\s+liga|\bpor\b/u, "por"],
  [/墨超|墨西哥超级|liga\s*mx|\bmex\b/u, "mex"],
  [/巴甲|巴西甲级|brasileir|\bbra\b/u, "bra"],
  [/阿甲|阿职业|阿根廷职业|\barg\b/u, "arg"],
  [/日职|日本j1|j-?league|\bjap\b/u, "jap"],
];

/**
 * PM 原生联赛名（Gamma series 标题）→ 中文显示名。
 * 仅 Game 未识别（unknown_fb）走 League 兜底时做展示映射；不影响配对/隔离。
 * key 为归一化后的小写标题（去尾部年份、压缩空白）。
 */
const LEAGUE_NAME_ZH: Record<string, string> = {
  "k-league": "韩K联",
  "k league 2": "韩K2",
  "saudi pro league": "沙特联",
  "bundesliga 2": "德乙",
  "serie b": "意乙",
  "la liga 2": "西乙",
  "ligue 2": "法乙",
  "efl championship": "英冠",
  "scottish premiership": "苏超",
  "taca de portugal": "葡萄牙杯",
  "poland ekstraklasa": "波兰超",
  "czechia 1": "捷克甲",
  "ukraine premier liha": "乌超",
  "romania 1": "罗甲",
  "belgium pro league": "比甲",
  "superettan": "瑞典甲",
  "virslīga": "拉脱超",
  "a lyga": "立陶甲",
  "premium liiga": "爱沙甲",
  "thai league 1": "泰超",
  "indonesia liga 1": "印尼超",
  "indonesia liga 2": "印尼Liga 2",
  "liga promerica": "哥斯甲",
  "japan j2 league": "日乙",
  "japan j3 league": "日丙",
  "usl championship": "美冠USL",
  "taiwan football premier league": "台企甲",
  "norwegian eliteserien": "挪超",
  "swedish allsvenskan": "瑞超",
  "danish superliga": "丹超",
  "turkish süper lig": "土超",
  "greece super league": "希超",
  "austria bundesliga": "奥超",
  "swiss super league": "瑞士超",
};

/** 归一化 PM series 标题：小写、去尾部年份、压缩空白（"Eredivisie 2025" → "eredivisie"） */
function normalizeLeagueName(name: string): string {
  return String(name || "").toLowerCase().replace(/\s+20\d\d$/, "").replace(/\s+/g, " ").trim();
}

/** League 兜底名的展示名：命中映射表给中文名，否则保留原文。 */
function mapLeagueDisplayName(league: string | undefined): string {
  const raw = rawLeague(league);
  if (!raw)
    return "";
  return LEAGUE_NAME_ZH[normalizeLeagueName(raw)] || raw;
}

function rawGame(game: string | undefined): string {
  return String(game || "").trim();
}

function rawLeague(league: string | undefined): string {
  return String(league || "").trim();
}

function codeFromLeagueText(text: string): string {
  const blob = String(text || "").trim();
  if (!blob)
    return "";
  const lower = blob.toLowerCase();
  for (const [re, code] of LEAGUE_TEXT) {
    if (re.test(blob) || re.test(lower))
      return code;
  }
  return "";
}

/** 分组键：英超 / epl / 试玩全称合成同一联赛，对不上 catalog 的用原文。
 *  Game 为空/unknown_fb 且带原生联赛名（PM series 标题）时按联赛名分组。 */
export function footballLeagueKey(game: string | undefined, league?: string): string {
  const raw = rawGame(game);
  if (!raw || raw === UNMAPPED) {
    const mapped = mapLeagueDisplayName(league);
    return mapped ? `league:${mapped}` : UNMAPPED;
  }
  return resolveGameCode(raw) || codeFromLeagueText(raw) || raw;
}

/** 卡片/分组标题：catalog 码显示中文名；试玩 tn/tnjc 原文保留；
 *  Game 未识别时显示映射后的联赛名（命中表给中文，如 "K-league" → "韩K联"）。 */
export function footballLeagueLabel(game: string | undefined, league?: string): string {
  const raw = rawGame(game);
  if (!raw || raw === UNMAPPED)
    return mapLeagueDisplayName(league) || UNMAPPED_LABEL;
  const key = footballLeagueKey(raw);
  if (key === UNMAPPED)
    return mapLeagueDisplayName(league) || UNMAPPED_LABEL;
  if (raw === key)
    return getGameDisplayName(key) || raw;
  return raw;
}

export function footballLeagueTag(game: string | undefined, league?: string): string {
  const label = footballLeagueLabel(game, league);
  return label === UNMAPPED_LABEL ? "" : label;
}

function mappedFootballCode(game: string | undefined): string {
  const code = resolveGameCode(rawGame(game));
  if (!code || code === UNMAPPED)
    return "";
  return code;
}

/** OB 赛程 tid / 联赛名 → Game；未进 catalog 的杯赛保留场馆原文，避免整表掉进未分类。 */
export function resolveObFootballGame(tid: string, tn: string, tnjc = ""): string {
  const id = String(tid || "").trim();
  const fromTid = (id && getGameCodeForPlatformId("OB", id)) || EXTRA_OB_TID[id] || "";
  if (fromTid && fromTid !== UNMAPPED)
    return fromTid;
  for (const candidate of [tnjc, tn]) {
    const code = mappedFootballCode(candidate);
    if (code)
      return code;
  }
  const fromText = codeFromLeagueText(`${tnjc} ${tn}`);
  if (fromText)
    return fromText;
  return String(tnjc || "").trim() || String(tn || "").trim() || UNMAPPED;
}

/** 合场时保留更具体的联赛：catalog code 优先于「未分类」。 */
export function pickBetterFootballGame(current: string | undefined, incoming: string | undefined): string {
  const a = rawGame(current);
  const b = rawGame(incoming);
  const aCode = mappedFootballCode(a);
  const bCode = mappedFootballCode(b);
  if (bCode && !aCode)
    return bCode;
  if (aCode)
    return aCode;
  if (b && b !== UNMAPPED)
    return b;
  return a || UNMAPPED;
}

export type FootballLeagueGroup = {
  key: string;
  league: string;
  matches: ViewMatch[];
};

export function groupFootballMatchesByLeague(matches: ViewMatch[]): FootballLeagueGroup[] {
  const map = new Map<string, FootballLeagueGroup>();
  const order: string[] = [];
  for (const m of matches || []) {
    const key = footballLeagueKey(m.game, m.league);
    let g = map.get(key);
    if (!g) {
      g = { key, league: footballLeagueLabel(m.game, m.league), matches: [] };
      map.set(key, g);
      order.push(key);
    }
    g.matches.push(m);
  }
  for (const g of map.values()) {
    g.matches.sort((a, b) => {
      const ta = Number(a.startAt) || 0;
      const tb = Number(b.startAt) || 0;
      if (ta !== tb)
        return ta - tb;
      return (Number(a.id) || 0) - (Number(b.id) || 0);
    });
  }
  return order
    .map(k => map.get(k)!)
    .sort((a, b) => {
      if (a.key === UNMAPPED)
        return 1;
      if (b.key === UNMAPPED)
        return -1;
      return a.league.localeCompare(b.league, "zh");
    });
}
