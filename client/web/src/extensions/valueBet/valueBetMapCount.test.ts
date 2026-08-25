import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  VALUE_BET_MAP_COUNT_STORAGE_KEY,
  getValueBetMapCount,
  recordValueBetMapFill,
  resetValueBetMapCountForTests,
  staleValueBetMapCountMemoryForTests,
  syncValueBetMapCountsFromStorage,
} from "@/extensions/valueBet/valueBetMapCount";

function mockLocalStorage() {
  const data = new Map<string, string>();
  vi.stubGlobal("localStorage", {
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
  vi.stubGlobal("sessionStorage", {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
  });
}

describe("valueBetMapCount", () => {
  beforeEach(() => {
    mockLocalStorage();
    resetValueBetMapCountForTests();
  });

  afterEach(() => {
    resetValueBetMapCountForTests();
    vi.unstubAllGlobals();
  });

  it("starts at 0 and increments per match:round", () => {
    expect(getValueBetMapCount(10, 1)).toBe(0);
    expect(recordValueBetMapFill(10, 1)).toBe(1);
    expect(recordValueBetMapFill(10, 1)).toBe(2);
    expect(getValueBetMapCount(10, 0)).toBe(0);
    expect(recordValueBetMapFill(10, 0)).toBe(1);
  });

  it("sync + record honor peer-tab storage before in-memory catches up", () => {
    // Tab A filled and wrote localStorage.
    localStorage.setItem(VALUE_BET_MAP_COUNT_STORAGE_KEY, JSON.stringify({ "10:1": 1 }));
    // Tab B: already loaded, memory empty, storage event not delivered yet.
    staleValueBetMapCountMemoryForTests();
    expect(getValueBetMapCount(10, 1)).toBe(0);

    syncValueBetMapCountsFromStorage();
    expect(getValueBetMapCount(10, 1)).toBe(1);

    // Next fill must become 2, not overwrite peer with 1.
    staleValueBetMapCountMemoryForTests();
    expect(recordValueBetMapFill(10, 1)).toBe(2);
    expect(getValueBetMapCount(10, 1)).toBe(2);
  });
});
