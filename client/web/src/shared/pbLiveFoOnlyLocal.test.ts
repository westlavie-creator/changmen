import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  readPbLiveFoOnlyLocal,
  writePbLiveFoOnlyLocal,
} from "./pbLiveFoOnlyLocal";

/** @deprecated shim — 语义与 pbExtensionsLocal 相反 */
describe("pbLiveFoOnlyLocal (deprecated shim)", () => {
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

  test("default true (A8 live only)", () => {
    expect(readPbLiveFoOnlyLocal()).toBe(true);
  });

  test("write false enables changmen extensions", () => {
    writePbLiveFoOnlyLocal(false);
    expect(readPbLiveFoOnlyLocal()).toBe(false);
  });
});
