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

function rawGame(game: string | undefined): string {
  return String(game || "").trim();
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

/** 分组键：英超 / epl / 试玩全称合成同一联赛，对不上 catalog 的用原文。 */
export function footballLeagueKey(game: string | undefined): string {
  const raw = rawGame(game);
  if (!raw || raw === UNMAPPED)
    return UNMAPPED;
  return resolveGameCode(raw) || codeFromLeagueText(raw) || raw;
}

/** 卡片/分组标题：catalog 码显示中文名；试玩 tn/tnjc 原文保留。 */
export function footballLeagueLabel(game: string | undefined): string {
  const raw = rawGame(game);
  if (!raw || raw === UNMAPPED)
    return UNMAPPED_LABEL;
  const key = footballLeagueKey(raw);
  if (key === UNMAPPED)
    return UNMAPPED_LABEL;
  if (raw === key)
    return getGameDisplayName(key) || raw;
  return raw;
}

export function footballLeagueTag(game: string | undefined): string {
  const label = footballLeagueLabel(game);
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
    const key = footballLeagueKey(m.game);
    let g = map.get(key);
    if (!g) {
      g = { key, league: footballLeagueLabel(m.game), matches: [] };
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
