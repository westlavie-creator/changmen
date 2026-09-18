import { getPmMarketWsSourceMode } from "./pmMarketWsMode";
import { resolvePmHttpMode, type PmHttpMode } from "./pmTransportMode";

export type PmBookSource = "direct-live" | "vps-live" | "vps-fallback" | "extension" | "unknown";
export type PmQuoteSource = "ws" | "http-seed" | "book-correct";
export type PmExecutionMetricKind = "quote_to_fo" | "book" | "check" | "sign" | "submit" | "betting";

export interface PmExecutionMetricEntry {
  at: number;
  kind: PmExecutionMetricKind;
  tokenId?: string;
  accountId?: number;
  wsSource: "changmen" | "official";
  httpMode: PmHttpMode;
  ms?: number;
  bookSource?: PmBookSource;
  quoteSource?: PmQuoteSource;
  quotePrice?: number;
  betId?: string;
  side?: "home" | "away";
  rejectReason?: string;
  success?: boolean;
  fallback?: boolean;
  error?: string;
  builderCodePresent?: boolean;
  apiCredsReady?: boolean;
  privateKeyReady?: boolean;
  signatureType?: number;
  funderPresent?: boolean;
  bookReuse?: boolean;
  bookAgeMs?: number;
  reuseRejectReason?: string;
  signWarm?: boolean;
  orderClientCacheHit?: boolean;
}

const MAX_ENTRIES = 300;
const entries: PmExecutionMetricEntry[] = [];

function errorText(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  return raw.slice(0, 240);
}

export function recordPmExecutionMetric(
  entry: Omit<PmExecutionMetricEntry, "at" | "wsSource" | "httpMode">,
): void {
  entries.push({
    at: Date.now(),
    wsSource: getPmMarketWsSourceMode(),
    httpMode: resolvePmHttpMode(),
    ...entry,
  });
  if (entries.length > MAX_ENTRIES)
    entries.splice(0, entries.length - MAX_ENTRIES);
}

export function recordPmQuoteToFoMetric(entry: {
  tokenId?: string;
  betId?: string;
  side?: "home" | "away";
  quotePrice?: number;
  quoteSource: PmQuoteSource;
  success: boolean;
  rejectReason?: string;
  error?: string;
}): void {
  recordPmExecutionMetric({
    kind: "quote_to_fo",
    ...entry,
  });
}

export async function measurePmExecution<T>(
  kind: PmExecutionMetricKind,
  fields: Omit<PmExecutionMetricEntry, "at" | "kind" | "wsSource" | "httpMode" | "ms" | "success" | "error">,
  fn: () => Promise<T>,
): Promise<T> {
  const startedAt = performanceNow();
  try {
    const value = await fn();
    recordPmExecutionMetric({
      ...fields,
      kind,
      ms: elapsedMs(startedAt),
      success: true,
    });
    return value;
  }
  catch (err) {
    recordPmExecutionMetric({
      ...fields,
      kind,
      ms: elapsedMs(startedAt),
      success: false,
      error: errorText(err),
    });
    throw err;
  }
}

function performanceNow(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function elapsedMs(startedAt: number): number {
  return Math.round(performanceNow() - startedAt);
}

export function getPmExecutionMetrics(): readonly PmExecutionMetricEntry[] {
  return entries;
}

export function clearPmExecutionMetrics(): void {
  entries.length = 0;
}
