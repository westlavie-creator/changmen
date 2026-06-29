import { describe, expect, it } from "vitest";
import {
  buildPmSportDisplayParts,
  formatResolutionSourceLabel,
  isPlaceholderInMapScore,
  normalizeResolutionSourceHref,
} from "./pmSportDisplay";

describe("pmSportDisplay", () => {
  it("builds link part for resolutionSource", () => {
    const parts = buildPmSportDisplayParts({
      status: "not_started",
      resolutionSource: "https://kick.com/cct_cs",
    });
    expect(parts).toEqual([
      { kind: "text", text: "未开始" },
      { kind: "link", text: "来源 kick.com/cct_cs", href: "https://kick.com/cct_cs" },
    ]);
  });

  it("parses source segment from prebuilt label", () => {
    const parts = buildPmSportDisplayParts({
      label: "未开始 · 图内0-0 · 来源 kick.com/cct_cs",
      resolutionSource: "https://kick.com/cct_cs",
    });
    expect(parts.some(p => p.kind === "text" && p.text.includes("图内0-0"))).toBe(false);
    expect(parts.at(-1)).toEqual({
      kind: "link",
      text: "来源 kick.com/cct_cs",
      href: "https://kick.com/cct_cs",
    });
  });

  it("hides PM placeholder in-map during live map 2", () => {
    expect(isPlaceholderInMapScore("0-0", {
      live: true,
      currentMap: 2,
      mapScore: { home: 1, away: 0 },
    })).toBe(true);
    const parts = buildPmSportDisplayParts({
      status: "running",
      live: true,
      period: "2/3",
      currentMap: 2,
      mapScore: { home: 1, away: 0 },
      inMapScore: "0-0",
    });
    expect(parts.some(p => p.text.includes("图内"))).toBe(false);
  });

  it("shows PM in-map score when non-placeholder", () => {
    const parts = buildPmSportDisplayParts({
      status: "running",
      live: true,
      period: "2/3",
      currentMap: 2,
      mapScore: { home: 1, away: 0 },
      inMapScore: "8-5",
    });
    expect(parts.some(p => p.text === "图内8-5")).toBe(true);
  });

  it("normalizes bare host resolutionSource", () => {
    expect(normalizeResolutionSourceHref("kick.com/cct_cs")).toBe("https://kick.com/cct_cs");
    expect(formatResolutionSourceLabel("https://www.twitch.tv/valorant_tur")).toBe("来源 twitch.tv/valorant_tur");
  });
});
