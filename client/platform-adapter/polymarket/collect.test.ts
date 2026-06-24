import { describe, expect, test } from "vitest";
import { extractPolymarketWsBestAsks } from "./collect";

describe("Polymarket collector websocket parsing", () => {
  test("extracts best ask updates from market websocket messages", () => {
    expect(extractPolymarketWsBestAsks(JSON.stringify({
      event_type: "best_bid_ask",
      asset_id: "asset-home",
      best_ask: "0.51",
    }))).toEqual([{ assetId: "asset-home", bestAsk: "0.51" }]);

    expect(extractPolymarketWsBestAsks(JSON.stringify({
      event_type: "price_change",
      price_changes: [
        { asset_id: "asset-home", best_ask: "0.52" },
        { asset_id: "asset-away", best_ask: "0.49" },
        { asset_id: "ignored" },
      ],
    }))).toEqual([
      { assetId: "asset-home", bestAsk: "0.52" },
      { assetId: "asset-away", bestAsk: "0.49" },
    ]);
  });

  test("ignores heartbeat pong", () => {
    expect(extractPolymarketWsBestAsks("PONG")).toEqual([]);
  });
});
