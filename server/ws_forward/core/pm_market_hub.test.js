import { describe, expect, test } from "vitest";
import {
  enqueueLatestByAsset,
  extractAssetIdsFromPmMarketMessage,
  extractPmMarketUpgradeToken,
  mergeHubAssetIds,
  pendingRawPriority,
  takePendingRawsDeduped,
} from "./pm_market_hub.js";

describe("pm_market_hub", () => {
  test("extractAssetIdsFromPmMarketMessage book", () => {
    const ids = extractAssetIdsFromPmMarketMessage(JSON.stringify({
      event_type: "book",
      asset_id: "123",
      asks: [{ price: "0.5", size: "1" }],
    }));
    expect([...ids]).toEqual(["123"]);
  });

  test("extractAssetIdsFromPmMarketMessage price_change", () => {
    const ids = extractAssetIdsFromPmMarketMessage(JSON.stringify({
      event_type: "price_change",
      price_changes: [{ asset_id: "a1" }, { asset_id: "a2" }],
    }));
    expect([...ids].sort()).toEqual(["a1", "a2"]);
  });

  test("mergeHubAssetIds unions clients", () => {
    const map = new Map([
      [{}, { assetIds: new Set(["1", "2"]) }],
      [{}, { assetIds: new Set(["2", "3"]) }],
    ]);
    expect([...mergeHubAssetIds(map)].sort()).toEqual(["1", "2", "3"]);
  });

  test("extractAssetIdsFromPmMarketMessage best_bid_ask", () => {
    const ids = extractAssetIdsFromPmMarketMessage(JSON.stringify({
      event_type: "best_bid_ask",
      asset_id: "asset-home",
      best_ask: "0.51",
    }));
    expect([...ids]).toEqual(["asset-home"]);
  });

  test("extractPmMarketUpgradeToken from query", () => {
    expect(extractPmMarketUpgradeToken({
      url: "/esport/ws-forward/PM-MARKET?token=abc%2B1",
      headers: {},
    })).toBe("abc+1");
  });

  test("extractPmMarketUpgradeToken from Bearer", () => {
    expect(extractPmMarketUpgradeToken({
      url: "/esport/ws-forward/PM-MARKET",
      headers: { authorization: "Bearer tok-xyz" },
    })).toBe("tok-xyz");
  });

  test("extractPmMarketUpgradeToken empty", () => {
    expect(extractPmMarketUpgradeToken({
      url: "/esport/ws-forward/PM-MARKET",
      headers: {},
    })).toBe("");
  });

  test("enqueueLatestByAsset keeps latest and counts overwrites", () => {
    const pending = new Map();
    expect(enqueueLatestByAsset(pending, ["a1"], "raw-old")).toBe(0);
    expect(enqueueLatestByAsset(pending, ["a1", "a2"], "raw-new")).toBe(1);
    expect(pending.get("a1")).toBe("raw-new");
    expect(pending.get("a2")).toBe("raw-new");
  });

  test("takePendingRawsDeduped prefers best_bid_ask and dedupes shared raw", () => {
    const pending = new Map();
    const price = JSON.stringify({ event_type: "price_change", price_changes: [{ asset_id: "a1" }] });
    const bba = JSON.stringify({ event_type: "best_bid_ask", asset_id: "a2", best_ask: "0.4" });
    enqueueLatestByAsset(pending, ["a1"], price);
    enqueueLatestByAsset(pending, ["a2"], bba);
    enqueueLatestByAsset(pending, ["a3"], bba);
    expect(pendingRawPriority(bba)).toBeGreaterThan(pendingRawPriority(price));
    const raws = takePendingRawsDeduped(pending);
    expect(raws).toEqual([bba, price]);
    expect(pending.size).toBe(0);
  });

  test("takePendingRawsDeduped empty", () => {
    expect(takePendingRawsDeduped(new Map())).toEqual([]);
  });
});
