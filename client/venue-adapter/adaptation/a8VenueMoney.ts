/**
 * [A8 适配] 编排 Plan CNY ↔ 场馆原币（CNY / U / PM USDC）
 *
 * 编排层（GetOrderOptions、LoseOrder、jb、anyOdds）只使用 Plan CNY；
 * 仅在 checkBetting 边界与读场馆单时调用本模块，不改动 A8 公式。
 */
import type { PlatformAccount } from "@/models/platformAccount";
import type { VenueOrder } from "@venue/contract";
import {
  getExchange,
  scaleUsdtToCnyDisplay,
} from "@changmen/shared/currency";
import { isPolymarketProvider } from "@changmen/shared/account_multiply";
import { polymarketCnyFromUsdt, polymarketUsdtFromCny } from "@venue/polymarket/pmStake";

function venueToPlanExchange(account: PlatformAccount): number {
  return getExchange(account.currency);
}

/** Plan CNY → 场馆下注 stake（`betGateway.checkBetting` 唯一换算入口） */
export function resolveVenueStakeFromPlanCny(
  account: PlatformAccount,
  planCny: number,
  odds: number,
): number {
  if (isPolymarketProvider(account.provider))
    return polymarketUsdtFromCny(account, planCny, odds);
  return account.getBetMoney(planCny, odds);
}

/** 场馆 stake → Plan CNY（补单入队 / anyOdds 成功腿引用） */
export function resolvePlanCnyFromVenueStake(
  account: PlatformAccount,
  venueStake: number,
): number {
  if (isPolymarketProvider(account.provider))
    return polymarketCnyFromUsdt(venueStake);
  const exchange = venueToPlanExchange(account);
  if (exchange > 1)
    return Math.round(venueStake * exchange);
  return Math.round(venueStake);
}

/** PM 场馆订单 betMoney 可能为 Display CNY 或未 scale 的 USDC */
export function resolvePlanCnyFromVenueOrder(
  account: PlatformAccount,
  order: VenueOrder,
): number {
  const raw = Math.round(Number(order.betMoney) || 0);
  if (!isPolymarketProvider(account.provider))
    return raw;
  const usdc = Number(order.pmStakeUsdc) || 0;
  if (usdc > 0 && raw <= usdc * 1.5)
    return resolvePlanCnyFromVenueStake(account, Math.round(usdc));
  if (usdc > 0 && raw > usdc * 1.5)
    return raw;
  if (raw > 0 && raw < 500)
    return resolvePlanCnyFromVenueStake(account, raw);
  return raw;
}

/** 链上 USDC → UI Display CNY（订单 sync 展示，与 config.betMoney 口径一致） */
export function resolveDisplayCnyFromVenueUsdc(usdc: number): number {
  return scaleUsdtToCnyDisplay(usdc);
}
