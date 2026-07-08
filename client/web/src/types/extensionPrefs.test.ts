import { describe, expect, it } from "vitest";
import { createDefaultExtensionPrefs, normalizeExtensionPrefs } from "@/types/extensionPrefs";

describe("extensionPrefs", () => {
  it("defaults betRowUi to false and singleLeg9999Precheck to true", () => {
    expect(createDefaultExtensionPrefs()).toEqual({
      betRowUi: false,
      singleLeg9999Precheck: true,
    });
  });

  it("normalizes missing payload", () => {
    expect(normalizeExtensionPrefs(null)).toEqual({
      betRowUi: false,
      singleLeg9999Precheck: true,
    });
  });

  it("respects explicit true", () => {
    expect(normalizeExtensionPrefs({ betRowUi: true })).toEqual({
      betRowUi: true,
      singleLeg9999Precheck: true,
    });
  });

  it("can disable singleLeg9999Precheck", () => {
    expect(normalizeExtensionPrefs({ singleLeg9999Precheck: false })).toEqual({
      betRowUi: false,
      singleLeg9999Precheck: false,
    });
  });
});
