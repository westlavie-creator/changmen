import { describe, expect, test } from "vitest";
import { rayStage } from "./collect";

describe("RAY rayStage", () => {
  test("parses live API match_stage strings", () => {
    expect(rayStage("final")).toBe(0);
    expect(rayStage("r1")).toBe(1);
    expect(rayStage("r2")).toBe(2);
    expect(rayStage("R3")).toBe(3);
  });

  test("supports A8-style Decimal objects", () => {
    expect(rayStage({ toNumber: () => 2 })).toBe(2);
  });
});
