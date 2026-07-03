import { describe, expect, it } from "vitest";
import { createDefaultExtensionPrefs, normalizeExtensionPrefs } from "@/types/extensionPrefs";

describe("extensionPrefs", () => {
  it("defaults betRowUi to false", () => {
    expect(createDefaultExtensionPrefs()).toEqual({ betRowUi: false });
  });

  it("normalizes missing payload", () => {
    expect(normalizeExtensionPrefs(null)).toEqual({ betRowUi: false });
  });

  it("respects explicit true", () => {
    expect(normalizeExtensionPrefs({ betRowUi: true })).toEqual({ betRowUi: true });
  });
});
