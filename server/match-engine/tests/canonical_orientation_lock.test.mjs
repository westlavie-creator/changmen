import assert from "node:assert/strict";
import { it } from "vitest";
import {
  pickCanonicalGbFromMatchs,
  refreshClientMatchCanonicalOrientation,
  setTeamPlugin,
} from "../merge/match_merge.js";

const SUBTOP = "Subtop De France";
const JULIE = "Julie&Cie";
const GB_JULIE = "C-julie";
const GB_SUBTOP = "C-subtop";

const matches = {
  RAY: {
    "1": {
      SourceMatchID: "1",
      Home: SUBTOP,
      Away: JULIE,
      HomeID: "ray-h",
      AwayID: "ray-a",
      SourceGameID: "8",
    },
  },
  OB: {
    "2": {
      SourceMatchID: "2",
      Home: JULIE,
      Away: SUBTOP,
      HomeID: "ob-h",
      AwayID: "ob-a",
      SourceGameID: "8",
    },
  },
};

it("pickCanonicalGbFromMatchs: OB 优先时取 OB 取向", () => {
  setTeamPlugin({
    lookupById: (platform, pid) => ({
      "OB:ob-h": GB_JULIE,
      "OB:ob-a": GB_SUBTOP,
      "RAY:ray-h": GB_SUBTOP,
      "RAY:ray-a": GB_JULIE,
    })[`${platform}:${pid}`] || null,
    lookupCanonicalName: (gb) => (gb === GB_JULIE ? JULIE : gb === GB_SUBTOP ? SUBTOP : null),
  });

  const picked = pickCanonicalGbFromMatchs(
    { RAY: "1", OB: "2" },
    matches,
  );
  assert.equal(picked?.homeGb, GB_JULIE);
  assert.equal(picked?.awayGb, GB_SUBTOP);

  setTeamPlugin(null);
});

it("refreshClientMatchCanonicalOrientation: DB 锁覆盖 OB 优先级", () => {
  setTeamPlugin({
    lookupById: (platform, pid) => ({
      "OB:ob-h": GB_JULIE,
      "OB:ob-a": GB_SUBTOP,
      "RAY:ray-h": GB_SUBTOP,
      "RAY:ray-a": GB_JULIE,
    })[`${platform}:${pid}`] || null,
    lookupCanonicalName: (gb) => (gb === GB_JULIE ? JULIE : gb === GB_SUBTOP ? SUBTOP : null),
  });

  const rows = [{
    ID: 720,
    Title: `${JULIE} vs ${SUBTOP}`,
    Matchs: { RAY: "1", OB: "2" },
  }];
  refreshClientMatchCanonicalOrientation(rows, matches, [{
    id: 720,
    home_gb_team_id: GB_SUBTOP,
    away_gb_team_id: GB_JULIE,
  }]);

  assert.equal(rows[0].Title, `${SUBTOP} vs ${JULIE}`);
  assert.equal(rows[0].HomeGbTeamId, GB_SUBTOP);
  assert.equal(rows[0].AwayGbTeamId, GB_JULIE);

  setTeamPlugin(null);
});

it("refreshClientMatchCanonicalOrientation: DB 锁覆盖 merge 行上错误的 HomeGbTeamId", () => {
  setTeamPlugin({
    lookupById: (platform, pid) => ({
      "OB:ob-h": GB_JULIE,
      "OB:ob-a": GB_SUBTOP,
      "RAY:ray-h": GB_SUBTOP,
      "RAY:ray-a": GB_JULIE,
    })[`${platform}:${pid}`] || null,
    lookupCanonicalName: (gb) => (gb === GB_JULIE ? JULIE : gb === GB_SUBTOP ? SUBTOP : null),
  });

  const rows = [{
    ID: 720,
    Title: `${JULIE} vs ${SUBTOP}`,
    HomeGbTeamId: GB_JULIE,
    AwayGbTeamId: GB_SUBTOP,
    Matchs: { RAY: "1", OB: "2" },
  }];
  refreshClientMatchCanonicalOrientation(rows, matches, [{
    id: 720,
    home_gb_team_id: GB_SUBTOP,
    away_gb_team_id: GB_JULIE,
  }]);

  assert.equal(rows[0].Title, `${SUBTOP} vs ${JULIE}`);
  assert.equal(rows[0].HomeGbTeamId, GB_SUBTOP);
  assert.equal(rows[0].AwayGbTeamId, GB_JULIE);

  setTeamPlugin(null);
});
