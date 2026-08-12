import { afterEach, describe, expect, it, vi } from "vitest";
import {
  resolveHkRelayHttpOrigin,
  resolveMarketHubHttpOrigin,
  setAssignedMarketHubOrigin,
} from "@changmen/client-core/shared/hkRelayOrigin";

describe("resolveHkRelayHttpOrigin", () => {
  afterEach(() => {
    setAssignedMarketHubOrigin("");
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

  it("生产主站：未下发 origin 走 ws（202）", () => {
    vi.stubGlobal("window", { location: { origin: "https://changmen.fun", hostname: "changmen.fun" } });
    vi.stubEnv("DEV", false);
    expect(resolveMarketHubHttpOrigin()).toBe("https://ws.changmen.fun");
    expect(resolveHkRelayHttpOrigin()).toBe("https://changmen.fun");
  });

  it("生产主站：GetUserInfo 下发 ws 则走 202", () => {
    vi.stubGlobal("window", { location: { origin: "https://changmen.fun", hostname: "changmen.fun" } });
    vi.stubEnv("DEV", false);
    setAssignedMarketHubOrigin("https://ws.changmen.fun/");
    expect(resolveMarketHubHttpOrigin()).toBe("https://ws.changmen.fun");
  });

  it("生产主站：下发 ws2 不因本地用户名改走 202", () => {
    vi.stubGlobal("window", { location: { origin: "https://changmen.fun", hostname: "changmen.fun" } });
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => (key === "app:userName" ? "gb11" : null),
    });
    vi.stubEnv("DEV", false);
    setAssignedMarketHubOrigin("https://ws2.changmen.fun");
    expect(resolveMarketHubHttpOrigin()).toBe("https://ws2.changmen.fun");
  });

  it("IP 入口 Market hub 仍同源", () => {
    vi.stubGlobal("window", { location: { origin: "https://47.57.10.202", hostname: "47.57.10.202" } });
    vi.stubEnv("DEV", false);
    setAssignedMarketHubOrigin("https://ws.changmen.fun");
    expect(resolveMarketHubHttpOrigin()).toBe("https://47.57.10.202");
  });
});
