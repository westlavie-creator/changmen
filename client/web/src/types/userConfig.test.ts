import { describe, expect, it } from "vitest";
import { createDefaultUserConfig, mergeUserConfig, type UserConfig } from "@/types/userConfig";

describe("mergeUserConfig arbDetectEngine", () => {
  it("defaults to a8", () => {
    expect(mergeUserConfig(null).arbDetectEngine).toBe("a8");
    expect(mergeUserConfig(undefined).arbDetectEngine).toBe("a8");
    expect(createDefaultUserConfig().arbDetectEngine).toBe("a8");
  });

  it("reads legacy arbExecuteEngine when arbDetectEngine is absent", () => {
    expect(mergeUserConfig({ arbExecuteEngine: "kakaxi" }).arbDetectEngine).toBe("kakaxi");
    expect(mergeUserConfig({ arbExecuteEngine: "a8" }).arbDetectEngine).toBe("a8");
  });

  it("prefers arbDetectEngine over legacy arbExecuteEngine", () => {
    expect(
      mergeUserConfig({ arbDetectEngine: "a8", arbExecuteEngine: "kakaxi" }).arbDetectEngine,
    ).toBe("a8");
  });

  it("maps legacy changmen alias to kakaxi", () => {
    expect(
      mergeUserConfig({ arbExecuteEngine: "changmen" } as unknown as Partial<UserConfig>).arbDetectEngine,
    ).toBe("kakaxi");
  });

  it("does not persist arbExecuteEngine on merged config", () => {
    expect(mergeUserConfig({ arbExecuteEngine: "kakaxi" })).not.toHaveProperty("arbExecuteEngine");
    expect(mergeUserConfig({ arbDetectEngine: "kakaxi" })).not.toHaveProperty("arbExecuteEngine");
  });
});
