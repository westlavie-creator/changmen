import { describe, expect, it } from "vitest";
import { createDefaultExtensionPrefs, normalizeExtensionPrefs } from "@/types/extensionPrefs";

describe("extensionPrefs", () => {
  it("defaults betRowUi to false", () => {
    expect(createDefaultExtensionPrefs()).toEqual({
      betRowUi: false,
      polymarketOrderSell: false,
    });
  });

  it("normalizes missing payload", () => {
    expect(normalizeExtensionPrefs(null)).toEqual({
      betRowUi: false,
      polymarketOrderSell: false,
    });
  });

  it("respects explicit true", () => {
    expect(normalizeExtensionPrefs({ betRowUi: true, polymarketOrderSell: true })).toEqual({
      betRowUi: true,
      polymarketOrderSell: true,
    });
  });
});
