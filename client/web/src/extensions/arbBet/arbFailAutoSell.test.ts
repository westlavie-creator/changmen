import { describe, expect, it } from "vitest";
import {
  decideArbFailAutoSell,
  isArbFailAutoSellEnabled,
} from "@/extensions/arbBet/arbFailAutoSell";

const base = {
  enabled: true,
  betBothLegs: true,
  singleLegByRate: false,
  providerA: "Polymarket",
  providerB: "OB",
  okA: true,
  okB: false,
  pendingConfirmA: false,
  pendingConfirmB: false,
  makeupEnqueuedA: false,
  makeupEnqueuedB: false,
};

describe("decideArbFailAutoSell", () => {
  it("sells filled PM when other leg failed and makeup not queued", () => {
    expect(decideArbFailAutoSell(base)).toEqual({
      sellSide: "A",
      provider: "Polymarket",
    });
  });

  it("sells filled PF when other leg failed", () => {
    expect(decideArbFailAutoSell({
      ...base,
      providerA: "OB",
      providerB: "PredictFun",
      okA: false,
      okB: true,
    })).toEqual({
      sellSide: "B",
      provider: "PredictFun",
    });
  });

  it("skips when disabled", () => {
    expect(decideArbFailAutoSell({ ...base, enabled: false })).toBeNull();
  });

  it("skips 9999 intentional single leg", () => {
    expect(decideArbFailAutoSell({ ...base, singleLegByRate: true })).toBeNull();
    expect(decideArbFailAutoSell({ ...base, betBothLegs: false })).toBeNull();
  });

  it("skips when makeup enqueued", () => {
    expect(decideArbFailAutoSell({ ...base, makeupEnqueuedB: true })).toBeNull();
  });

  it("skips while pending confirm", () => {
    expect(decideArbFailAutoSell({ ...base, pendingConfirmB: true })).toBeNull();
  });

  it("skips when both legs ok", () => {
    expect(decideArbFailAutoSell({ ...base, okB: true })).toBeNull();
  });

  it("skips when filled leg is not prediction market", () => {
    expect(decideArbFailAutoSell({
      ...base,
      providerA: "OB",
      providerB: "RAY",
      okA: true,
      okB: false,
    })).toBeNull();
  });
});

describe("isArbFailAutoSellEnabled", () => {
  it("requires explicit true", () => {
    expect(isArbFailAutoSellEnabled(undefined)).toBe(false);
    expect(isArbFailAutoSellEnabled({ enabled: false })).toBe(false);
    expect(isArbFailAutoSellEnabled({ enabled: true })).toBe(true);
  });
});
