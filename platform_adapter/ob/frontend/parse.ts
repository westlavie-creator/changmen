/** OB 赔率/盘口字段解析（HTTP game/view 与 MQTT 共用） */

export function num(v: unknown): number {
  if (typeof v === "number") return v;
  if (v && typeof (v as { toNumber?: () => number }).toNumber === "function") {
    return (v as { toNumber: () => number }).toNumber();
  }
  return Number(v) || 0;
}

function parseObOddValue(raw: unknown): number {
  if (raw === undefined || raw === null || raw === "") return 0;
  const n = num(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** HTTP `odd`/`odds` 与 MQTT Decimal 字段统一解析 */
export function parseObOddField(odd: unknown): number {
  if (odd && typeof (odd as { toNumber?: () => number }).toNumber === "function") {
    const n = (odd as { toNumber: () => number }).toNumber();
    return Number.isFinite(n) && n > 0 ? n : 0;
  }
  if (typeof odd === "object" && odd !== null && ("odd" in odd || "odds" in odd)) {
    const row = odd as { odd?: unknown; odds?: unknown };
    return parseObOddValue(row.odd ?? row.odds);
  }
  return parseObOddValue(odd);
}

export function obBlockLabel(block: Record<string, unknown>): string {
  const round = num(block.round);
  const cn = String(block.cn_name ?? "").replace(/&nbsp;/g, "");
  return `[${round === 0 ? "全场" : `地图${round}`}]-${cn}`;
}

/** 与 shared/catalog/market_catalog.js obLegacyWinBetName 一致：排除 CS2 手枪局/回合等子盘 */
export function obMainWinBetLabel(label: string): boolean {
  const name = String(label ?? "").trim();
  if (!name || name.includes("+")) return false;
  if (/手枪局/.test(name)) return false;
  if (/第\d+回合/.test(name)) return false;
  if (/^\[地图\d+\]-/.test(name) && !name.includes("单局") && !name.includes("全局")) return false;
  return true;
}

let cachedPattern: string | undefined;
let cachedRe: RegExp | undefined;

/** 缓存 platform.BetName 对应正则，避免每轮 new RegExp */
export function getObBetNameRe(betName: string | undefined): RegExp {
  const pattern = betName || ".*";
  if (cachedPattern === pattern && cachedRe) {
    return cachedRe;
  }
  cachedPattern = pattern;
  cachedRe = new RegExp(pattern);
  return cachedRe;
}

/**
 * Client_GetMatchs 的 GameID（A8 a8GameId）→ OB 平台 game_id。
 * 主盘 odd_type 映射已随 A8 多盘口采集移除；见 market_catalog.json。
 */
const OB_GAME_ID_BY_A8_GAME_ID: Record<string, string> = {
  "1": "257154660915053",
  "2": "257289795134339",
  "3": "257578064923863",
  "4": "257561197207055",
  "8": "271192272576750",
};

export function obPlatformGameIdFromClientGameId(
  clientGameId: number | string | undefined,
): string | undefined {
  if (clientGameId == null || clientGameId === "") return undefined;
  return OB_GAME_ID_BY_A8_GAME_ID[String(clientGameId)];
}
