import { describe, expect, it } from "vitest";
import {
  buildPmSportDisplayParts,
  formatResolutionSourceLabel,
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

  it("shows PM map score and period only", () => {
    const parts = buildPmSportDisplayParts({
      status: "running",
      live: true,
      period: "2/3",
      mapScore: { home: 1, away: 0 },
    });
    expect(parts[0]).toEqual({ kind: "text", text: "进行中 · 2/3 · 1-0" });
    expect(parts.some(p => p.kind === "text" && String(p.text).includes("图"))).toBe(false);
  });

  it("normalizes bare host resolutionSource", () => {
    expect(normalizeResolutionSourceHref("kick.com/cct_cs")).toBe("https://kick.com/cct_cs");
    expect(formatResolutionSourceLabel("https://www.twitch.tv/valorant_tur")).toBe("来源 twitch.tv/valorant_tur");
  });
});
