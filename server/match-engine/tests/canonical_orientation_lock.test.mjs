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

it("pickCanonicalGbFromMatchs: 参考平台无映射时回落其它平台 ID", () => {
  setTeamPlugin({
    lookupById: (platform, pid) => ({
      "RAY:ray-h": GB_SUBTOP,
      "RAY:ray-a": GB_JULIE,
    })[`${platform}:${pid}`] || null,
    lookupCanonicalName: (gb) => (gb === GB_JULIE ? JULIE : gb === GB_SUBTOP ? SUBTOP : null),
  });

  const picked = pickCanonicalGbFromMatchs(
    { RAY: "1", OB: "2" },
    matches,
  );
  // titleFromMatchs 优先 OB；OB 无映射时按优先级扫到 RAY，并按 title 主客对齐
  assert.equal(picked?.homeGb, GB_JULIE);
  assert.equal(picked?.awayGb, GB_SUBTOP);

  setTeamPlugin(null);
});

it("refreshClientMatchCanonicalOrientation: 无平台行时用 existing.title 锁 gb", () => {
  setTeamPlugin({
    lookupGbTeamIdByNormalizedNameForGame: (game, name) => {
      if (game !== "valorant") return null;
      if (name.includes("subtop")) return GB_SUBTOP;
      if (name.includes("julie")) return GB_JULIE;
      return null;
    },
    lookupCanonicalName: (gb) => (gb === GB_JULIE ? JULIE : gb === GB_SUBTOP ? SUBTOP : null),
    lookupGameForGbTeamId: () => "valorant",
  });

  const rows = [{
    ID: 450,
    Title: "",
    GameID: "8",
    Matchs: { IA: "gone", RAY: "gone" },
  }];
  refreshClientMatchCanonicalOrientation(rows, {}, [{
    id: 450,
    title: `${SUBTOP} vs ${JULIE}`,
  }]);

  assert.equal(rows[0].HomeGbTeamId, GB_SUBTOP);
  assert.equal(rows[0].AwayGbTeamId, GB_JULIE);
  assert.equal(rows[0].Title, `${SUBTOP} vs ${JULIE}`);

  setTeamPlugin(null);
});

it("refreshClientMatchCanonicalOrientation: existing.title 优先于 merge 行反转 Title", () => {
  setTeamPlugin({
    lookupGbTeamIdByNormalizedNameForGame: (game, name) => {
      if (game !== "valorant") return null;
      if (name.includes("subtop")) return GB_SUBTOP;
      if (name.includes("julie")) return GB_JULIE;
      return null;
    },
    lookupCanonicalName: (gb) => (gb === GB_JULIE ? JULIE : gb === GB_SUBTOP ? SUBTOP : null),
    lookupGameForGbTeamId: () => "valorant",
  });

  const rows = [{
    ID: 450,
    Title: `${JULIE} vs ${SUBTOP}`,
    GameID: "8",
    Matchs: {},
  }];
  refreshClientMatchCanonicalOrientation(rows, {}, [{
    id: 450,
    title: `${SUBTOP} vs ${JULIE}`,
  }]);

  assert.equal(rows[0].HomeGbTeamId, GB_SUBTOP);
  assert.equal(rows[0].AwayGbTeamId, GB_JULIE);
  assert.equal(rows[0].Title, `${SUBTOP} vs ${JULIE}`);

  setTeamPlugin(null);
});
