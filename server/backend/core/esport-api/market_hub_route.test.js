import { beforeEach, describe, expect, it, vi } from "vitest";

const mem = new Map();

vi.mock("@changmen/storage/json_file_store.js", () => ({
  readJsonFile: (name, fallback) => (mem.has(name) ? mem.get(name) : fallback),
  writeJsonFile: (name, data) => {
    mem.set(name, data);
  },
}));

describe("market_hub_route", () => {
  beforeEach(() => {
    mem.clear();
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("defaults: gb11–15 → ws, others → ws2", async () => {
    const mod = await import("./market_hub_route.js");
    expect(mod.resolveMarketHubOriginForUser("GB11")).toBe("https://ws.changmen.fun");
    expect(mod.resolveMarketHubOriginForUser("gb15")).toBe("https://ws.changmen.fun");
    expect(mod.resolveMarketHubOriginForUser("gb16")).toBe("https://ws2.changmen.fun");
    expect(mod.resolveMarketHubOriginForUser("")).toBe("https://ws2.changmen.fun");
  });

  it("env list overrides default when no file", async () => {
    vi.stubEnv("MARKET_HUB_PRIMARY_USERS", "alice, Bob");
    const mod = await import("./market_hub_route.js");
    expect(mod.resolveMarketHubOriginForUser("alice")).toBe("https://ws.changmen.fun");
    expect(mod.resolveMarketHubOriginForUser("bob")).toBe("https://ws.changmen.fun");
    expect(mod.resolveMarketHubOriginForUser("gb11")).toBe("https://ws2.changmen.fun");
  });

  it("empty primaryUsers means everyone on secondary", async () => {
    const mod = await import("./market_hub_route.js");
    mod.saveMarketHubRouteConfig({ primaryUsers: [] });
    expect(mod.getMarketHubRouteConfig().primaryUsers).toEqual([]);
    expect(mod.resolveMarketHubOriginForUser("gb11")).toBe("https://ws2.changmen.fun");
  });

  it("rejects non-allowlisted origin", async () => {
    const mod = await import("./market_hub_route.js");
    expect(() => mod.saveMarketHubRouteConfig({
      primaryOrigin: "https://evil.example",
    })).toThrow(/非法/);
    expect(mod.normalizeMarketHubOrigin("http://ws.changmen.fun")).toBeNull();
    expect(mod.normalizeMarketHubOrigin("https://ws.changmen.fun/")).toBe("https://ws.changmen.fun");
  });

  it("file overrides env", async () => {
    vi.stubEnv("MARKET_HUB_PRIMARY_USERS", "alice");
    const mod = await import("./market_hub_route.js");
    mod.saveMarketHubRouteConfig({ primaryUsers: ["carol"] });
    expect(mod.resolveMarketHubOriginForUser("carol")).toBe("https://ws.changmen.fun");
    expect(mod.resolveMarketHubOriginForUser("alice")).toBe("https://ws2.changmen.fun");
  });
});
