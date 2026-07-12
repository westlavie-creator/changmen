import { describe, expect, test } from "vitest";
import {
  extractMarketIdsFromPredictMessage,
  marketIdFromPredictOrderbookTopic,
  mergeHubMarketIds,
  parsePredictFunClientControl,
} from "./predictfun_market_hub.js";

describe("predictfun_market_hub", () => {
  test("marketIdFromPredictOrderbookTopic", () => {
    expect(marketIdFromPredictOrderbookTopic("predictOrderbook/472")).toBe("472");
    expect(marketIdFromPredictOrderbookTopic("heartbeat")).toBeNull();
  });

  test("extractMarketIdsFromPredictMessage orderbook push", () => {
    const ids = extractMarketIdsFromPredictMessage(JSON.stringify({
      type: "M",
      topic: "predictOrderbook/99",
      data: { asks: [[0.55, 100]], bids: [] },
    }));
    expect([...ids]).toEqual(["99"]);
  });

  test("extractMarketIdsFromPredictMessage heartbeat has no market", () => {
    const ids = extractMarketIdsFromPredictMessage(JSON.stringify({
      type: "M",
      topic: "heartbeat",
      data: 1736696400000,
    }));
    expect(ids.size).toBe(0);
  });

  test("parsePredictFunClientControl subscribe", () => {
    const row = parsePredictFunClientControl(JSON.stringify({
      method: "subscribe",
      requestId: 3,
      params: ["predictOrderbook/12"],
    }));
    expect(row).toEqual({ kind: "subscribe", marketId: "12" });
  });

  test("mergeHubMarketIds unions clients", () => {
    const map = new Map([
      [{}, { marketIds: new Set(["1", "2"]) }],
      [{}, { marketIds: new Set(["2", "3"]) }],
    ]);
    expect([...mergeHubMarketIds(map)].sort()).toEqual(["1", "2", "3"]);
  });
});
