import { describe, expect, it } from "vitest";
import { resolveArbRuntimeFlags } from "@/extensions/arbOpportunity/syncArbRuntime";

describe("resolveArbRuntimeFlags", () => {
  it("starts market watch only when betting off and notify enabled", () => {
    expect(
      resolveArbRuntimeFlags({
        betting: false,
        notifyArbOpportunity: true,
      }),
    ).toEqual({ needMarketWatchLoop: true });
  });

  it("does not start market watch when betting on", () => {
    expect(
      resolveArbRuntimeFlags({
        betting: true,
        notifyArbOpportunity: true,
      }),
    ).toEqual({ needMarketWatchLoop: false });
  });

  it("does not start market watch when notify disabled", () => {
    expect(
      resolveArbRuntimeFlags({
        betting: false,
        notifyArbOpportunity: false,
      }),
    ).toEqual({ needMarketWatchLoop: false });
  });
});
