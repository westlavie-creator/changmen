import { describe, expect, it } from "vitest";
import {
  KAKAXI_ARB_DETECT_ENABLED,
  resolveArbDetectEngine,
  usesA8ArbDetectEngine,
  usesKakaxiArbDetectEngine,
} from "@/types/arbDetectEngine";

describe("resolveArbDetectEngine", () => {
  it("defaults to a8", () => {
    expect(resolveArbDetectEngine({})).toBe("a8");
    expect(resolveArbDetectEngine({ arbDetectEngine: undefined })).toBe("a8");
  });

  it("keeps resolving to a8 when kakaxi is set", () => {
    expect(resolveArbDetectEngine({ arbDetectEngine: "kakaxi" })).toBe("a8");
  });
});

describe("usesA8ArbDetectEngine", () => {
  it("is true for default and explicit a8", () => {
    expect(usesA8ArbDetectEngine({})).toBe(true);
    expect(usesA8ArbDetectEngine({ arbDetectEngine: "a8" })).toBe(true);
  });

  it("is true for legacy kakaxi config", () => {
    expect(usesA8ArbDetectEngine({ arbDetectEngine: "kakaxi" })).toBe(true);
  });
});

describe("usesKakaxiArbDetectEngine", () => {
  it("is disabled", () => {
    expect(KAKAXI_ARB_DETECT_ENABLED).toBe(false);
    expect(usesKakaxiArbDetectEngine({ arbDetectEngine: "kakaxi" })).toBe(false);
    expect(usesKakaxiArbDetectEngine({ arbDetectEngine: "a8" })).toBe(false);
  });
});
