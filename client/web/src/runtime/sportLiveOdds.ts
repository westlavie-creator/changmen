import type { ViewBetItem, ViewMatch } from "@/models/match";
import {
  onPolymarketSportHubBound,
  onPolymarketSportQuote,
  setPolymarketSportAssetIds,
  ensurePolymarketSportMarketConnection,
  clearPolymarketSportHub,
} from "@changmen/venue-adapter/polymarket";
import {
  onPredictFunSportHubBound,
  onPredictFunSportQuote,
  setPredictFunSportMarketIds,
} from "@changmen/venue-adapter/predictfun";
import { truncateOddsTo3 } from "@changmen/shared/odds_format";
import { useSportOddsStore } from "@/stores/sportOddsStore";
import { useObSportLiveStore } from "@/stores/obSportLiveStore";
import { createRafTicker } from "@/runtime/rafTick";
import { readLocalSportObSession } from "@/runtime/obSportSessionLocal";
import { startObSportWs, isObSportC8Mid, type ObSportSessionLite } from "@/runtime/obSportWs";
import { SPORT_OB_SESSION_UPDATED } from "@/runtime/sportObSessionEvents";

/** 与足球列表窗对齐：过去 6h + 未来 2h */
const SPORT_LIVE_PAST_MS = 6 * 3600 * 1000;
const SPORT_LIVE_FUTURE_MS = 2 * 3600 * 1000;
/** 体育侧硬顶；与电竞 token 合并订，控制 WS 帧量 */
export const SPORT_SUBSCRIBE_HARD_CAP = 100;
/** C8 订太多 mid 会在连上后倾泻 C105，整页卡死几秒。只订最近若干场。 */
export const SPORT_OB_MID_CAP = 16;

const PM = "Polymarket";
const PF = "PredictFun";
const OB = "OB";

function decimalOddsFromProbability(price: number): number {
  if (!Number.isFinite(price) || price <= 0 || price >= 1)
    return 0;
  return truncateOddsTo3(1 / price);
}

function startTimeAllowed(startMs: number, now = Date.now()): boolean {
  if (!Number.isFinite(startMs) || startMs <= 0)
    return false;
  return startMs >= now - SPORT_LIVE_PAST_MS && startMs <= now + SPORT_LIVE_FUTURE_MS;
}

export interface SportSubscribePick {
  polymarketAssetIds: string[];
  predictFunMarketIds: string[];
  obOids: string[];
  obMids: string[];
}

/**
 * 从当前板列表挑出要订的 token（时间窗 + 硬顶）。
 * 按 |StartTime - now| 近者优先。
 */
export function pickSportSubscribeIds(
  matches: ViewMatch[],
  cap = SPORT_SUBSCRIBE_HARD_CAP,
  now = Date.now(),
  midCap = SPORT_OB_MID_CAP,
): SportSubscribePick {
  const scored = matches
    .map(m => ({ m, start: Number(m.startAt) || 0 }))
    .filter(x => startTimeAllowed(x.start, now))
    .sort((a, b) => Math.abs(a.start - now) - Math.abs(b.start - now));

  const pm = new Set<string>();
  const pf = new Set<string>();
  const ob = new Set<string>();
  const obMids = new Set<string>();
  let used = 0;

  const tryAdd = (set: Set<string>, id: string) => {
    const s = String(id || "").trim();
    if (!s || set.has(s))
      return;
    if (used >= cap)
      return;
    set.add(s);
    used += 1;
  };

  for (const { m } of scored) {
    const obMid = String(m.providers?.OB ?? "").trim();
    if (obMid && isObSportC8Mid(obMid) && obMids.size < midCap)
      obMids.add(obMid);
    if (used >= cap)
      continue;
    for (const bet of m.bets) {
      for (const item of bet.items) {
        // 只用显式 subscribe 键；PF 缺 HomeMarketID 时为空，勿回退到 onChain HomeID
        const home = String(item.homeSubscribeId || "").trim();
        const away = String(item.awaySubscribeId || "").trim();
        if (item.type === PM) {
          tryAdd(pm, home);
          tryAdd(pm, away);
        }
        else if (item.type === PF) {
          // 单盘双 outcome（同 marketId）无法分边，不订 WS，靠列表快照
          if (home && home === away)
            continue;
          tryAdd(pf, home);
          tryAdd(pf, away);
        }
        else if (item.type === OB) {
          tryAdd(ob, home || String(item.homeId || "").trim());
          tryAdd(ob, away || String(item.awayId || "").trim());
          tryAdd(ob, String(item.drawSubscribeId || "").trim());
        }
      }
    }
  }

  return {
    polymarketAssetIds: [...pm],
    predictFunMarketIds: [...pf],
    obOids: [...ob],
    obMids: [...obMids],
  };
}

function patchItemFallback(item: ViewBetItem, subscribeId: string, decimalOdds: number) {
  if (!(decimalOdds > 0))
    return;
  const homeKey = String(item.homeSubscribeId || "").trim();
  const awayKey = String(item.awaySubscribeId || "").trim();
  // PF 单盘双 outcome：同一 marketId，WS bestAsk 无法分主客，保持列表快照
  if (homeKey && homeKey === awayKey)
    return;
  if (homeKey && subscribeId === homeKey)
    item.fallbackHomeOdds = decimalOdds;
  if (awayKey && subscribeId === awayKey)
    item.fallbackAwayOdds = decimalOdds;
  const drawKey = String(item.drawSubscribeId || "").trim();
  if (drawKey && subscribeId === drawKey)
    item.fallbackDrawOdds = decimalOdds;
}

function applyQuoteToMatches(
  matches: ViewMatch[],
  platform: string,
  subscribeId: string,
  decimalOdds: number,
) {
  for (const m of matches) {
    for (const bet of m.bets) {
      for (const item of bet.items) {
        if (item.type !== platform)
          continue;
        patchItemFallback(item, subscribeId, decimalOdds);
      }
    }
  }
}

export type SportLiveOddsSession = {
  sync: (force?: boolean) => void;
  stop: () => void;
};

/**
 * 棒/足 Tab 挂载时启动：登记 hub 订阅、写 sportOddsStore、刷 fallback。
 * 禁止写 fo / saveVenueOdds。
 */
export type SportLiveOddsSessionOptions = {
  /**
   * 棒球板 BetRow 靠改 ViewMatch.fallback + oddsDisplayTick。
   * 足球格子读 sportOddsStore，禁止把推送写回比赛对象（会整场重建盘口树）。
   */
  patchMatchFallback?: boolean;
};

export function startSportLiveOddsSession(
  getMatches: () => ViewMatch[],
  options: SportLiveOddsSessionOptions = {},
): SportLiveOddsSession {
  const patchMatchFallback = options.patchMatchFallback !== false;
  const sportOdds = useSportOddsStore();
  const obLive = useObSportLiveStore();
  let stopped = false;
  let obSession: ObSportSessionLite | null = null;
  const playAt = new Map<string, number>();
  const pendingOdds = new Map<string, number>();
  const pendingLines = new Map<string, number>();
  const flushPendingQuotes = createRafTicker();
  let syncTimer: ReturnType<typeof setTimeout> | null = null;

  const obWs = startObSportWs(
    () => obSession,
    {
      onQuotes(rows) {
        if (stopped || !rows.length)
          return;
        for (const q of rows) {
          pendingOdds.set(q.oid, q.odds);
          if (q.line != null)
            pendingLines.set(q.oid, q.line);
        }
        flushPendingQuotes(() => {
          if (stopped) {
            pendingOdds.clear();
            pendingLines.clear();
            return;
          }
          if (pendingOdds.size) {
            sportOdds.saveMany(OB, [...pendingOdds.entries()].map(([id, odds]) => ({ id, odds })));
            pendingOdds.clear();
          }
          if (pendingLines.size) {
            obLive.saveLines([...pendingLines.entries()].map(([oid, line]) => ({ oid, line })));
            pendingLines.clear();
          }
        });
      },
      onLive(patch) {
        if (stopped)
          return;
        obLive.applyLive(patch);
        if (!patch.refreshList)
          return;
        const known = getMatches().some(m => String(m.providers?.OB || "") === patch.mid);
        if (!known)
          obLive.noteListChange();
      },
      onHandicapPlay(row) {
        if (stopped)
          return;
        const mid = String(row.mid || "").trim();
        if (!mid)
          return;
        const prev = playAt.get(mid) || 0;
        if (Date.now() - prev < 8_000)
          return;
        playAt.set(mid, Date.now());
        obLive.noteHandicapPlay(mid);
      },
    },
  );

  async function loadObSession() {
    try {
      obSession = readLocalSportObSession();
    }
    catch {
      obSession = null;
    }
  }

  // 先连体育 hub，避免无 token 时 PM-S 一直灰；有列表后再 set asset
  ensurePolymarketSportMarketConnection();

  const applySubscribe = (force = false) => {
    if (stopped)
      return;
    const pick = pickSportSubscribeIds(getMatches());
    setPolymarketSportAssetIds(pick.polymarketAssetIds, force);
    setPredictFunSportMarketIds(pick.predictFunMarketIds, force);
    void loadObSession().then(() => {
      if (!stopped)
        obWs.sync(pick.obOids, pick.obMids);
    });

    if (!patchMatchFallback)
      return;

    // 列表重刷后用缓存价回写 fallback，避免 30s 快照盖掉实时价（棒球 BetRow）
    const matches = getMatches();
    for (const m of matches) {
      for (const bet of m.bets) {
        for (const item of bet.items) {
          if (item.type !== PM && item.type !== PF && item.type !== OB)
            continue;
          const homeKey = String(item.homeSubscribeId || "").trim();
          const awayKey = String(item.awaySubscribeId || "").trim();
          const drawKey = String(item.drawSubscribeId || "").trim();
          if (!homeKey && !awayKey && !drawKey)
            continue;
          if (item.type === PF && homeKey && homeKey === awayKey)
            continue;
          const h = homeKey ? sportOdds.get(item.type, homeKey) : 0;
          const a = awayKey ? sportOdds.get(item.type, awayKey) : 0;
          const d = drawKey ? sportOdds.get(item.type, drawKey) : 0;
          if (homeKey && sportOdds.has(item.type, homeKey))
            item.fallbackHomeOdds = h;
          if (awayKey && sportOdds.has(item.type, awayKey))
            item.fallbackAwayOdds = a;
          if (drawKey && sportOdds.has(item.type, drawKey))
            item.fallbackDrawOdds = d;
        }
      }
    }
  };

  const requestSync = (force = false) => {
    if (stopped)
      return;
    if (force) {
      if (syncTimer) {
        clearTimeout(syncTimer);
        syncTimer = null;
      }
      applySubscribe(true);
      return;
    }
    if (syncTimer)
      return;
    syncTimer = setTimeout(() => {
      syncTimer = null;
      if (!stopped)
        applySubscribe(false);
    }, 250);
  };

  const unPm = onPolymarketSportQuote((q) => {
    if (stopped)
      return;
    const odds = decimalOddsFromProbability(q.bestAsk);
    if (!(odds > 0))
      return;
    sportOdds.save(PM, q.assetId, odds);
    if (patchMatchFallback)
      applyQuoteToMatches(getMatches(), PM, q.assetId, odds);
  });

  const unPf = onPredictFunSportQuote((q) => {
    if (stopped)
      return;
    const odds = decimalOddsFromProbability(q.bestAsk);
    if (!(odds > 0))
      return;
    sportOdds.save(PF, q.marketId, odds);
    if (patchMatchFallback)
      applyQuoteToMatches(getMatches(), PF, q.marketId, odds);
  });

  // collector (re)bind：立刻 force sync，修好 clear*Hub 后价僵
  const unPmBound = onPolymarketSportHubBound(() => {
    if (!stopped)
      requestSync(true);
  });
  const unPfBound = onPredictFunSportHubBound(() => {
    if (!stopped)
      requestSync(true);
  });

  const onSportObSession = () => {
    if (!stopped)
      void loadObSession().then(() => {
        if (!stopped)
          requestSync(true);
      });
  };
  if (typeof window !== "undefined")
    window.addEventListener(SPORT_OB_SESSION_UPDATED, onSportObSession);

  applySubscribe();

  return {
    sync: requestSync,
    stop: () => {
      if (stopped)
        return;
      stopped = true;
      if (syncTimer) {
        clearTimeout(syncTimer);
        syncTimer = null;
      }
      pendingOdds.clear();
      pendingLines.clear();
      unPm();
      unPf();
      unPmBound();
      unPfBound();
      if (typeof window !== "undefined")
        window.removeEventListener(SPORT_OB_SESSION_UPDATED, onSportObSession);
      obWs.stop();
      sportOdds.clear();
      obLive.clear();
      clearPolymarketSportHub();
      setPredictFunSportMarketIds([]);
    },
  };
}
