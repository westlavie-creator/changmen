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

  it("parses source segment from prebuilt label", () => {
    const parts = buildPmSportDisplayParts({
      label: "未开始 · 图内0-0 · 来源 kick.com/cct_cs",
      resolutionSource: "https://kick.com/cct_cs",
    });
    expect(parts.at(-1)).toEqual({
      kind: "link",
      text: "来源 kick.com/cct_cs",
      href: "https://kick.com/cct_cs",
    });
  });

  it("normalizes bare host resolutionSource", () => {
    expect(normalizeResolutionSourceHref("kick.com/cct_cs")).toBe("https://kick.com/cct_cs");
    expect(formatResolutionSourceLabel("https://www.twitch.tv/valorant_tur")).toBe("来源 twitch.tv/valorant_tur");
  });
});
