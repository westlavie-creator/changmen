import { describe, expect, it, beforeEach, vi } from "vitest";
import { isAudioFile } from "./customStore";
import { normalizeOrderSoundPrefs, orderSoundStorageKey, saveOrderSoundPrefs, loadOrderSoundPrefs } from "./prefs";
import { resetOrderSoundStateForTests, shouldPlayDebounced, stopOrderSound, isOrderSoundPlaying } from "./player";
import { DEFAULT_ORDER_SOUND_PREFS } from "./types";

function mockLocalStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => { store.clear(); },
  });
  return store;
}

describe("orderSound prefs", () => {
  beforeEach(() => {
    mockLocalStorage();
  });

  it("isolates prefs by userName", () => {
    saveOrderSoundPrefs({ ...DEFAULT_ORDER_SOUND_PREFS, enabled: true, presetId: "bell" }, "alice");
    saveOrderSoundPrefs({ ...DEFAULT_ORDER_SOUND_PREFS, enabled: true, presetId: "ding" }, "bob");
    expect(loadOrderSoundPrefs("alice").presetId).toBe("bell");
    expect(loadOrderSoundPrefs("bob").presetId).toBe("ding");
    expect(orderSoundStorageKey("alice")).not.toBe(orderSoundStorageKey("bob"));
  });

  it("normalizes custom file metadata", () => {
    expect(normalizeOrderSoundPrefs({
      enabled: true,
      presetId: "custom",
      customFileName: "order.mp3",
      customSource: "handle",
      volume: 0.5,
    })).toEqual({
      enabled: true,
      presetId: "custom",
      volume: 0.5,
      playMode: "debounced",
      customFileName: "order.mp3",
      customSource: "handle",
    });
  });
});

describe("isAudioFile", () => {
  it("accepts mime and extension", () => {
    expect(isAudioFile(new File([], "a.mp3", { type: "audio/mpeg" }))).toBe(true);
    expect(isAudioFile(new File([], "a.txt", { type: "text/plain" }))).toBe(false);
    expect(isAudioFile(new File([], "b.WAV", { type: "" }))).toBe(true);
  });
});

describe("shouldPlayDebounced", () => {
  beforeEach(() => {
    resetOrderSoundStateForTests();
  });

  it("allows first play and blocks duplicate within window", () => {
    const now = 1_000_000;
    expect(shouldPlayDebounced("bet-1", now)).toBe(true);
    expect(shouldPlayDebounced("bet-1", now + 500)).toBe(false);
    expect(shouldPlayDebounced("bet-1", now + 2000)).toBe(true);
    expect(shouldPlayDebounced("bet-2", now + 500)).toBe(true);
  });
});

describe("stopOrderSound", () => {
  beforeEach(() => {
    resetOrderSoundStateForTests();
  });

  it("clears playing state", async () => {
    await stopOrderSound();
    expect(isOrderSoundPlaying()).toBe(false);
  });
});
