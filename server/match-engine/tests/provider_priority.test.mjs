import { describe, expect, it } from "vitest";
import { teamsFromPlatformRows, providerPriority } from "../teams/provider_priority.js";

describe("provider_priority", () => {
  it("ranks OB above PB and picks higher-priority team names", () => {
    expect(providerPriority("OB")).toBeGreaterThan(providerPriority("PB"));
    const picked = teamsFromPlatformRows([
      { platform: "PB", home: "PB Home", away: "PB Away" },
      { platform: "OB", home: "OB Home", away: "OB Away" },
    ]);
    expect(picked).toEqual({
      platform: "OB",
      home: "OB Home",
      away: "OB Away",
      title: "OB Home vs OB Away",
    });
  });

  it("uses canonical_teams names when both sides have gb_team_id mapping", () => {
    const resolvers = {
      lookupGbTeamId: (platform, platformId) => {
        if (platform === "OB" && platformId === "h1") return "100001";
        if (platform === "PB" && platformId === "a9") return "100002";
        return null;
      },
      lookupCanonicalName: (gbTeamId) => {
        if (gbTeamId === "100001") return "Canonical Home";
        if (gbTeamId === "100002") return "Canonical Away";
        return null;
      },
    };
    const picked = teamsFromPlatformRows(
      [
        { platform: "PB", home: "PB Home", away: "PB Away", homeId: "x", awayId: "a9" },
        { platform: "OB", home: "OB Home", away: "OB Away", homeId: "h1", awayId: "y" },
      ],
      resolvers,
    );
    expect(picked).toEqual({
      platform: "OB",
      home: "Canonical Home",
      away: "Canonical Away",
      title: "Canonical Home vs Canonical Away",
      canonical: true,
    });
  });

  it("falls back to platform priority when only one side is mapped", () => {
    const resolvers = {
      lookupGbTeamId: (platform, platformId) =>
        platform === "OB" && platformId === "h1" ? "100001" : null,
      lookupCanonicalName: (gbTeamId) => (gbTeamId === "100001" ? "Canonical Home" : null),
    };
    const picked = teamsFromPlatformRows(
      [
        { platform: "PB", home: "PB Home", away: "PB Away", homeId: "x", awayId: "y" },
        { platform: "OB", home: "OB Home", away: "OB Away", homeId: "h1", awayId: "z" },
      ],
      resolvers,
    );
    expect(picked?.title).toBe("OB Home vs OB Away");
    expect(picked?.canonical).toBeUndefined();
  });
});
