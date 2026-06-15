/** 对齐 A8 bundle `Pr.exchange` / `Pr.getExchange` */
export const Currency = {
  CNY: "CNY",
  USDT: "USDT",
} as const;

export type CurrencyCode = (typeof Currency)[keyof typeof Currency];

const EXCHANGE = new Map<string, number>([
  [Currency.CNY, 1],
  [Currency.USDT, 7],
]);

export function getExchange(currency?: string | null): number {
  return EXCHANGE.get(currency ?? Currency.CNY) ?? 1;
}

export const MONEY_CURRENCIES: CurrencyCode[] = [Currency.CNY, Currency.USDT];
