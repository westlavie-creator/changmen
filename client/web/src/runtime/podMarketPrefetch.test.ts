import { describe, expect, it } from "vitest";
import { mergePodBoardMarkets } from "@/runtime/podMarketPrefetch";

describe("pod market prefetch merge", () => {
  it("lets freshly prefetched market fields replace the board snapshot", () => {
    const rows = mergePodBoardMarkets([
      {
        id: 1,
        marketCode: "totals",
        line: 2.5,
        name: "old",
        ob: true,
        quoteHome: 1.8,
        quoteAway: 2,
        quoteDraw: 0,
        oidHome: "old-oid",
        oidAway: "old-away",
      },
    ], [
      {
        id: 2,
        marketCode: "totals",
        line: 2.5,
        name: "fresh",
        ob: true,
        quoteHome: 1.95,
        quoteAway: 1.9,
        quoteDraw: 0,
        oidHome: "fresh-oid",
        oidAway: "fresh-away",
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: "fresh", quoteHome: 1.95, oidHome: "fresh-oid" });
  });
});
