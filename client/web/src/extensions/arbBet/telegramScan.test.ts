import { describe, expect, it } from "vitest";
import { providerKeysFromBetItems } from "@changmen/arb-core/providerKeys";

describe("providerKeysFromBetItems (Telegram 全盘口)", () => {
  it("uses all platforms on the bet row", () => {
    const keys = providerKeysFromBetItems({
      items: [{ type: "PB" }, { type: "RAY" }, { type: "OB" }],
    });
    expect(keys).toEqual(["PB", "RAY", "OB"]);
  });
});
