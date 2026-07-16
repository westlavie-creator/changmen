import assert from "node:assert/strict";
import { afterEach, describe, it } from "vitest";
import {
  getMatcherSideEngine,
  isProjectorSideEngine,
} from "../../matcher/lib/side_engine.js";

const prev = process.env.MATCHER_SIDE_ENGINE;

afterEach(() => {
  if (prev === undefined)
    delete process.env.MATCHER_SIDE_ENGINE;
  else
    process.env.MATCHER_SIDE_ENGINE = prev;
});

describe("MATCHER_SIDE_ENGINE", () => {
  it("defaults to legacy", () => {
    delete process.env.MATCHER_SIDE_ENGINE;
    assert.equal(getMatcherSideEngine(), "legacy");
    assert.equal(isProjectorSideEngine(), false);
  });

  it("accepts projector / project", () => {
    process.env.MATCHER_SIDE_ENGINE = "projector";
    assert.equal(isProjectorSideEngine(), true);
    process.env.MATCHER_SIDE_ENGINE = "project";
    assert.equal(getMatcherSideEngine(), "projector");
  });
});

describe("gb clear lock contract", () => {
  it("OB slot missing data → existing-gap sticky", async () => {
    const { resolveOrientationLock } = await import("../src/orientation_lock.js");
    const row = { Matchs: { OB: "ob1" }, Bets: [] };
    const lock = resolveOrientationLock(row, {}, {
      home_gb_team_id: "100631",
      away_gb_team_id: "100297",
    });
    assert.equal(lock.lockSource, "existing-gap");
    assert.equal(row.HomeGbTeamId, "100631");
  });

  it("only IA left → clear RDS lock (no gap sticky)", async () => {
    const { resolveOrientationLock } = await import("../src/orientation_lock.js");
    const row = {
      Matchs: { IA: "ia1" },
      Bets: [],
    };
    const lock = resolveOrientationLock(row, {
      IA: {
        ia1: {
          SourceMatchID: "ia1",
          Home: "A",
          Away: "B",
          HomeID: "x",
          AwayID: "y",
          SourceGameID: "3",
        },
      },
    }, {
      home_gb_team_id: "100631",
      away_gb_team_id: "100297",
    });
    assert.equal(lock.locked, false);
    assert.equal(row.HomeGbTeamId, undefined);
    assert.equal(row.HomeGbTeamId ?? null, null);
  });
});
