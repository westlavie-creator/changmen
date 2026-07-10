import assert from "node:assert/strict";
import { it } from "vitest";
import {
  pickCanonicalGbFromMatchs,
  refreshClientMatchCanonicalOrientation,
  setTeamPlugin,
  voteCanonicalGbOrientation,
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

it("voteCanonicalGbOrientation: ≥2 同朝向取多数", () => {
  const voted = voteCanonicalGbOrientation([
    { platform: "RAY", homeGb: GB_SUBTOP, awayGb: GB_JULIE },
    { platform: "IA", homeGb: GB_SUBTOP, awayGb: GB_JULIE },
    { platform: "OB", homeGb: GB_JULIE, awayGb: GB_SUBTOP },
  ]);
  assert.equal(voted?.homeGb, GB_SUBTOP);
  assert.equal(voted?.awayGb, GB_JULIE);
});

it("voteCanonicalGbOrientation: 2-2 平票不锁，回退 PM", () => {
  const voted = voteCanonicalGbOrientation([
    { platform: "RAY", homeGb: GB_SUBTOP, awayGb: GB_JULIE },
    { platform: "IA", homeGb: GB_SUBTOP, awayGb: GB_JULIE },
    { platform: "OB", homeGb: GB_JULIE, awayGb: GB_SUBTOP },
    { platform: "PB", homeGb: GB_JULIE, awayGb: GB_SUBTOP },
    { platform: "Polymarket", homeGb: GB_JULIE, awayGb: GB_SUBTOP },
  ]);
  assert.equal(voted?.homeGb, GB_JULIE);
  assert.equal(voted?.awayGb, GB_SUBTOP);
});

it("voteCanonicalGbOrientation: 票不足回退 Polymarket", () => {
  const voted = voteCanonicalGbOrientation([
    { platform: "OB", homeGb: GB_JULIE, awayGb: GB_SUBTOP },
    { platform: "Polymarket", homeGb: GB_JULIE, awayGb: GB_SUBTOP },
  ]);
  assert.equal(voted?.homeGb, GB_JULIE);
  assert.equal(voted?.awayGb, GB_SUBTOP);
});

it("voteCanonicalGbOrientation: 票不足且无 PM → null", () => {
  const voted = voteCanonicalGbOrientation([
    { platform: "OB", homeGb: GB_JULIE, awayGb: GB_SUBTOP },
    { platform: "RAY", homeGb: GB_SUBTOP, awayGb: GB_JULIE },
  ]);
  assert.equal(voted, null);
});

it("voteCanonicalGbOrientation: PM 队对与多数不一致 → null", () => {
  const voted = voteCanonicalGbOrientation([
    { platform: "OB", homeGb: GB_JULIE, awayGb: GB_SUBTOP },
    { platform: "Polymarket", homeGb: "C-other", awayGb: GB_SUBTOP },
  ]);
  assert.equal(voted, null);
});

it("pickCanonicalGbFromMatchs: RAY+IA 同朝压过 OB", () => {
  setIdPlugin();
  const picked = pickCanonicalGbFromMatchs(
    { RAY: "1", OB: "2", IA: "3" },
    matches,
    "valorant",
  );
  assert.equal(picked?.homeGb, GB_SUBTOP);
  assert.equal(picked?.awayGb, GB_JULIE);
  setTeamPlugin(null);
});

it("pickCanonicalGbFromMatchs: 单源无投票有 PM → 锁 PM", () => {
  setIdPlugin();
  const picked = pickCanonicalGbFromMatchs(
    { OB: "2", Polymarket: "4" },
    matches,
    "valorant",
  );
  assert.equal(picked?.homeGb, GB_JULIE);
  assert.equal(picked?.awayGb, GB_SUBTOP);
  setTeamPlugin(null);
});

it("pickCanonicalGbFromMatchs: 单源无 PM → 不锁", () => {
  setIdPlugin();
  const picked = pickCanonicalGbFromMatchs(
    { RAY: "1", OB: "2" },
    matches,
    "valorant",
  );
  assert.equal(picked, null);
  setTeamPlugin(null);
});

it("pickCanonicalGbFromMatchs: 无平台 ID 映射时队名 fallback", () => {
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

it("refreshClientMatchCanonicalOrientation: DB 锁覆盖投票结果", () => {
  setIdPlugin();

  const rows = [{
    ID: 720,
    Title: `${JULIE} vs ${SUBTOP}`,
    Matchs: { RAY: "1", OB: "2", IA: "3" },
  }];
  refreshClientMatchCanonicalOrientation(rows, matches, [{
    id: 720,
    home_gb_team_id: GB_JULIE,
    away_gb_team_id: GB_SUBTOP,
  }]);

  assert.equal(rows[0].Title, `${JULIE} vs ${SUBTOP}`);
  assert.equal(rows[0].HomeGbTeamId, GB_JULIE);
  assert.equal(rows[0].AwayGbTeamId, GB_SUBTOP);

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
