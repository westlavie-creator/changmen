import assert from "node:assert/strict";
import { describe, it } from "node:test";
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
      "OB:174183679975289424": { canonical_id: "100325" },
      "OB:85185116216365852": { canonical_id: "100086" },
      "RAY:37655427": { canonical_id: "100325" },
      "RAY:38218017": { canonical_id: "100086" },
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
      "OB:1": { canonical_id: "100" },
      "OB:2": { canonical_id: "101" },
      "RAY:3": { canonical_id: "100" },
    };

    const out = classifyClientMatchMergeMode(cm, byPlatform, teamMaps);
    assert.equal(out.mode, "name");
  });
});
