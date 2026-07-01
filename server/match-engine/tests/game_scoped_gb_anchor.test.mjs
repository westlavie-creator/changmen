import assert from "node:assert/strict";
/**
 * 锚点 gb 须匹配本场 gameCode，避免 cs2/valorant 同名队串线（#789 类）。
 */
import { it } from "vitest";
import {
  refreshClientMatchCanonicalOrientation,
  setTeamPlugin,
} from "../merge/match_merge.js";

const GB_ENT_VAL = "100439";
const GB_NAVI_VAL = "100442";
const GB_NAVI_CS2 = "100050";

const valorantMatches = {
  OB: {
    ob1: {
      SourceMatchID: "ob1",
      Home: "Enterprise Esports",
      Away: "Natus Vincere Junior",
      HomeID: "ob-h",
      AwayID: "ob-a",
      SourceGameID: "8",
    },
  },
  IA: {
    ia1: {
      SourceMatchID: "ia1",
      Home: "NAVI Junior",
      Away: "Enterprise Esports",
      HomeID: "ia-h",
      AwayID: "ia-a",
      SourceGameID: "8",
    },
  },
};

function setEnterprisePlugin() {
  setTeamPlugin({
    lookupGbTeamIdByNormalizedName: (norm) => {
      if (norm.includes("enterprise"))
        return GB_ENT_VAL;
      if (norm.includes("natus") || norm.includes("navi"))
        return GB_NAVI_CS2;
      return null;
    },
    lookupGbTeamIdByNormalizedNameForGame: (game, norm) => {
      if (game === "valorant") {
        if (norm.includes("enterprise"))
          return GB_ENT_VAL;
        if (norm.includes("natus") || norm.includes("navi"))
          return GB_NAVI_VAL;
      }
      if (game === "cs2" && (norm.includes("natus") || norm.includes("navi")))
        return GB_NAVI_CS2;
      return null;
    },
    lookupGameForGbTeamId: (gb) => {
      if (gb === GB_ENT_VAL || gb === GB_NAVI_VAL)
        return "valorant";
      if (gb === GB_NAVI_CS2)
        return "cs2";
      return null;
    },
    lookupById: (platform, pid) => ({
      "OB:ob-h": GB_ENT_VAL,
      "OB:ob-a": GB_NAVI_VAL,
      "IA:ia-h": GB_NAVI_VAL,
      "IA:ia-a": GB_ENT_VAL,
    })[`${platform}:${pid}`] || null,
    lookupCanonicalName: (gb) => ({
      [GB_ENT_VAL]: "Enterprise Esports",
      [GB_NAVI_VAL]: "Natus Vincere Junior",
      [GB_NAVI_CS2]: "Natus Vincere Junior",
    })[String(gb)] || null,
  });
}

it("drops cs2 away anchor on valorant match and re-picks valorant gb", () => {
  setEnterprisePlugin();
  const rows = [{
    ID: 789,
    Title: "Enterprise Esports vs Natus Vincere Junior",
    Game: "VALORANT (valorant)",
    GameID: "8",
    Matchs: { OB: "ob1", IA: "ia1" },
    HomeGbTeamId: GB_ENT_VAL,
    AwayGbTeamId: GB_NAVI_CS2,
  }];
  const existing = [{
    id: 789,
    home_gb_team_id: GB_ENT_VAL,
    away_gb_team_id: GB_NAVI_CS2,
  }];

  refreshClientMatchCanonicalOrientation(rows, valorantMatches, existing);

  assert.equal(rows[0].HomeGbTeamId, GB_ENT_VAL);
  assert.equal(rows[0].AwayGbTeamId, GB_NAVI_VAL, "away should be valorant gb not cs2");
  setTeamPlugin(null);
});

it("lookupGbTeamIdByName scoped: valorant NAVI not cs2 gb", async () => {
  const { lookupGbTeamIdByName, setTeamPlugin: setPlugin } = await import("../teams/team_key.js");
  setEnterprisePlugin();
  assert.equal(lookupGbTeamIdByName("Natus Vincere Junior", "valorant"), GB_NAVI_VAL);
  assert.equal(lookupGbTeamIdByName("Natus Vincere Junior", "cs2"), GB_NAVI_CS2);
  assert.equal(lookupGbTeamIdByName("Natus Vincere Junior"), GB_NAVI_CS2, "ungamed fallback");
  setPlugin(null);
});
