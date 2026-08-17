import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PB_WS_SHADOW_UI_LOCAL_KEY,
  readPbWsShadowUiLocal,
  writePbWsShadowUiLocal,
} from "@/shared/pbWsShadowUiLocal";

describe("pbWsShadowUiLocal", () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, String(v));
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defaults off", () => {
    expect(readPbWsShadowUiLocal()).toBe(false);
  });

  it("persists on and clears off", () => {
    writePbWsShadowUiLocal(true);
    expect(store.get(PB_WS_SHADOW_UI_LOCAL_KEY)).toBe("1");
    expect(readPbWsShadowUiLocal()).toBe(true);
    writePbWsShadowUiLocal(false);
    expect(store.has(PB_WS_SHADOW_UI_LOCAL_KEY)).toBe(false);
    expect(readPbWsShadowUiLocal()).toBe(false);
  });
});
