import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  PB_EXTENSIONS_LOCAL_KEY,
  readPbChangmenExtensionsLocal,
  writePbChangmenExtensionsLocal,
} from "./pbExtensionsLocal";

describe("pbExtensionsLocal", () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    });
  });

  test("default off (A8)", () => {
    expect(readPbChangmenExtensionsLocal()).toBe(false);
  });

  test("round-trip on", () => {
    writePbChangmenExtensionsLocal(true);
    expect(localStorage.getItem(PB_EXTENSIONS_LOCAL_KEY)).toBe("1");
    expect(readPbChangmenExtensionsLocal()).toBe(true);
    writePbChangmenExtensionsLocal(false);
    expect(localStorage.getItem(PB_EXTENSIONS_LOCAL_KEY)).toBeNull();
    expect(readPbChangmenExtensionsLocal()).toBe(false);
  });

  test("migrates legacy pbLiveFoOnly=1 to extensions off", () => {
    localStorage.setItem("changmen:pbLiveFoOnly", "1");
    expect(readPbChangmenExtensionsLocal()).toBe(false);
  });
});
