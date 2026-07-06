/** 对齐 A8 bundle `Pr.exchange` / `Pr.getExchange` / `Pr.getCurrency` */
export const Currency = {
  CNY: "CNY",
  USDT: "USDT",
} as const;

export type CurrencyCode = (typeof Currency)[keyof typeof Currency];

const EXCHANGE = new Map<string, number>([
  [Currency.CNY, 1],
  [Currency.USDT, 6.8],
]);

export function getExchange(currency?: string | null): number {
  return EXCHANGE.get(currency ?? Currency.CNY) ?? 1;
}

/** 对齐 A8 `Pr.getCurrency` */
export function getCurrency(raw?: string | null): CurrencyCode {
  if (!raw)
    return Currency.CNY;
  switch (raw) {
    case "CNY":
    case "RMB":
      return Currency.CNY;
    case "USD":
    case "USDT":
      return Currency.USDT;
    default:
      return Currency.CNY;
  }
}

export const MONEY_CURRENCIES: CurrencyCode[] = [Currency.CNY, Currency.USDT];

/** 场馆 USDT/USDC 原币 → Plan CNY 展示口径（对齐 A8 `uv.getBalance` × exchange） */
export function scaleUsdtToCnyDisplay(usdt: number): number {
  if (!Number.isFinite(usdt))
    return 0;
  return usdt * getExchange(Currency.USDT);
}
