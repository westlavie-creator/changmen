import { describe, expect, it } from "vitest";
import { providerKeysForArbNotify } from "./arbNotify";

describe("providerKeysForArbNotify", () => {
  it("uses all platforms on the bet row, not account-filtered providers", () => {
    const keys = providerKeysForArbNotify({
      items: [{ type: "PB" }, { type: "RAY" }, { type: "OB" }],
    });
    expect(keys).toEqual(["PB", "RAY", "OB"]);
  });
});
