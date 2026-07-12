import { describe, expect, it } from "vitest";
import {
  detectionMaxPriceFromOdds,
  isValidPredictClobPrice,
  resolvePredictFunDetectionMaxPrice,
} from "./pfDetection";
import { parsePredictFunTokenConfig, resolvePredictFunPrivateKey } from "./credentials";
import { isPredictFunOrderAccepted } from "./bet";

describe("predictfun bet helpers", () => {
  it("parses EOA private key from token json", () => {
    const cfg = parsePredictFunTokenConfig(JSON.stringify({ privateKey: "abc123" }));
    expect(resolvePredictFunPrivateKey(cfg)).toBe("0xabc123");
  });

  it("validates clob price range", () => {
    expect(isValidPredictClobPrice(0.62)).toBe(true);
    expect(isValidPredictClobPrice(0)).toBe(false);
    expect(isValidPredictClobPrice(1)).toBe(false);
  });

  it("derives detection cap from odds", () => {
    expect(detectionMaxPriceFromOdds(2)).toBe(0.5);
  });

  it("accepts create-order response with orderId", () => {
    expect(isPredictFunOrderAccepted({ success: true, data: { orderId: "123" } })).toBe(true);
    expect(isPredictFunOrderAccepted({ success: true, data: {} })).toBe(false);
  });

  it("locks detection max price from option.data", () => {
    const option = {
      odds: 1.8,
      data: { detectionClobPrice: 0.55 },
    } as never;
    expect(resolvePredictFunDetectionMaxPrice(option, 1.8)).toBe(0.55);
  });
});
