import { describe, expect, it } from "vitest";
import { finalizeNonPolymarketSave } from "./save_non_pm.js";

describe("finalizeNonPolymarketSave reject share clear", () => {
  it("reject deletes fill/hold shares and does not restore from prev", () => {
    const { raw } = finalizeNonPolymarketSave(
      {
        status: "reject",
        pfNotionalUsdt: 29.41,
        pfBookPrice: 0.69,
      },
      {
        pfShares: 42.19677,
        pfSharesWei: "42196770000000000000",
        pfHoldShares: 42.19677,
        pfNotionalUsdt: 29.41,
      },
      0,
      29.41,
    );
    expect(raw.pfShares).toBeUndefined();
    expect(raw.pfSharesWei).toBeUndefined();
    expect(raw.pfHoldShares).toBeUndefined();
    expect(raw.pfNotionalUsdt).toBe(29.41);
  });

  it("non-reject still preserves pfShares from prev when omitted", () => {
    const { raw } = finalizeNonPolymarketSave(
      { status: "None", pfHoldShares: 40 },
      { pfShares: 42, pfHoldShares: 40 },
      0,
      10,
    );
    expect(raw.pfShares).toBe(42);
    expect(raw.pfHoldShares).toBe(40);
  });

  it("open + empty pfSellOrderId clears stale sell hash", () => {
    const { raw } = finalizeNonPolymarketSave(
      {
        status: "None",
        pfSellState: "open",
        pfSellOrderId: "",
        pfClearSellOrderId: true,
      },
      {
        pfSellState: "closing",
        pfSellOrderId: "0xdead",
      },
      0,
      10,
    );
    expect(raw.pfSellOrderId).toBeUndefined();
    expect(raw.pfClearSellOrderId).toBeUndefined();
  });
});
