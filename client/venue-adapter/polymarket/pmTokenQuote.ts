/**
 * PM 写 fo 的唯一入口（采集 WS + 预检 book 纠偏共用）。
 */
import type { BetOption } from "@changmen/client-core/models/betOption";
import { getVenueOddsEntry, saveVenueOdds } from "@changmen/client-core/bridge/oddsAccess";
import { PLATFORMS } from "../shared/platforms";
import { decimalOddsFromProbability } from "./parse";
import { isValidClobPrice } from "./pmDetection";

const PLATFORM = PLATFORMS.Polymarket;

/** PM 写 fo：decimal odds 供展示/套利，clobPrice 供预检限价 */
export function saveTokenQuote(
  params: {
    tokenId: string;
    clobPrice: number;
    betId: string;
    side: "home" | "away";
    locked: boolean;
  },
  source: "http" | "mqtt",
) {
  saveVenueOdds(PLATFORM, {
    id: params.tokenId,
    odds: decimalOddsFromProbability(params.clobPrice),
    clobPrice: params.clobPrice,
    isLock: params.locked,
    betId: params.betId,
    side: params.side,
    time: Date.now(),
  }, source);
}

/** 预检/下单：book best ask 高于检测限价时抛出，便于 catch 回写 fo */
export class PolymarketPriceAboveDetectionError extends Error {
  readonly bestAskPrice: number;
  readonly detectionMaxPrice: number;

  constructor(message: string, bestAskPrice: number, detectionMaxPrice: number) {
    super(message);
    this.name = "PolymarketPriceAboveDetectionError";
    this.bestAskPrice = bestAskPrice;
    this.detectionMaxPrice = detectionMaxPrice;
  }
}

export function isPolymarketPriceAboveDetectionError(
  err: unknown,
): err is PolymarketPriceAboveDetectionError {
  return err instanceof PolymarketPriceAboveDetectionError;
}

/**
 * 「盘口价高于检测价」时用 book best ask 纠偏 fo，打断过期便宜价反复触发套利。
 * 仅允许 fo 往更贵（买方更差）方向更新；不改 detection 限价。
 */
export function syncPolymarketFoOnPriceAboveDetection(
  option: BetOption,
  err: PolymarketPriceAboveDetectionError,
): void {
  const bestAsk = err.bestAskPrice;
  const maxPrice = err.detectionMaxPrice;
  if (!isValidClobPrice(bestAsk) || !(bestAsk > maxPrice + 1e-9))
    return;
  const tokenId = String(option.itemId ?? "").trim();
  if (!tokenId)
    return;
  const prev = getVenueOddsEntry(PLATFORM, tokenId);
  const prevClob = Number(prev?.clobPrice);
  if (isValidClobPrice(prevClob) && !(bestAsk > prevClob + 1e-9))
    return;
  const side = prev?.side === "home" || prev?.side === "away"
    ? prev.side
    : (option.target === "Away" ? "away" : "home");
  // 优先保留 fo 已有 betId，避免空字符串覆盖后丢失 betIndex 关联
  const betId = String(prev?.betId || option.betId || "").trim();
  saveTokenQuote({
    tokenId,
    clobPrice: bestAsk,
    betId,
    side,
    // 保留原锁盘；无条目时按未锁写入（book 有 ask 说明仍可成交）
    locked: Boolean(prev?.isLock),
  }, "http");
}
