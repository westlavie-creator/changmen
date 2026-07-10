import { POLYMARKET_CLOB_API } from "./api";
import { polymarketPluginGet } from "./transport";

/**
 * CLOB `GET /clob-markets/{condition_id}` 的 `sd`（seconds delay）。
 * 官方 [Order Lifecycle](https://docs.polymarket.com/concepts/order-lifecycle)：
 * 体育/比赛盘 marketable 单进入异步 delay 窗，时长由市场配置；加密 taker delay 250ms 且 API 同步等到结果。
 */
export interface PolymarketClobMarketDelayInfo {
  /** 秒；缺省/非法时按体育常见 1s */
  secondsDelay: number;
  /** 加密/金融 up-down taker delay 开关（官方 `itode`） */
  takerOrderDelayEnabled: boolean;
}

const DEFAULT_SPORTS_SECONDS_DELAY = 1;
const MAX_SECONDS_DELAY = 30;
const CACHE_TTL_MS = 5 * 60_000;

const delayCache = new Map<string, { info: PolymarketClobMarketDelayInfo; expiresAt: number }>();

function clampSecondsDelay(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0)
    return DEFAULT_SPORTS_SECONDS_DELAY;
  return Math.min(MAX_SECONDS_DELAY, Math.max(0, Math.floor(n)));
}

/** 解析 CLOB market 行（`sd` / `itode`） */
export function parsePolymarketClobMarketDelay(
  row: { sd?: unknown; itode?: unknown } | null | undefined,
): PolymarketClobMarketDelayInfo {
  return {
    secondsDelay: clampSecondsDelay(row?.sd),
    takerOrderDelayEnabled: Boolean(row?.itode),
  };
}

/**
 * 拉取市场 seconds-delay；失败时回落默认 1s（体育常见值，与官网示例一致）。
 * 结果短缓存，避免同盘连单重复打 CLOB。
 */
export async function fetchPolymarketMarketSecondsDelay(
  conditionId: string,
): Promise<PolymarketClobMarketDelayInfo> {
  const id = String(conditionId ?? "").trim();
  if (!id) {
    return {
      secondsDelay: DEFAULT_SPORTS_SECONDS_DELAY,
      takerOrderDelayEnabled: false,
    };
  }

  const now = Date.now();
  const hit = delayCache.get(id);
  if (hit && hit.expiresAt > now)
    return hit.info;

  try {
    const row = await polymarketPluginGet<{ sd?: unknown; itode?: unknown }>(
      `${POLYMARKET_CLOB_API}/clob-markets/${id}`,
    );
    const info = parsePolymarketClobMarketDelay(row);
    delayCache.set(id, { info, expiresAt: now + CACHE_TTL_MS });
    return info;
  }
  catch {
    return {
      secondsDelay: DEFAULT_SPORTS_SECONDS_DELAY,
      takerOrderDelayEnabled: false,
    };
  }
}

/** 单测 / 登出：清 delay 缓存 */
export function clearPolymarketMarketDelayCache(): void {
  delayCache.clear();
}

/**
 * 按官方 `sd` 生成 delayed 轮询参数：
 * - 先等满 delay 窗（`initialDelayMs = sd * 1000`）
 * - 再按 1s 间隔轮询 order 端点，覆盖接口滞后（默认再等 sd+8 次）
 */
export function buildPolymarketDelayedPollOpts(secondsDelay: number): {
  initialDelayMs: number;
  intervalMs: number;
  maxAttempts: number;
} {
  const sd = clampSecondsDelay(secondsDelay);
  const initialDelayMs = Math.max(1_000, sd * 1_000);
  // delay 窗结束后再给 order/trades 滞后缓冲：至少 8s，且不少于 2×sd
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
