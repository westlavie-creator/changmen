import { describe, expect, it } from "vitest";
import {
  KAKAXI_ARB_DETECT_ENABLED,
  isA8ExecutionMode,
  isKakaxiExecutionMode,
  resolveArbDetectEngine,
  resolveArbExecutionMode,
  usesA8ArbDetectEngine,
  usesKakaxiArbDetectEngine,
} from "@/types/arbDetectEngine";

describe("resolveArbDetectEngine", () => {
  it("defaults to a8", () => {
    expect(resolveArbDetectEngine({})).toBe("a8");
    expect(resolveArbDetectEngine({ arbDetectEngine: undefined })).toBe("a8");
    expect(resolveArbExecutionMode({})).toBe("a8");
  });

  it("resolves kakaxi when set", () => {
    expect(resolveArbDetectEngine({ arbDetectEngine: "kakaxi" })).toBe("kakaxi");
    expect(resolveArbExecutionMode({ arbDetectEngine: "kakaxi" })).toBe("kakaxi");
  });
});

describe("usesA8ArbDetectEngine", () => {
  it("is true for default and explicit a8", () => {
    expect(usesA8ArbDetectEngine({})).toBe(true);
    expect(usesA8ArbDetectEngine({ arbDetectEngine: "a8" })).toBe(true);
    expect(isA8ExecutionMode({})).toBe(true);
    expect(isA8ExecutionMode({ arbDetectEngine: "a8" })).toBe(true);
  });

  it("is false for kakaxi", () => {
    expect(usesA8ArbDetectEngine({ arbDetectEngine: "kakaxi" })).toBe(false);
    expect(isA8ExecutionMode({ arbDetectEngine: "kakaxi" })).toBe(false);
  });
});

describe("usesKakaxiArbDetectEngine", () => {
  it("is true only for kakaxi when enabled", () => {
    expect(usesKakaxiArbDetectEngine({ arbDetectEngine: "kakaxi" })).toBe(
      KAKAXI_ARB_DETECT_ENABLED,
    );
    expect(usesKakaxiArbDetectEngine({ arbDetectEngine: "a8" })).toBe(false);
    expect(isKakaxiExecutionMode({ arbDetectEngine: "kakaxi" })).toBe(true);
    expect(isKakaxiExecutionMode({ arbDetectEngine: "a8" })).toBe(false);
  });
});
