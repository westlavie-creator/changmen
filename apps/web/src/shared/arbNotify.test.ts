import { describe, expect, it } from "vitest";
import { resolveArbProviderKeys } from "@/domain/betting";

describe("resolveArbProviderKeys (display)", () => {
  it("uses all platforms on the bet row, not account-filtered providers", () => {
    const keys = resolveArbProviderKeys("display", {
      bet: { items: [{ type: "PB" }, { type: "RAY" }, { type: "OB" }] },
    });
    expect(keys).toEqual(["PB", "RAY", "OB"]);
  });
});
