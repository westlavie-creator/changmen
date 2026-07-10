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

const GB_EDG_VAL = "100278";
const GB_EDG_KOG = "100383";
const GB_WOLVES_KOG = "100344";

const kogEdgMatches = {
  OB: {
    ob1: {
      SourceMatchID: "ob1",
      Home: "Wolves",
      Away: "EDward Gaming",
      HomeID: "ob-w",
      AwayID: "ob-edg",
      SourceGameID: "4",
    },
  },
  RAY: {
    ray1: {
      SourceMatchID: "ray1",
      Home: "重庆狼队",
      Away: "上海EDG.M",
      HomeID: "ray-w",
      AwayID: "ray-edg",
      SourceGameID: "4",
    },
  },
};

function setEdgCrossGamePlugin() {
  setTeamPlugin({
    // 无游戏时 nameOnly 先命中 valorant EDG（复现 #670 串线）
    lookupGbTeamIdByNormalizedName: (norm) => {
      if (norm.includes("edward") || norm === "edg")
        return GB_EDG_VAL;
      if (norm.includes("wolves") || norm.includes("狼队"))
        return GB_WOLVES_KOG;
      return null;
    },
    lookupGbTeamIdByNormalizedNameForGame: (game, norm) => {
      if (game === "valorant" && (norm.includes("edward") || norm === "edg"))
        return GB_EDG_VAL;
      if (game === "kog") {
        if (norm.includes("edward") || norm === "edg" || norm.includes("上海edg"))
          return GB_EDG_KOG;
        if (norm.includes("wolves") || norm.includes("狼队"))
          return GB_WOLVES_KOG;
      }
      return null;
    },
    lookupGameForGbTeamId: (gb) => {
      if (gb === GB_EDG_VAL)
        return "valorant";
      // 未知(14) 占位：校验应放行，名称索引靠 venue 纠正为 kog
      if (gb === GB_EDG_KOG)
        return "未知(14)";
      if (gb === GB_WOLVES_KOG)
        return "kog";
      return null;
    },
    lookupById: (platform, pid) => ({
      "OB:ob-w": GB_WOLVES_KOG,
      "OB:ob-edg": GB_EDG_KOG,
      "RAY:ray-w": GB_WOLVES_KOG,
      "RAY:ray-edg": GB_EDG_KOG,
    })[`${platform}:${pid}`] || null,
    lookupCanonicalName: (gb) => ({
      [GB_EDG_VAL]: "EDward Gaming",
      [GB_EDG_KOG]: "EDward Gaming",
      [GB_WOLVES_KOG]: "Wolves",
    })[String(gb)] || null,
  });
}

it("lookupGbTeamIdByName: kog 不回落 valorant 同名 EDG", async () => {
  const { lookupGbTeamIdByName, setTeamPlugin: setPlugin } = await import("../teams/team_key.js");
  setEdgCrossGamePlugin();
  assert.equal(lookupGbTeamIdByName("EDward Gaming", "kog"), GB_EDG_KOG);
  assert.equal(lookupGbTeamIdByName("EDward Gaming", "valorant"), GB_EDG_VAL);
  assert.equal(lookupGbTeamIdByName("EDward Gaming"), GB_EDG_VAL, "ungamed still nameOnly");

  // scoped 未命中时，禁止把 valorant nameOnly 当 kog 回落
  setPlugin({
    lookupGbTeamIdByNormalizedName: (norm) => (
      norm.includes("edward") ? GB_EDG_VAL : null
    ),
    lookupGbTeamIdByNormalizedNameForGame: () => null,
    lookupGameForGbTeamId: (gb) => (gb === GB_EDG_VAL ? "valorant" : null),
  });
  assert.equal(lookupGbTeamIdByName("EDward Gaming", "kog"), null);
  setPlugin(null);
});

it("pickCanonicalGbFromMatchs: 平台 ID 优先于跨游戏队名", async () => {
  const { pickCanonicalGbFromMatchs } = await import("../merge/match_merge.js");
  setEdgCrossGamePlugin();
  // 故意不提供 kog 名称索引，仅靠 nameOnly→val + 平台 ID→kog
  setTeamPlugin({
    lookupGbTeamIdByNormalizedName: (norm) => {
      if (norm.includes("edward"))
        return GB_EDG_VAL;
      if (norm.includes("wolves"))
        return GB_WOLVES_KOG;
      return null;
    },
    lookupGbTeamIdByNormalizedNameForGame: () => null,
    lookupGameForGbTeamId: (gb) => {
      if (gb === GB_EDG_VAL)
        return "valorant";
      if (gb === GB_EDG_KOG || gb === GB_WOLVES_KOG)
        return "kog";
      return null;
    },
    lookupById: (platform, pid) => ({
      "OB:ob-w": GB_WOLVES_KOG,
      "OB:ob-edg": GB_EDG_KOG,
      "RAY:ray-w": GB_WOLVES_KOG,
      "RAY:ray-edg": GB_EDG_KOG,
    })[`${platform}:${pid}`] || null,
    lookupCanonicalName: (gb) => ({
      [GB_EDG_VAL]: "EDward Gaming",
      [GB_EDG_KOG]: "EDward Gaming",
      [GB_WOLVES_KOG]: "Wolves",
    })[String(gb)] || null,
  });

  const picked = pickCanonicalGbFromMatchs(
    { OB: "ob1", RAY: "ray1" },
    kogEdgMatches,
    "kog",
  );
  assert.equal(picked?.homeGb, GB_WOLVES_KOG);
  assert.equal(picked?.awayGb, GB_EDG_KOG, "must use platform map kog EDG not val nameOnly");
  setTeamPlugin(null);
});

it("refresh: drops valorant EDG lock on kog match (#670)", () => {
  setEdgCrossGamePlugin();
  const rows = [{
    ID: 670,
    Title: "Wolves vs EDward Gaming",
    Game: "王者荣耀",
    GameID: "4",
    Matchs: { OB: "ob1", RAY: "ray1" },
    HomeGbTeamId: GB_WOLVES_KOG,
    AwayGbTeamId: GB_EDG_VAL,
  }];
  const existing = [{
    id: 670,
    home_gb_team_id: GB_WOLVES_KOG,
    away_gb_team_id: GB_EDG_VAL,
  }];

  refreshClientMatchCanonicalOrientation(rows, kogEdgMatches, existing);

  assert.equal(rows[0].HomeGbTeamId, GB_WOLVES_KOG);
  assert.equal(rows[0].AwayGbTeamId, GB_EDG_KOG, "away should be kog EDG not valorant");
  setTeamPlugin(null);
});
