/**
 * [changmen 扩展] PB 影子旁显：镜像官网观测板；主价 / fo **坚决不动**。
 *
 * 官网源（主路径，UI 只显示 M）：
 * - sports-websocket UPDATE_ODDS（与 updateOdds 同门控：truthy oddFm 才写；空不擦 → 板卡仍带旧字）
 * - 官网同源 euro/odds moneyLine（HTTP 全量：按 event 对齐 period 卡）
 *
 * 影子表 = 当前板的精确镜像（非空板整表重建）。不做 fo 种子、不做 rot 互拷。
 */
import { selectionId } from "./parse";

export type PbWsShadowSource = "H" | "M";

export type PbWsShadowEntry = {
  odds: number;
  /** 官网原始展示串（优先原样旁显，避免 toFixed 扭曲） */
  text?: string;
  isLock: boolean;
  time: number;
  /** M=官网源；H 仅兼容旧数据，UI 不展示 H */
  source: PbWsShadowSource;
};

type ShadowState = {
  byOddId: Map<string, PbWsShadowEntry>;
  listeners: Set<() => void>;
  revision: number;
};

const STATE_KEY = "__CM_PB_WS_SHADOW_STATE__";

function state(): ShadowState {
  const g = globalThis as typeof globalThis & { [STATE_KEY]?: ShadowState };
  if (!g[STATE_KEY]) {
    g[STATE_KEY] = {
      byOddId: new Map(),
      listeners: new Set(),
      revision: 0,
    };
  }
  return g[STATE_KEY]!;
}

function notify(): void {
  const s = state();
  s.revision += 1;
  for (const listener of s.listeners) listener();
}

function sameEntry(a: PbWsShadowEntry, b: PbWsShadowEntry): boolean {
  return (
    a.odds === b.odds
    && a.isLock === b.isLock
    && a.source === b.source
    && (a.text || "") === (b.text || "")
  );
}

export function getPbWsShadowRevision(): number {
  return state().revision;
}

export function subscribePbWsShadow(listener: () => void): () => void {
  const s = state();
  s.listeners.add(listener);
  return () => s.listeners.delete(listener);
}

export function getPbWsShadow(oddId: string): PbWsShadowEntry | undefined {
  return state().byOddId.get(String(oddId));
}

export function parsePbSelectionId(
  oddId: string,
): { eventId: string; map: number; side: "HOME" | "AWAY" } | null {
  const parts = String(oddId || "").split("|");
  if (parts.length < 4) return null;
  const map = Number(parts[1]);
  const homeBit = Number(parts[3]);
  if (!Number.isFinite(map) || (homeBit !== 0 && homeBit !== 1)) return null;
  return {
    eventId: parts[0]!,
    map,
    side: homeBit === 0 ? "HOME" : "AWAY",
  };
}

export type PbWsShadowResolveHit = {
  oddId: string;
  wantMap: number | null;
  oddIdMap: number | null;
  side: "HOME" | "AWAY" | null;
  skippedOddIdPeriodMismatch: boolean;
  odds?: number;
  isLock?: boolean;
  source?: PbWsShadowSource;
  via: "none" | "oddId";
  key?: string;
};

function noteResolveHit(hit: PbWsShadowResolveHit): void {
  try {
    const g = globalThis as {
      __CM_PB_SHADOW_LAST_RESOLVE__?: PbWsShadowResolveHit;
      __CM_PB_SHADOW_RESOLVE_LOG__?: PbWsShadowResolveHit[];
    };
    g.__CM_PB_SHADOW_LAST_RESOLVE__ = hit;
    const log = g.__CM_PB_SHADOW_RESOLVE_LOG__ || (g.__CM_PB_SHADOW_RESOLVE_LOG__ = []);
    log.push(hit);
    while (log.length > 40) log.shift();
  } catch {
    /* ignore */
  }
}

/**
 * S1：只认 oddId（= HomeID/AwayID）精确键；period 与行不一致则空。
 * `matchId` 参数若传入一律忽略（兼容旧调用方）。
 */
export function resolvePbWsShadow(opts: {
  oddId: string;
  /** @deprecated S1 起忽略；勿用 Matchs.PB 回退 */
  matchId?: string;
  map?: number;
}): PbWsShadowEntry | undefined {
  const parsed = parsePbSelectionId(opts.oddId);
  const side = parsed?.side ?? null;
  const wantMap = opts.map ?? parsed?.map ?? null;
  const hit: PbWsShadowResolveHit = {
    oddId: String(opts.oddId || ""),
    wantMap,
    oddIdMap: parsed?.map ?? null,
    side,
    skippedOddIdPeriodMismatch: false,
    via: "none",
  };

  if (!parsed || !side) {
    noteResolveHit(hit);
    return undefined;
  }

  if (wantMap != null && parsed.map !== Number(wantMap)) {
    hit.skippedOddIdPeriodMismatch = true;
    noteResolveHit(hit);
    return undefined;
  }

  const entry = getPbWsShadow(opts.oddId);
  if (entry) {
    hit.via = "oddId";
    hit.key = String(opts.oddId);
    hit.odds = entry.odds;
    hit.isLock = entry.isLock;
    hit.source = entry.source;
  }
  noteResolveHit(hit);
  return entry;
}

export function savePbWsShadow(
  oddId: string,
  entry: { odds: number; isLock: boolean; time?: number; source?: PbWsShadowSource; text?: string },
): void {
  const s = state();
  const id = String(oddId);
  const prev = s.byOddId.get(id);
  const next: PbWsShadowEntry = {
    odds: entry.odds,
    text: entry.text,
    isLock: entry.isLock,
    time: entry.time ?? Date.now(),
    source: entry.source ?? "M",
  };
  if (prev && sameEntry(prev, next)) return;
  s.byOddId.set(id, next);
  notify();
}

/**
 * @deprecated 勿再用 changmen fo 灌影子；保留空操作以免旧调用方炸。
 * 影子只认官网板（WS / 官网 euro/odds）。
 */
export function seedPbWsShadowFromHttp(_oddId: string, _odds: number): void {
  /* no-op：禁止 fo 冒充官网价 */
}

export function clearPbWsShadow(): void {
  const s = state();
  if (!s.byOddId.size) return;
  s.byOddId.clear();
  notify();
}

export function listPbWsShadowIds(): string[] {
  return [...state().byOddId.keys()];
}

/** 调试：指定来源的 oddId 列表 */
export function listPbWsShadowIdsBySource(source: PbWsShadowSource): string[] {
  const out: string[] = [];
  for (const [id, e] of state().byOddId) {
    if (e.source === source) out.push(id);
  }
  return out;
}

/** 调试：旁显表里 H/M 各多少（如实统计，不筛） */
export function countPbWsShadowBySource(): { H: number; M: number; other: number; total: number } {
  let H = 0;
  let M = 0;
  let other = 0;
  for (const e of state().byOddId.values()) {
    if (e.source === "H") H += 1;
    else if (e.source === "M") M += 1;
    else other += 1;
  }
  return { H, M, other, total: H + M + other };
}

/** @deprecated 价格旁显不再用 rot 互拷；保留空实现以免旧 import 炸 */
export function rememberPbRotEvent(
  _eventId: string | number,
  _rotNum: string | undefined | null,
): void {
  /* no-op */
}

export type PbWsBoardCard = {
  eventId?: string | number;
  period?: number;
  betType?: number;
  rotNum?: string;
  home?: string | null;
  away?: string | null;
  homeLocked?: boolean;
  awayLocked?: boolean;
  homeAlt?: unknown;
  awayAlt?: unknown;
  /** 该侧价格上次因板写入变化的时间；缺省则本轮 now */
  homePriceAt?: number;
  awayPriceAt?: number;
};

/**
 * [A8/官网可证实] updateOdds：仅 truthy oddFm 写入；空价不擦格。
 * 板卡上仍带旧展示字时，镜像进影子。
 */
function putSide(
  next: Map<string, PbWsShadowEntry>,
  eventId: string | number,
  period: number,
  side: "HOME" | "AWAY",
  price: string | null | undefined,
  priceAt: number | undefined,
  now: number,
): void {
  if (price == null || price === "") return;
  const odds = Number(price);
  if (!Number.isFinite(odds) || !(odds > 0)) return;
  const at =
    priceAt != null && Number.isFinite(priceAt) && priceAt > 0 ? Number(priceAt) : now;
  next.set(selectionId(eventId, period, side), {
    odds,
    text: String(price),
    isLock: false,
    time: at,
    source: "M",
  });
}

/**
 * 影子 = 当前观测板镜像。
 * - 空 cards：保持原表（poll 空板不闪断）
 * - 非空：整表重建为板上有展示价的格（板已按官网 WS 补丁 / euro 全量对齐）
 */
export function replacePbWsShadowFromBoard(cards: PbWsBoardCard[] | null | undefined): void {
  if (!Array.isArray(cards) || !cards.length) return;

  const s = state();
  const next = new Map<string, PbWsShadowEntry>();
  const now = Date.now();

  for (const card of cards) {
    const eventId = card.eventId;
    const period = Number(card.period);
    if (eventId == null || eventId === "" || !Number.isFinite(period)) continue;
    if (card.betType != null && Number(card.betType) !== 1) continue;

    const eid = String(eventId);
    const takeHome = Number(card.homeAlt) !== 1;
    const takeAway = Number(card.awayAlt) !== 1;
    if (!takeHome && !takeAway) continue;

    if (takeHome) {
      putSide(next, eid, period, "HOME", card.home, card.homePriceAt, now);
    }
    if (takeAway) {
      putSide(next, eid, period, "AWAY", card.away, card.awayPriceAt, now);
    }
  }

  let changed = next.size !== s.byOddId.size;
  if (!changed) {
    for (const [id, entry] of next) {
      const prev = s.byOddId.get(id);
      if (!prev || !sameEntry(prev, entry)) {
        changed = true;
        break;
      }
    }
    if (!changed) {
      for (const id of s.byOddId.keys()) {
        if (!next.has(id)) {
          changed = true;
          break;
        }
      }
    }
  }
  if (!changed) return;

  s.byOddId.clear();
  for (const [id, entry] of next) s.byOddId.set(id, entry);
  notify();
}

export function resetPbWsShadowForTests(): void {
  const s = state();
  s.byOddId.clear();
  s.revision = 0;
  s.listeners.clear();
}
