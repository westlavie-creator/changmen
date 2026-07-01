import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { normalizeMatchesShape } from "@changmen/match-engine";
import { planAutoBindings } from "./auto_bind_events.js";

const T0 = 1_700_000_000_000;

function obMatch(id, home, away, homeId, awayId) {
  return {
    SourceMatchID: id,
    Home: home,
    Away: away,
    HomeID: homeId,
    AwayID: awayId,
    StartTime: T0,
    SourceGameID: "8",
    BO: 3,
  };
}

describe("planAutoBindings", () => {
  it("seeds OB platform matches as new events", () => {
    const matches = normalizeMatchesShape({
      OB: [obMatch("ob-1", "T1", "GEN", "h1", "a1")],
    });
    const { planned, stats } = planAutoBindings({ matches, existingBindings: [] });
    assert.equal(stats.obSeeded, 1);
    assert.equal(planned.length, 1);
    assert.equal(planned[0].platform, "OB");
    assert.equal(planned[0].source_match_id, "ob-1");
    assert.equal(planned[0].binding_source, "auto_id");
    assert.ok(planned[0].event_stub);
  });

  it("attaches non-OB by team name to existing event", () => {
    const matches = normalizeMatchesShape({
      OB: [obMatch("ob-1", "T1", "GEN", "h1", "a1")],
      RAY: [obMatch("ray-2", "T1", "GEN", "x9", "y9")],
    });
    const existingBindings = [{
      platform: "OB",
      source_match_id: "ob-1",
      event_id: 42,
      binding_source: "manual",
    }];
    const { planned, stats } = planAutoBindings({ matches, existingBindings });
    assert.equal(stats.attachedByName, 1);
    const ray = planned.find(p => p.platform === "RAY");
    assert.equal(ray.event_id, 42);
    assert.equal(ray.binding_source, "auto_name");
  });

  it("does not plan over existing bindings", () => {
    const matches = normalizeMatchesShape({
      OB: [obMatch("ob-1", "T1", "GEN", "h1", "a1")],
    });
    const existingBindings = [{
      platform: "OB",
      source_match_id: "ob-1",
      event_id: 9,
      binding_source: "manual",
    }];
    const { planned } = planAutoBindings({ matches, existingBindings });
    assert.equal(planned.length, 0);
  });
});
