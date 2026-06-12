import { describe, expect, it } from "vitest";
import {
  matchsIsSubset,
  findReuseIdByMatchsSuperset,
  findLinkedClientIdFromMatchs,
  findReuseIdByPlatformOverlap,
} from "../ids/client_match_ids.js";

describe("client_match_ids", () => {
  it("detects when existing matchs are a subset of rebuilt matchs", () => {
    const existing = { RAY: "1", IA: "2" };
    const built = { OB: "9", RAY: "1", IA: "2" };
    expect(matchsIsSubset(existing, built)).toBe(true);
    expect(matchsIsSubset(built, existing)).toBe(false);
  });

  it("reuses the id of the largest matching subset row", () => {
    const existingRows = [
      { id: 302, matchs: { RAY: "1", IA: "2" } },
      { id: 999, matchs: { RAY: "1" } },
    ];
    const built = { OB: "9", RAY: "1", IA: "2" };
    expect(findReuseIdByMatchsSuperset(existingRows, built)).toBe(302);
  });

  it("reuses id when platform rows already link to client_matches", () => {
    const matches = {
      OB: {
        ob1: { SourceMatchID: "ob1", ClientMatchId: 308 },
      },
      RAY: {
        ray1: { SourceMatchID: "ray1", ClientMatchId: 308 },
      },
    };
    const built = { OB: "ob1", RAY: "ray1" };
    expect(findLinkedClientIdFromMatchs(built, matches)).toBe(308);
  });

  it("reuses id on any platform:sourceId overlap with existing client row", () => {
    const existingRows = [{ id: 308, matchs: { RAY: "ray1", IA: "ia1" } }];
    const built = { RAY: "ray1", IA: "ia1" };
    expect(findReuseIdByPlatformOverlap(existingRows, built)).toBe(308);
  });
});
