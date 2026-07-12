import { describe, expect, it } from "vitest";
import { createLoseTargetOdds } from "@/stores/betting/createLoseOdds";

describe("createLoseTargetOdds", () => {
  it("adds 0.5 to max odds on target change", () => {
    expect(createLoseTargetOdds(1.9)).toBe(2.4);
  });
});
