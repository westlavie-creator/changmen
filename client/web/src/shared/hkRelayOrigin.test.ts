import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveHkRelayHttpOrigin } from "@changmen/client-core/shared/hkRelayOrigin";

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
    vi.stubGlobal("window", { location: { origin: "http://127.0.0.1:5274" } });
    vi.stubEnv("DEV", true);
    expect(resolveHkRelayHttpOrigin()).toBe("http://127.0.0.1:5274");
  });
});
