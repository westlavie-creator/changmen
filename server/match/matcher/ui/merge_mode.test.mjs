import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { classifyClientMatchMergeMode } from "./merge_mode.js";

describe("classifyClientMatchMergeMode", () => {
  it("classifies as id when teamMaps cover teams[] fallback ids", () => {
    const cm = { id: 266, matchs: { OB: "ob1", RAY: "ray1" } };
    const byPlatform = {
      OB: [{
        platform: "OB",
        source_match_id: "ob1",
        home: "Sashi",
        away: "KOLESIE",
        home_id: "",
        away_id: "",
        teams: [
          { Name: "Sashi", TeamID: "174183679975289424" },
          { Name: "KOLESIE", TeamID: "85185116216365852" },
        ],
        game: { code: "cs2" },
      }],
      RAY: [{
        platform: "RAY",
        source_match_id: "ray1",
        home_id: "37655427",
        away_id: "38218017",
        home: "Sashi",
        away: "KOLESIE",
        game: { code: "cs2" },
      }],
    };
    const teamMaps = {
      "OB:174183679975289424": { gb_team_id: "100325" },
      "OB:85185116216365852": { gb_team_id: "100086" },
      "RAY:37655427": { gb_team_id: "100325" },
      "RAY:38218017": { gb_team_id: "100086" },
    };

    const out = classifyClientMatchMergeMode(cm, byPlatform, teamMaps);
    assert.equal(out.mode, "id");
    assert.equal(out.label, "平台 ID");
  });

  it("classifies as name when any side lacks gb in teamMaps", () => {
    const cm = { id: 1, matchs: { OB: "ob1", RAY: "ray1" } };
    const byPlatform = {
      OB: [{
        platform: "OB",
        source_match_id: "ob1",
        home_id: "1",
        away_id: "2",
        home: "A",
        away: "B",
        game: { code: "cs2" },
      }],
      RAY: [{
        platform: "RAY",
        source_match_id: "ray1",
        home_id: "3",
        away_id: "4",
        home: "A",
        away: "B",
        game: { code: "cs2" },
      }],
    };
    const teamMaps = {
      "OB:1": { gb_team_id: "100" },
      "OB:2": { gb_team_id: "101" },
      "RAY:3": { gb_team_id: "100" },
    };

    const out = classifyClientMatchMergeMode(cm, byPlatform, teamMaps);
    assert.equal(out.mode, "name");
  });

  it("returns unknown (not name) when platform rows are gone and locks missing", () => {
    const cm = {
      id: 450,
      title: "Team Sanzi vs Mau Esports",
      matchs: { IA: "376113", RAY: "38406586" },
    };
    const out = classifyClientMatchMergeMode(cm, {}, {});
    assert.equal(out.mode, "unknown");
    assert.equal(out.label, "未知");
  });

  it("returns id when platform rows are gone but client_matches locks exist", () => {
    const cm = {
      id: 450,
      title: "Team Sanzi vs Mau Esports",
      matchs: { IA: "376113", RAY: "38406586" },
      home_gb_team_id: "100754",
      away_gb_team_id: "100755",
    };
    const out = classifyClientMatchMergeMode(cm, {}, {});
    assert.equal(out.mode, "id");
    assert.equal(out.label, "平台 ID");
  });
});
