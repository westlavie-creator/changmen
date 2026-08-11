import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveHkRelayHttpOrigin, resolveMarketHubHttpOrigin } from "@changmen/client-core/shared/hkRelayOrigin";

describe("resolveHkRelayHttpOrigin", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("生产浏览器用同源，忽略 localStorage PROXY", () => {
    vi.stubGlobal("window", { location: { origin: "http://47.82.100.166" } });
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => (key === "PROXY" ? "http://47.57.10.202" : null),
    });
    vi.stubEnv("DEV", false);
    expect(resolveHkRelayHttpOrigin()).toBe("http://47.82.100.166");
  });

  it("dev 浏览器用同源", () => {
    vi.stubGlobal("window", { location: { origin: "http://127.0.0.1:5274", hostname: "127.0.0.1" } });
    vi.stubEnv("DEV", true);
    expect(resolveHkRelayHttpOrigin()).toBe("http://127.0.0.1:5274");
  });

  it("生产主站把 Market hub 拆到 ws.changmen.fun", () => {
    vi.stubGlobal("window", { location: { origin: "https://changmen.fun", hostname: "changmen.fun" } });
    vi.stubEnv("DEV", false);
    expect(resolveMarketHubHttpOrigin()).toBe("https://ws.changmen.fun");
    expect(resolveHkRelayHttpOrigin()).toBe("https://changmen.fun");
  });

  it("IP 入口 Market hub 仍同源", () => {
    vi.stubGlobal("window", { location: { origin: "https://47.57.10.202", hostname: "47.57.10.202" } });
    vi.stubEnv("DEV", false);
    expect(resolveMarketHubHttpOrigin()).toBe("https://47.57.10.202");
  });
});
