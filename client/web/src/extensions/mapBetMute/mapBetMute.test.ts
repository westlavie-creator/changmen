import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MIN_FOLDABLE_MAP,
  MAP_BET_MUTE_SESSION_KEY,
  canFoldMap,
  clearMapMute,
  isMapMuteActive,
  isMapMuted,
  muteKey,
  resetMapBetMuteForTests,
  toggleMapMute,
} from "@/extensions/mapBetMute/mapBetMute";

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

describe("mapBetMute", () => {
  beforeEach(() => {
    mockSessionStorage();
    resetMapBetMuteForTests();
  });

  it("only maps >= 3 are foldable", () => {
    expect(MIN_FOLDABLE_MAP).toBe(3);
    expect(canFoldMap(0)).toBe(false);
    expect(canFoldMap(1)).toBe(false);
    expect(canFoldMap(2)).toBe(false);
    expect(canFoldMap(3)).toBe(true);
    expect(canFoldMap(4)).toBe(true);
    expect(canFoldMap(5)).toBe(true);
  });

  it("toggle no-ops for maps 0-2", () => {
    expect(toggleMapMute(100, 0)).toBe(false);
    expect(toggleMapMute(100, 2)).toBe(false);
    expect(isMapMuted(100, 0)).toBe(false);
    expect(isMapMuted(100, 2)).toBe(false);
    expect(sessionStorage.getItem(MAP_BET_MUTE_SESSION_KEY)).toBeNull();
  });

  it("toggle mutes and unmutes map 3", () => {
    expect(toggleMapMute(100, 3)).toBe(true);
    expect(isMapMuted(100, 3)).toBe(true);
    expect(toggleMapMute(100, 3)).toBe(false);
    expect(isMapMuted(100, 3)).toBe(false);
  });

  it("toggle mutes and unmutes map 5", () => {
    expect(isMapMuted(100, 5)).toBe(false);
    expect(toggleMapMute(100, 5)).toBe(true);
    expect(isMapMuted(100, 5)).toBe(true);
    expect(JSON.parse(sessionStorage.getItem(MAP_BET_MUTE_SESSION_KEY)!)).toEqual([
      muteKey(100, 5),
    ]);
    expect(toggleMapMute(100, 5)).toBe(false);
    expect(isMapMuted(100, 5)).toBe(false);
  });

  it("does not mute other maps on same match", () => {
    toggleMapMute(100, 5);
    expect(isMapMuted(100, 4)).toBe(false);
    expect(isMapMuted(100, 6)).toBe(false);
    expect(isMapMuted(101, 5)).toBe(false);
  });

  it("live round disables mute and clearMapMute removes key", () => {
    toggleMapMute(100, 5);
    expect(isMapMuteActive(100, 5, 0)).toBe(true);
    expect(isMapMuteActive(100, 5, 5)).toBe(false);
    expect(isMapMuteActive(100, 5, 4)).toBe(true);
    clearMapMute(100, 5);
    expect(isMapMuted(100, 5)).toBe(false);
  });
});
