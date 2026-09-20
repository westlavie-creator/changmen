import type { FootballFollowSelectionKey } from "@/runtime/footballFollowSelectionKey";

export type FootballQuoteSource = "live" | "prefetch" | "http" | "missing";

export type FootballQuoteReader = {
  hasLive?: (venue: string, oddId: string) => boolean;
  getLive?: (venue: string, oddId: string) => number;
  getPrefetch?: (oddId: string) => number;
  getLine?: (oddId: string) => number | null;
};

export type FootballQuote = {
  odds: number;
  line: number | null;
  locked: boolean;
  source: FootballQuoteSource;
};

export type FootballQuoteInput = {
  key: Pick<FootballFollowSelectionKey, "venue" | "oddId" | "line"> | null | undefined;
  fallbackOdds?: number;
  reader?: FootballQuoteReader;
};

function finitePositive(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function fallbackLine(key: FootballQuoteInput["key"]): number | null {
  const n = Number(key?.line);
  return Number.isFinite(n) ? n : null;
}

export function getFootballQuote(input: FootballQuoteInput): FootballQuote {
  const key = input.key;
  const oddId = String(key?.oddId || "").trim();
  const venue = String(key?.venue || "").trim();
  const line = oddId && input.reader?.getLine
    ? input.reader.getLine(oddId) ?? fallbackLine(key)
    : fallbackLine(key);

  if (!key || !oddId || !venue)
    return { odds: 0, line, locked: false, source: "missing" };

  if (input.reader?.hasLive?.(venue, oddId)) {
    const live = Number(input.reader.getLive?.(venue, oddId)) || 0;
    return {
      odds: live > 0 ? live : 0,
      line,
      locked: !(live > 0),
      source: "live",
    };
  }

  const prefetched = finitePositive(input.reader?.getPrefetch?.(oddId));
  if (prefetched > 0)
    return { odds: prefetched, line, locked: false, source: "prefetch" };

  const fallback = finitePositive(input.fallbackOdds);
  if (fallback > 0)
    return { odds: fallback, line, locked: false, source: "http" };

  return { odds: 0, line, locked: false, source: "missing" };
}
