import { describe, expect, it } from "vitest";
import { resolveArbProviderKeys } from "@changmen/arb-core/providerKeys";

describe("resolveArbProviderKeys", () => {
  it("display scope returns all bet row platforms", () => {
    const keys = resolveArbProviderKeys("display", {
      bet: { items: [{ type: "PB" }, { type: "RAY" }] },
    });
    expect(keys).toEqual(["PB", "RAY"]);
  });

  it("auto scope returns only online account providers", () => {
    const keys = resolveArbProviderKeys("auto", {
      accountProviderKeys: ["OB", "PB"],
    });
    expect(keys).toEqual(["OB", "PB"]);
  });

  it("auto scope returns empty when no accounts", () => {
    expect(resolveArbProviderKeys("auto", {})).toEqual([]);
  });
});
