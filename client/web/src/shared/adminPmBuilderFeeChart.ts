export type BuilderFeeTradeLike = {
  matchTime?: number | null;
  sizeUsdc?: number;
  feeUsdc?: number;
  builderFeeUsdc?: number;
  side?: string;
  makerUserName?: string;
};

export type DayFeeBucket = {
  day: number;
  key: string;
  tradeCount: number;
  volumeUsdc: number;
  feeUsdc: number;
  builderFeeUsdc: number;
  buyBuilderFeeUsdc: number;
  sellBuilderFeeUsdc: number;
};

export type DayFeeSeriesKey = Exclude<keyof DayFeeBucket, "day" | "key">;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function currentMonthKey(d = new Date()): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

export function parseMonthKey(monthKey: string, fallback = new Date()): { y: number; m: number } {
  const parts = String(monthKey || "").split("-").map(Number);
  const y = parts[0];
  const m = parts[1];
  if (Number.isFinite(y) && y >= 1970 && Number.isFinite(m) && m >= 1 && m <= 12)
    return { y, m };
  return { y: fallback.getFullYear(), m: fallback.getMonth() + 1 };
}

export function formatMonthKey(y: number, m: number): string {
  return `${y}-${pad2(m)}`;
}

export function shiftMonthKey(monthKey: string, deltaMonths: number): string {
  const { y, m } = parseMonthKey(monthKey);
  const d = new Date(y, m - 1 + deltaMonths, 1);
  return formatMonthKey(d.getFullYear(), d.getMonth() + 1);
}

export function daysInMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate();
}

export function localDayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function emptyBucket(day: number, key: string): DayFeeBucket {
  return {
    day,
    key,
    tradeCount: 0,
    volumeUsdc: 0,
    feeUsdc: 0,
    builderFeeUsdc: 0,
    buyBuilderFeeUsdc: 0,
    sellBuilderFeeUsdc: 0,
  };
}

/** 按本地自然日把成交归入指定月份；缺日补 0，月外成交丢弃 */
export function aggregateBuilderFeesByDay(
  trades: BuilderFeeTradeLike[],
  monthKey: string,
): DayFeeBucket[] {
  const { y, m } = parseMonthKey(monthKey);
  const n = daysInMonth(y, m);
  const buckets: DayFeeBucket[] = [];
  const byKey = new Map<string, DayFeeBucket>();
  for (let day = 1; day <= n; day++) {
    const key = `${formatMonthKey(y, m)}-${pad2(day)}`;
    const bucket = emptyBucket(day, key);
    buckets.push(bucket);
    byKey.set(key, bucket);
  }
  for (const t of trades) {
    const ms = Number(t.matchTime) || 0;
    if (!ms)
      continue;
    const bucket = byKey.get(localDayKey(ms));
    if (!bucket)
      continue;
    const size = Number(t.sizeUsdc) || 0;
    const fee = Number(t.feeUsdc) || 0;
    const builderFee = Number(t.builderFeeUsdc) || 0;
    bucket.tradeCount += 1;
    bucket.volumeUsdc += size;
    bucket.feeUsdc += fee;
    bucket.builderFeeUsdc += builderFee;
    if (t.side === "BUY")
      bucket.buyBuilderFeeUsdc += builderFee;
    else if (t.side === "SELL")
      bucket.sellBuilderFeeUsdc += builderFee;
  }
  return buckets;
}

export function sumDayFeeBuckets(buckets: DayFeeBucket[]): Omit<DayFeeBucket, "day" | "key"> {
  const total = emptyBucket(0, "");
  for (const b of buckets) {
    total.tradeCount += b.tradeCount;
    total.volumeUsdc += b.volumeUsdc;
    total.feeUsdc += b.feeUsdc;
    total.builderFeeUsdc += b.builderFeeUsdc;
    total.buyBuilderFeeUsdc += b.buyBuilderFeeUsdc;
    total.sellBuilderFeeUsdc += b.sellBuilderFeeUsdc;
  }
  return {
    tradeCount: total.tradeCount,
    volumeUsdc: total.volumeUsdc,
    feeUsdc: total.feeUsdc,
    builderFeeUsdc: total.builderFeeUsdc,
    buyBuilderFeeUsdc: total.buyBuilderFeeUsdc,
    sellBuilderFeeUsdc: total.sellBuilderFeeUsdc,
  };
}

export function maxSeriesValue(buckets: DayFeeBucket[], keys: DayFeeSeriesKey[]): number {
  let max = 0;
  for (const b of buckets) {
    for (const key of keys)
      max = Math.max(max, Number(b[key]) || 0);
  }
  return max;
}
