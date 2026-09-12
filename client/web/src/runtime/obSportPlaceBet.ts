/**
 * 熊猫体育单注（yewu13 betOrder），不是电竞 OB 下单接口。
 * 不写 fo，不进电竞主循环。
 *
 * 路径对齐官网 PC `API_PREFIX_ORDER=yewu13`（与已证实的 `yewu11` JOB 同套前缀）。
 * 预检失败把官网文案抛出，不静默换电竞接口。
 */
import { postObSportPb } from "@/runtime/obSportFootballFetch";
import { olOdds } from "@/runtime/obSportOdds";

export const OB_SPORT_QUERY_MARKET_PATH = "/yewu13/v1/betOrder/queryLatestMarketInfoPB";
export const OB_SPORT_PROCESS_BET_PATH = "/yewu13/v1/betOrder/processBetPB";

export type ObSportPlaceRequest = {
  oid: string;
  mid: string;
  odds: number;
  stake: number;
  minOdds?: number;
};

export type ObSportPlaceResult =
  | { ok: true; orderId: string }
  | { ok: false; message: string };

export type ObSportMarketInfo = {
  oid: string;
  mid: string;
  hid: string;
  hpid: string;
  odds: number;
  minStake: number;
  maxStake: number;
  matchType: number;
};

function asRecord(raw: unknown): Record<string, unknown> | null {
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : null;
}

function nested(raw: unknown): Record<string, unknown> {
  const row = asRecord(raw) || {};
  const data = asRecord(row.data);
  return data || row;
}

function firstRow(raw: unknown): Record<string, unknown> | null {
  if (Array.isArray(raw)) {
    const hit = raw.find(item => item && typeof item === "object");
    return asRecord(hit);
  }
  return asRecord(raw);
}

function recId(rec: Record<string, unknown>): string {
  return String(rec.oid || rec.playOptionId || rec.id || "").trim();
}

function findOidRecord(raw: unknown, oid: string, depth = 0): Record<string, unknown> | null {
  if (depth > 8 || raw == null)
    return null;
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const hit = findOidRecord(item, oid, depth + 1);
      if (hit)
        return hit;
    }
    return null;
  }
  const rec = asRecord(raw);
  if (!rec)
    return null;
  if (oid && recId(rec) === oid)
    return rec;
  for (const value of Object.values(rec)) {
    if (value && typeof value === "object") {
      const hit = findOidRecord(value, oid, depth + 1);
      if (hit)
        return hit;
    }
  }
  return null;
}

export function pickObSportMarketInfo(decoded: unknown, oid: string): ObSportMarketInfo | null {
  const want = String(oid || "").trim();
  const hit = findOidRecord(decoded, want) || findOidRecord(nested(decoded), want);
  if (!hit)
    return null;
  const fromOl = olOdds(hit);
  const raw = Number(hit.odds ?? hit.od);
  const fromNum = Number.isFinite(raw)
    ? (raw > 1000 ? raw / 100_000 : raw)
    : 0;
  const odds = fromOl > 1 ? fromOl : fromNum;
  const ms = Number(hit.ms ?? hit.matchType);
  return {
    oid: recId(hit) || want,
    mid: String(hit.mid || hit.matchInfoId || hit.matchId || "").trim(),
    hid: String(hit.hid || hit.marketId || "").trim(),
    hpid: String(hit.hpid || hit.playId || hit.chpid || "").trim(),
    odds: Number.isFinite(odds) ? odds : 0,
    minStake: Number(hit.minBet || hit.minStake || hit.smin || 0) || 0,
    maxStake: Number(hit.maxBet || hit.maxStake || hit.smax || 0) || 0,
    matchType: ms === 1 || ms === 2 ? ms : 1,
  };
}

export function buildObSportProcessBetBody(opts: {
  oid: string;
  mid: string;
  hid: string;
  hpid: string;
  odds: number;
  stake: number;
  matchType?: number;
}): Record<string, unknown> {
  return {
    acceptOdds: 1,
    deviceType: 1,
    currencyId: 1,
    openMilt: 0,
    betMultiple: 1,
    seriesOrders: [{
      seriesType: 1,
      seriesSum: 1,
      fullBet: 0,
      orderDetailList: [{
        sportId: 1,
        marketId: Number(opts.hid) || opts.hid,
        matchInfoId: Number(opts.mid) || opts.mid,
        playId: Number(opts.hpid) || opts.hpid,
        playOptionId: opts.oid,
        odds: opts.odds,
        oddsType: 1,
        betAmount: opts.stake,
        matchType: opts.matchType === 2 ? 2 : 1,
        placeNum: 1,
      }],
    }],
  };
}

function orderIdFrom(decoded: unknown): string {
  const row = nested(decoded);
  const first = firstRow(row.orderNos) || firstRow(row.orders) || firstRow(row.orderList) || row;
  return String(first?.orderNo || first?.orderId || first?.id || "").trim();
}

export async function placeObSportSingle(req: ObSportPlaceRequest): Promise<ObSportPlaceResult> {
  const oid = String(req.oid || "").trim();
  const stake = Number(req.stake);
  const mid = String(req.mid || "").trim();
  const minOdds = Number(req.minOdds) || 0;
  if (!oid)
    return { ok: false, message: "无 oid" };
  if (!(stake > 0))
    return { ok: false, message: "注码未设" };
  try {
    const queried = await postObSportPb(OB_SPORT_QUERY_MARKET_PATH, { id: oid });
    const info = pickObSportMarketInfo(queried, oid);
    if (!info?.oid)
      return { ok: false, message: "预检未返回盘口" };
    if (!info.hid || !info.hpid)
      return { ok: false, message: "预检缺 hid/hpid" };
    const odds = info.odds > 1 ? info.odds : Number(req.odds) || 0;
    if (!(odds > 1))
      return { ok: false, message: "预检无赔率" };
    if (minOdds > 1 && odds + 1e-6 < minOdds)
      return { ok: false, message: `预检 ${odds} 低于门槛 ${minOdds}` };
    if (info.minStake > 0 && stake < info.minStake)
      return { ok: false, message: `低于最小额 ${info.minStake}` };
    if (info.maxStake > 0 && stake > info.maxStake)
      return { ok: false, message: `超过最大额 ${info.maxStake}` };
    const body = buildObSportProcessBetBody({
      oid: info.oid,
      mid: info.mid || mid,
      hid: info.hid,
      hpid: info.hpid,
      odds,
      stake,
      matchType: info.matchType,
    });
    if (!body || !(Number((body.seriesOrders as Array<{ orderDetailList: unknown[] }>)[0]?.orderDetailList?.length) > 0))
      return { ok: false, message: "下单包为空" };
    const placed = await postObSportPb(OB_SPORT_PROCESS_BET_PATH, body);
    return { ok: true, orderId: orderIdFrom(placed) };
  }
  catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, message: msg.slice(0, 180) || "下单失败" };
  }
}
