import { describe, expect, it } from "vitest";
import { BetResult } from "@/models/betResult";
import { resolveArbLegPlaceOutcome } from "@/stores/betting/autoBet/phases/types";

describe("resolveArbLegPlaceOutcome", () => {
  it("maps attempted + success / fail / skip", () => {
    expect(resolveArbLegPlaceOutcome(false)).toBe("not_attempted");
    expect(resolveArbLegPlaceOutcome(true, new BetResult("OB", true))).toBe("filled_pending_settle");
    expect(resolveArbLegPlaceOutcome(true, new BetResult("OB", false))).toBe("api_failed");
    expect(resolveArbLegPlaceOutcome(true, undefined)).toBe("api_failed");
  });
});
