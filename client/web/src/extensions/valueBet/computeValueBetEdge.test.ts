import { describe, expect, it } from "vitest";
import { computeValueBetEdge, isValueBetPositiveEdge } from "@/extensions/valueBet/computeValueBetEdge";
import { valueBetCalcOptsFromPrefs } from "@/extensions/valueBet/evConfig";

function stubItem(type: string, home: number, away: number) {
  return {
    type,
    getOdds: (side: "Home" | "Away") => (side === "Home" ? home : away),
  };
}

describe("computeValueBetEdge sharp baseline", () => {
  const pb = stubItem("PB", 1.9, 1.95);
  const ray = stubItem("RAY", 2.2, 1.7);
  const ob = stubItem("OB", 2.3, 1.65);
  const bet = { items: [pb, ray, ob] };

  it("defaults to PB as sharp so PB itself is not marked", () => {
    expect(computeValueBetEdge(bet as never, pb as never, "Home")).toBeNull();
    const rayHome = computeValueBetEdge(bet as never, ray as never, "Home");
    expect(rayHome).not.toBeNull();
    expect(rayHome!.edge).toBeGreaterThan(0.03);
  });

  it("with RAY as sharp, can mark PB and not RAY", () => {
    const opts = valueBetCalcOptsFromPrefs({ sharp: "RAY" });
    expect(computeValueBetEdge(bet as never, ray as never, "Home", opts)).toBeNull();
    const pbHome = computeValueBetEdge(bet as never, pb as never, "Home", opts);
    expect(pbHome).not.toBeNull();
    expect(computeValueBetEdge(bet as never, ob as never, "Home", opts)).not.toBeNull();
  });
});

describe("isValueBetPositiveEdge", () => {
  it("uses custom minEdge when provided", () => {
    expect(isValueBetPositiveEdge(0.04, 0.05)).toBe(false);
    expect(isValueBetPositiveEdge(0.05, 0.05)).toBe(true);
  });
});
