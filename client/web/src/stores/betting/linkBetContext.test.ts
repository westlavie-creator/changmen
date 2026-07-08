import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadLinkBetContext, saveLinkBetContext } from "@/stores/betting/linkBetContext";

function mockSessionStorage() {
  const data = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
    clear: () => {
      data.clear();
    },
  });
}

describe("linkBetContext", () => {
  beforeEach(() => {
    mockSessionStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("persists and loads link mapping", () => {
    saveLinkBetContext(123, 10, 100);
    expect(loadLinkBetContext(123)).toEqual({ matchId: 10, betId: 100 });
    expect(loadLinkBetContext(999)).toBeUndefined();
  });
});
