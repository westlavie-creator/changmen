import { describe, expect, test } from "vitest";
import {
  buildBatchedPendingPayload,
  enqueueLatestByAsset,
  extractAssetIdsFromPmMarketMessage,
  extractPmMarketUpgradeToken,
  mergeHubAssetIds,
  pendingRawPriority,
  resolvePendingFlushMs,
  resolveSoftBufferedBytes,
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

  test("isPmMarketHubAttached false before attach", async () => {
    const { isPmMarketHubAttached, resetPmMarketHubForTests } = await import("./pm_market_hub.js");
    resetPmMarketHubForTests();
    expect(isPmMarketHubAttached()).toBe(false);
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

  test("buildBatchedPendingPayload empty / single keeps shape", () => {
    expect(buildBatchedPendingPayload([])).toBeNull();
    const one = JSON.stringify({ event_type: "best_bid_ask", asset_id: "a1", best_ask: "0.4" });
    expect(buildBatchedPendingPayload([one])).toBe(one);
  });

  test("buildBatchedPendingPayload multi → one JSON array; latest prices preserved", () => {
    const a1 = JSON.stringify({ event_type: "best_bid_ask", asset_id: "a1", best_ask: "0.41" });
    const a2 = JSON.stringify({ event_type: "best_bid_ask", asset_id: "a2", best_ask: "0.55" });
    const pending = new Map();
    enqueueLatestByAsset(pending, ["a1"], JSON.stringify({ event_type: "best_bid_ask", asset_id: "a1", best_ask: "0.1" }));
    enqueueLatestByAsset(pending, ["a1"], a1);
    enqueueLatestByAsset(pending, ["a2"], a2);
    const raws = takePendingRawsDeduped(pending);
    const payload = buildBatchedPendingPayload(raws);
    expect(payload).toBeTruthy();
    const parsed = JSON.parse(payload);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(2);
    const byId = Object.fromEntries(parsed.map(m => [m.asset_id, m.best_ask]));
    expect(byId).toEqual({ a1: "0.41", a2: "0.55" });
  });

  test("batched array payload is parseable like client extractPolymarketWsBestAsks", () => {
    const raws = [
      JSON.stringify({ event_type: "best_bid_ask", asset_id: "h", best_ask: "0.42" }),
      JSON.stringify({ event_type: "best_bid_ask", asset_id: "a", best_ask: "0.58" }),
    ];
    const payload = buildBatchedPendingPayload(raws);
    const parsed = JSON.parse(payload);
    const messages = Array.isArray(parsed) ? parsed : [parsed];
    const updates = [];
    for (const msg of messages) {
      if (msg.event_type === "best_bid_ask" && msg.asset_id && msg.best_ask !== undefined)
        updates.push({ assetId: String(msg.asset_id), bestAsk: msg.best_ask });
    }
    expect(updates).toEqual([
      { assetId: "h", bestAsk: "0.42" },
      { assetId: "a", bestAsk: "0.58" },
    ]);
    expect([...extractAssetIdsFromPmMarketMessage(payload)].sort()).toEqual(["a", "h"]);
  });

  test("resolvePendingFlushMs defaults to 100; env override", () => {
    const prev = process.env.PM_HUB_PENDING_FLUSH_MS;
    delete process.env.PM_HUB_PENDING_FLUSH_MS;
    expect(resolvePendingFlushMs()).toBe(100);
    process.env.PM_HUB_PENDING_FLUSH_MS = "150";
    expect(resolvePendingFlushMs()).toBe(150);
    if (prev === undefined)
      delete process.env.PM_HUB_PENDING_FLUSH_MS;
    else
      process.env.PM_HUB_PENDING_FLUSH_MS = prev;
  });

  test("resolveSoftBufferedBytes defaults to 64KiB; env override", () => {
    const prev = process.env.PM_HUB_SOFT_BUFFERED_BYTES;
    delete process.env.PM_HUB_SOFT_BUFFERED_BYTES;
    expect(resolveSoftBufferedBytes()).toBe(64 * 1024);
    process.env.PM_HUB_SOFT_BUFFERED_BYTES = "32768";
    expect(resolveSoftBufferedBytes()).toBe(32768);
    if (prev === undefined)
      delete process.env.PM_HUB_SOFT_BUFFERED_BYTES;
    else
      process.env.PM_HUB_SOFT_BUFFERED_BYTES = prev;
  });
});
