import assert from "node:assert/strict";
import { afterEach, describe, it } from "vitest";
import { normalizeMatchesShape } from "@changmen/match-engine";
import { resetMatcherBehaviorForTest, setMatcherBehaviorForTest } from "../lib/config.js";
import {
  alignObSpineSlotMatches,
  clientMatchHasObSpine,
  pickBestClientMatch,
} from "./ob_spine_align.js";

describe("ob_spine_align", () => {
  afterEach(() => {
    resetMatcherBehaviorForTest();
  });

  it("alignObSpineSlotMatches links OB row to client with same matchs.OB", () => {
    const matches = normalizeMatchesShape({
      OB: [{
        SourceMatchID: "ob-99",
        Home: "A",
        Away: "B",
        StartTime: 1_700_000_000_000,
        SourceGameID: "8",
      }],
    });
    const clientRows = [{
      id: 101,
      matchs: { OB: "ob-99", RAY: "r1" },
      start_time: 1_700_000_000_000,
    }];

    const stats = alignObSpineSlotMatches(matches, clientRows);
    assert.equal(stats.alignedByObSlot, 1);
    assert.equal(matches.OB["ob-99"].ClientMatchId, 101);
  });

  it("pickBestClientMatch prefers OB spine when enabled", () => {
    const start = 1_700_000_000_000;
    const withOb = { id: 1, matchs: { OB: "x" }, start_time: start };
    const withoutOb = { id: 2, matchs: { RAY: "y" }, start_time: start };
    const hit = pickBestClientMatch([withoutOb, withOb], start, { preferObSpine: true });
    assert.equal(hit.id, 1);
    assert.equal(clientMatchHasObSpine(withOb), true);
  });

  it("obSpineAlign=false skips slot align", () => {
    setMatcherBehaviorForTest({ obSpineAlign: false });
    const matches = normalizeMatchesShape({
      OB: [{ SourceMatchID: "ob-1", Home: "A", Away: "B", StartTime: 1 }],
    });
    const stats = alignObSpineSlotMatches(matches, [{ id: 1, matchs: { OB: "ob-1" } }]);
    assert.equal(stats.alignedByObSlot, 0);
  });
});
