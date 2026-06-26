import { describe, expect, it } from "vitest";
import { resolveArbRuntimeFlags } from "@/extensions/arbOpportunity/syncArbRuntime";

describe("resolveArbRuntimeFlags", () => {
  it("starts market watch only when betting off and notify enabled", () => {
    expect(
      resolveArbRuntimeFlags({
        betting: false,
        notifyArbOpportunity: true,
        arbDetectEngine: "a8",
      }),
    ).toEqual({ needMarketWatchLoop: true, needKakaxiRuntime: false });
  });

  it("does not start kakaxi runtime when betting on and kakaxi mode", () => {
    expect(
      resolveArbRuntimeFlags({
        betting: true,
        arbDetectEngine: "kakaxi",
      }),
    ).toEqual({ needMarketWatchLoop: false, needKakaxiRuntime: false });
  });

  it("starts neither sidecar when betting on with a8 mode", () => {
    expect(
      resolveArbRuntimeFlags({
        betting: true,
        arbDetectEngine: "a8",
        notifyArbOpportunity: true,
      }),
    ).toEqual({ needMarketWatchLoop: false, needKakaxiRuntime: false });
  });
});
