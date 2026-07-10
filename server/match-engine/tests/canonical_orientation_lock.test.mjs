import assert from "node:assert/strict";
import { it } from "vitest";
import {
  pickAnchorPlatformOrientation,
  pickCanonicalGbFromMatchs,
  pickDeterministicGbOrientation,
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
  IA: {
    "3": {
      SourceMatchID: "3",
      Home: SUBTOP,
      Away: JULIE,
      HomeID: "ia-h",
      AwayID: "ia-a",
      SourceGameID: "8",
    },
  },
  Polymarket: {
    "4": {
      SourceMatchID: "4",
      Home: JULIE,
      Away: SUBTOP,
      HomeID: "pm-h",
      AwayID: "pm-a",
      SourceGameID: "valorant",
    },
  },
};

const idMap = {
  "OB:ob-h": GB_JULIE,
  "OB:ob-a": GB_SUBTOP,
  "RAY:ray-h": GB_SUBTOP,
  "RAY:ray-a": GB_JULIE,
  "IA:ia-h": GB_SUBTOP,
  "IA:ia-a": GB_JULIE,
  "Polymarket:pm-h": GB_JULIE,
  "Polymarket:pm-a": GB_SUBTOP,
};

function setIdPlugin(extra = {}) {
  setTeamPlugin({
    lookupById: (platform, pid) => idMap[`${platform}:${pid}`] || null,
    lookupCanonicalName: (gb) => (gb === GB_JULIE ? JULIE : gb === GB_SUBTOP ? SUBTOP : null),
    lookupGameForGbTeamId: () => "valorant",
    ...extra,
  });
}

it("pickAnchorPlatformOrientation: PM → OB → RAY 链", () => {
  const all = pickAnchorPlatformOrientation([
    { platform: "RAY", homeGb: GB_SUBTOP, awayGb: GB_JULIE },
    { platform: "OB", homeGb: GB_JULIE, awayGb: GB_SUBTOP },
    { platform: "Polymarket", homeGb: GB_JULIE, awayGb: GB_SUBTOP },
  ], "valorant");
  assert.equal(all?.anchorPlatform, "Polymarket");
  assert.equal(all?.homeGb, GB_JULIE);
  assert.equal(all?.awayGb, GB_SUBTOP);

  const obOnly = pickAnchorPlatformOrientation([
    { platform: "RAY", homeGb: GB_SUBTOP, awayGb: GB_JULIE },
    { platform: "OB", homeGb: GB_JULIE, awayGb: GB_SUBTOP },
  ], "valorant");
  assert.equal(obOnly?.anchorPlatform, "OB");
  assert.equal(obOnly?.homeGb, GB_JULIE);

  const rayOnly = pickAnchorPlatformOrientation([
    { platform: "RAY", homeGb: GB_SUBTOP, awayGb: GB_JULIE },
    { platform: "IA", homeGb: GB_SUBTOP, awayGb: GB_JULIE },
  ], "valorant");
  assert.equal(rayOnly?.anchorPlatform, "RAY");
  assert.equal(rayOnly?.homeGb, GB_SUBTOP);
  assert.equal(rayOnly?.awayGb, GB_JULIE);
});

it("pickDeterministicGbOrientation: 无锚点时的回落仍 min/max", () => {
  const voted = pickDeterministicGbOrientation([
    { platform: "IA", homeGb: GB_SUBTOP, awayGb: GB_JULIE },
    { platform: "IA", homeGb: "C-other", awayGb: GB_SUBTOP },
  ]);
  assert.equal(voted?.homeGb, GB_JULIE);
  assert.equal(voted?.awayGb, GB_SUBTOP);
});

it("pickCanonicalGbFromMatchs: 有 PM 时用 PM native 槽位", () => {
  setIdPlugin();
  const picked = pickCanonicalGbFromMatchs(
    { RAY: "1", OB: "2", Polymarket: "4" },
    matches,
    "valorant",
  );
  assert.equal(picked?.homeGb, GB_JULIE);
  assert.equal(picked?.awayGb, GB_SUBTOP);
  setTeamPlugin(null);
});

it("pickCanonicalGbFromMatchs: 无 PM 时用 OB native 槽位", () => {
  setIdPlugin();
  const picked = pickCanonicalGbFromMatchs(
    { RAY: "1", OB: "2", IA: "3" },
    matches,
    "valorant",
  );
  assert.equal(picked?.homeGb, GB_JULIE);
  assert.equal(picked?.awayGb, GB_SUBTOP);
  setTeamPlugin(null);
});

it("pickCanonicalGbFromMatchs: 仅 RAY 时用 RAY native 槽位", () => {
  setIdPlugin();
  const picked = pickCanonicalGbFromMatchs(
    { RAY: "1" },
    matches,
    "valorant",
  );
  assert.equal(picked?.homeGb, GB_SUBTOP);
  assert.equal(picked?.awayGb, GB_JULIE);
  setTeamPlugin(null);
});

it("pickCanonicalGbFromMatchs: 无平台 ID 映射时锚点队名 OB", () => {
  setTeamPlugin({
    lookupById: () => null,
    lookupGbTeamIdByNormalizedNameForGame: (game, name) => {
      if (game !== "valorant") return null;
      if (name.includes("julie")) return GB_JULIE;
      if (name.includes("subtop")) return GB_SUBTOP;
      return null;
    },
    lookupCanonicalName: (gb) => (gb === GB_JULIE ? JULIE : gb === GB_SUBTOP ? SUBTOP : null),
    lookupGameForGbTeamId: () => "valorant",
  });

  const picked = pickCanonicalGbFromMatchs(
    { OB: "2" },
    matches,
    "valorant",
  );
  assert.equal(picked?.homeGb, GB_JULIE);
  assert.equal(picked?.awayGb, GB_SUBTOP);
  setTeamPlugin(null);
});

it("refreshClientMatchCanonicalOrientation: DB 锁覆盖锚点结果", () => {
  setIdPlugin();

  const rows = [{
    ID: 720,
    Title: `${JULIE} vs ${SUBTOP}`,
    Matchs: { RAY: "1", OB: "2", IA: "3" },
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
  setIdPlugin();

  const rows = [{
    ID: 720,
    Title: `${JULIE} vs ${SUBTOP}`,
    HomeGbTeamId: GB_JULIE,
    AwayGbTeamId: GB_SUBTOP,
    Matchs: { RAY: "1", OB: "2", IA: "3" },
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

it("refreshClientMatchCanonicalOrientation: 无平台行时用 existing.title 查 gb 后仍 min/max", () => {
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

  assert.equal(rows[0].HomeGbTeamId, GB_JULIE);
  assert.equal(rows[0].AwayGbTeamId, GB_SUBTOP);
  assert.equal(rows[0].Title, `${JULIE} vs ${SUBTOP}`);

  setTeamPlugin(null);
});

it("refreshClientMatchCanonicalOrientation: title 查 gb 后按 min/max，不跟 Title 左右", () => {
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

  assert.equal(rows[0].HomeGbTeamId, GB_JULIE);
  assert.equal(rows[0].AwayGbTeamId, GB_SUBTOP);
  assert.equal(rows[0].Title, `${JULIE} vs ${SUBTOP}`);

  setTeamPlugin(null);
});
