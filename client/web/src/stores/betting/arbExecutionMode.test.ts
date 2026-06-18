import { describe, expect, it } from "vitest";
import {
  isA8ExecutionMode,
  isKakaxiExecutionMode,
  resolveArbExecutionMode,
} from "@/stores/betting/arbExecutionMode";

describe("resolveArbExecutionMode", () => {
  it("defaults to a8", () => {
    expect(resolveArbExecutionMode({})).toBe("a8");
  });

  it("resolves kakaxi when set", () => {
    expect(resolveArbExecutionMode({ arbDetectEngine: "kakaxi" })).toBe("kakaxi");
  });
});

describe("isA8ExecutionMode", () => {
  it("is true for a8 and default", () => {
    expect(isA8ExecutionMode({})).toBe(true);
    expect(isA8ExecutionMode({ arbDetectEngine: "a8" })).toBe(true);
  });

  it("is false for kakaxi", () => {
    expect(isA8ExecutionMode({ arbDetectEngine: "kakaxi" })).toBe(false);
  });
});

describe("isKakaxiExecutionMode", () => {
  it("is true only for kakaxi", () => {
    expect(isKakaxiExecutionMode({ arbDetectEngine: "kakaxi" })).toBe(true);
    expect(isKakaxiExecutionMode({ arbDetectEngine: "a8" })).toBe(false);
  });
});
