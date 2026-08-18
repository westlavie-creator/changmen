import { POLYMARKET_CLOB_API } from "./api";
import { polymarketPluginGet } from "./transport";

/**
 * CLOB `GET /clob-markets/{condition_id}` 的 `sd`（seconds delay）。
 * 官方 [Order Lifecycle](https://docs.polymarket.com/concepts/order-lifecycle)：
 * 体育/比赛盘 marketable 单进入异步 delay 窗，时长由市场配置；加密 taker delay 250ms 且 API 同步等到结果。
 * 文档未给出缺省秒数；未知时不得按 1s 收尾（会在窗内 cancel → 假拒单）。
 */
export interface PolymarketClobMarketDelayInfo {
  /** 秒；fromMarket 时为 CLOB `sd`，否则为保守上限 */
  secondsDelay: number;
  /** 加密/金融 up-down taker delay 开关（官方 `itode`） */
  takerOrderDelayEnabled: boolean;
  /** 是否从 CLOB 读到合法 `sd` */
  fromMarket: boolean;
}

const MAX_SECONDS_DELAY = 30;
/** 官方未写缺省 sd。拉失败 / 无 condition_id / 行无 sd → 用上限，避免窗内 FOK 收尾 */
export const UNKNOWN_SPORTS_SECONDS_DELAY = MAX_SECONDS_DELAY;
const CACHE_TTL_MS = 5 * 60_000;

const delayCache = new Map<string, { info: PolymarketClobMarketDelayInfo; expiresAt: number }>();

function clampKnownSecondsDelay(raw: unknown): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0)
    return null;
  return Math.min(MAX_SECONDS_DELAY, Math.floor(n));
}

function unknownDelayInfo(itode = false): PolymarketClobMarketDelayInfo {
  return {
    secondsDelay: UNKNOWN_SPORTS_SECONDS_DELAY,
    takerOrderDelayEnabled: itode,
    fromMarket: false,
  };
}

/** 解析 CLOB market 行（`sd` / `itode`） */
export function parsePolymarketClobMarketDelay(
  row: { sd?: unknown; itode?: unknown } | null | undefined,
): PolymarketClobMarketDelayInfo {
  const itode = Boolean(row?.itode);
  if (row == null || !("sd" in row) || row.sd == null || row.sd === "")
    return unknownDelayInfo(itode);
  const sd = clampKnownSecondsDelay(row.sd);
  if (sd == null)
    return unknownDelayInfo(itode);
  return {
    secondsDelay: sd,
    takerOrderDelayEnabled: itode,
    fromMarket: true,
  };
}

/**
 * 拉取市场 seconds-delay。
 * 失败 / 无 id：fromMarket=false，secondsDelay=30（保守等满，不按 1s 收尾）。
 */
export async function fetchPolymarketMarketSecondsDelay(
  conditionId: string,
): Promise<PolymarketClobMarketDelayInfo> {
  const id = String(conditionId ?? "").trim();
  if (!id)
    return unknownDelayInfo();

  const now = Date.now();
  const hit = delayCache.get(id);
  if (hit && hit.expiresAt > now)
    return hit.info;

  try {
    const row = await polymarketPluginGet<{ sd?: unknown; itode?: unknown }>(
      `${POLYMARKET_CLOB_API}/clob-markets/${id}`,
    );
    const info = parsePolymarketClobMarketDelay(row);
    if (info.fromMarket)
      delayCache.set(id, { info, expiresAt: now + CACHE_TTL_MS });
    return info;
  }
  catch {
    return unknownDelayInfo();
  }
}

/** 单测 / 登出：清 delay 缓存 */
export function clearPolymarketMarketDelayCache(): void {
  delayCache.clear();
}

/**
 * 按官方 `sd` 生成 delayed 轮询参数：
 * - 先等满 delay 窗（`initialDelayMs = sd * 1000`，至少 1s）
 * - 再按 1s 间隔轮询 order 端点，覆盖接口滞后（至少 8s，且不少于 2×sd）
 */
export function buildPolymarketDelayedPollOpts(secondsDelay: number): {
  initialDelayMs: number;
  intervalMs: number;
  maxAttempts: number;
} {
  const known = clampKnownSecondsDelay(secondsDelay);
  const sd = known ?? UNKNOWN_SPORTS_SECONDS_DELAY;
  const initialDelayMs = Math.max(1_000, sd * 1_000);
  const lagBudgetMs = Math.max(8_000, sd * 2_000);
  const intervalMs = 1_000;
  const maxAttempts = Math.max(6, Math.ceil(lagBudgetMs / intervalMs));
  return { initialDelayMs, intervalMs, maxAttempts };
}

/** User WS watch 超时：delay 窗 + REST 轮询预算 + 余量 */
export function buildPolymarketWatchTimeoutMs(secondsDelay: number): number {
  const poll = buildPolymarketDelayedPollOpts(secondsDelay);
  const pollBudgetMs = poll.initialDelayMs + poll.intervalMs * poll.maxAttempts;
  return Math.min(90_000, pollBudgetMs + 10_000);
}

/** Job 缺失 / 无缓存 poll 时：有 condition_id 再拉 sd，否则按未知窗等 */
export async function resolvePolymarketDelayedPollOpts(conditionId?: string): Promise<{
  initialDelayMs: number;
  intervalMs: number;
  maxAttempts: number;
}> {
  const id = String(conditionId ?? "").trim();
  if (!id)
    return buildPolymarketDelayedPollOpts(UNKNOWN_SPORTS_SECONDS_DELAY);
  const info = await fetchPolymarketMarketSecondsDelay(id);
  const sd = info.fromMarket ? info.secondsDelay : UNKNOWN_SPORTS_SECONDS_DELAY;
  return buildPolymarketDelayedPollOpts(sd);
}
