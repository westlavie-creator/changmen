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
import { readLocalSportObSession } from "@/runtime/obSportSessionLocal";
import { startObSportWs, type ObSportSessionLite } from "@/runtime/obSportWs";
import { SPORT_OB_SESSION_UPDATED } from "@/runtime/sportObSessionEvents";

/** 与电竞 Polymarket 采集窗一致：过去 6h + 未来 1h */
const SPORT_LIVE_PAST_MS = 6 * 3600 * 1000;
const SPORT_LIVE_FUTURE_MS = 3600 * 1000;
/** 体育侧硬顶；与电竞 token 合并订，控制 WS 帧量 */
export const SPORT_SUBSCRIBE_HARD_CAP = 100;

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
}

/**
 * 从当前板列表挑出要订的 token（时间窗 + 硬顶）。
 * 按 |StartTime - now| 近者优先。
 */
export function pickSportSubscribeIds(
  matches: ViewMatch[],
  cap = SPORT_SUBSCRIBE_HARD_CAP,
  now = Date.now(),
): SportSubscribePick {
  const scored = matches
    .map(m => ({ m, start: Number(m.startAt) || 0 }))
    .filter(x => startTimeAllowed(x.start, now))
    .sort((a, b) => Math.abs(a.start - now) - Math.abs(b.start - now));

  const pm = new Set<string>();
  const pf = new Set<string>();
  const ob = new Set<string>();
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
    if (used >= cap)
      break;
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
          tryAdd(ob, home);
          tryAdd(ob, away);
          tryAdd(ob, String(item.drawSubscribeId || "").trim());
        }
      }
    }
  }

  return {
    polymarketAssetIds: [...pm],
    predictFunMarketIds: [...pf],
    obOids: [...ob],
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
export function startSportLiveOddsSession(getMatches: () => ViewMatch[]): SportLiveOddsSession {
  const sportOdds = useSportOddsStore();
  let stopped = false;
  let obSession: ObSportSessionLite | null = null;

  const obWs = startObSportWs(
    () => obSession,
    (oid, decimalOdds) => {
      if (stopped)
        return;
      sportOdds.save(OB, oid, decimalOdds);
      applyQuoteToMatches(getMatches(), OB, oid, decimalOdds);
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

  const sync = (force = false) => {
    if (stopped)
      return;
    const pick = pickSportSubscribeIds(getMatches());
    setPolymarketSportAssetIds(pick.polymarketAssetIds, force);
    setPredictFunSportMarketIds(pick.predictFunMarketIds, force);
    void loadObSession().then(() => {
      if (!stopped)
        obWs.sync(pick.obOids);
    });

    // 列表重刷后用缓存价回写 fallback，避免 30s 快照盖掉实时价
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
          if (h > 0)
            item.fallbackHomeOdds = h;
          if (a > 0)
            item.fallbackAwayOdds = a;
          if (d > 0)
            item.fallbackDrawOdds = d;
        }
      }
    }
  };

  const unPm = onPolymarketSportQuote((q) => {
    if (stopped)
      return;
    const odds = decimalOddsFromProbability(q.bestAsk);
    if (!(odds > 0))
      return;
    sportOdds.save(PM, q.assetId, odds);
    applyQuoteToMatches(getMatches(), PM, q.assetId, odds);
  });

  const unPf = onPredictFunSportQuote((q) => {
    if (stopped)
      return;
    const odds = decimalOddsFromProbability(q.bestAsk);
    if (!(odds > 0))
      return;
    sportOdds.save(PF, q.marketId, odds);
    applyQuoteToMatches(getMatches(), PF, q.marketId, odds);
  });

  // collector (re)bind：立刻 force sync，修好 clear*Hub 后价僵
  const unPmBound = onPolymarketSportHubBound(() => {
    if (!stopped)
      sync(true);
  });
  const unPfBound = onPredictFunSportHubBound(() => {
    if (!stopped)
      sync(true);
  });

  const onSportObSession = () => {
    if (!stopped)
      void loadObSession().then(() => {
        if (!stopped)
          sync(true);
      });
  };
  if (typeof window !== "undefined")
    window.addEventListener(SPORT_OB_SESSION_UPDATED, onSportObSession);

  sync();

  return {
    sync,
    stop: () => {
      if (stopped)
        return;
      stopped = true;
      unPm();
      unPf();
      unPmBound();
      unPfBound();
      if (typeof window !== "undefined")
        window.removeEventListener(SPORT_OB_SESSION_UPDATED, onSportObSession);
      obWs.stop();
      sportOdds.clear();
      clearPolymarketSportHub();
      setPredictFunSportMarketIds([]);
    },
  };
}
