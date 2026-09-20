import { describe, expect, test } from "vitest";
import {
  FOOTBALL_FOLLOW_V2_DEFAULTS,
  parseFootballFollowV2Settings,
  readFootballFollowV2Settings,
  writeFootballFollowV2Settings,
} from "@/runtime/footballFollowV2Settings";

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
}

describe("football follow v2 settings", () => {
  test("defaults keep v2 takeover disabled", () => {
    expect(readFootballFollowV2Settings(null)).toEqual(FOOTBALL_FOLLOW_V2_DEFAULTS);
    expect(FOOTBALL_FOLLOW_V2_DEFAULTS.enabled).toBe(false);
    expect(FOOTBALL_FOLLOW_V2_DEFAULTS.useDecisionForManualBlock).toBe(false);
    expect(FOOTBALL_FOLLOW_V2_DEFAULTS.useDecisionForAuto).toBe(false);
    expect(FOOTBALL_FOLLOW_V2_DEFAULTS.useQuoteV2).toBe(false);
  });

  test("parses only boolean fields", () => {
    expect(parseFootballFollowV2Settings({
      enabled: true,
      showDiagnostics: false,
      useDecisionForDisplay: "yes",
      useDecisionForManualBlock: true,
      useQuoteV2: true,
      useDecisionForAuto: true,
    })).toEqual({
      ...FOOTBALL_FOLLOW_V2_DEFAULTS,
      enabled: true,
      showDiagnostics: false,
      useDecisionForManualBlock: true,
      useQuoteV2: true,
      useDecisionForAuto: true,
    });
  });

  test("writes partial updates without losing defaults", () => {
    const storage = memoryStorage();
    const written = writeFootballFollowV2Settings({
      showDiagnostics: false,
      useQuoteV2: true,
    }, storage);

    expect(written).toEqual({
      ...FOOTBALL_FOLLOW_V2_DEFAULTS,
      showDiagnostics: false,
      useQuoteV2: true,
    });
    expect(readFootballFollowV2Settings(storage)).toEqual(written);
  });

  test("storage failures are swallowed", () => {
    const badStorage = {
      getItem: () => {
        throw new Error("boom");
      },
      setItem: () => {
        throw new Error("boom");
      },
    };

    expect(readFootballFollowV2Settings(badStorage)).toEqual(FOOTBALL_FOLLOW_V2_DEFAULTS);
    expect(writeFootballFollowV2Settings({ enabled: true }, badStorage)).toEqual({
      ...FOOTBALL_FOLLOW_V2_DEFAULTS,
      enabled: true,
    });
  });
});
