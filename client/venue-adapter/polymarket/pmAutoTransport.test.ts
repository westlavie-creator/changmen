import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyPmAutoTransportOnLogin,
  markPmTransportManualOverride,
  resetPmTransportManualOverrideForTests,
} from "./pmAutoTransport";
import { resetPmMarketWsSourceModeForTests, getPmMarketWsSourceMode } from "./pmMarketWsMode";
import { resetPmUserWsSourceModeForTests, getPmUserWsSourceMode } from "./pmUserWsMode";
import { setPmHttpModeForTests, resolvePmHttpMode } from "./pmTransportMode";
import * as reachability from "./pmOfficialReachability";

vi.mock("@changmen/client-core/chrome-plugin/bridge", () => ({
  probeGamebetExtension: vi.fn(async () => null),
}));

import { probeGamebetExtension } from "@changmen/client-core/chrome-plugin/bridge";

describe("pmAutoTransport", () => {
  beforeEach(() => {
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { storage.set(key, value); },
      removeItem: (key: string) => { storage.delete(key); },
    });
    resetPmTransportManualOverrideForTests();
    resetPmMarketWsSourceModeForTests("changmen");
    resetPmUserWsSourceModeForTests("changmen");
    setPmHttpModeForTests(null);
    vi.mocked(probeGamebetExtension).mockReset();
    vi.mocked(probeGamebetExtension).mockResolvedValue(null);
    vi.restoreAllMocks();
    vi.mocked(probeGamebetExtension).mockResolvedValue(null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses official WS + extension HTTP when market WS probe succeeds and plugin is ready", async () => {
    vi.spyOn(reachability, "probePolymarketOfficialReachable").mockResolvedValue({
      reachable: true,
      httpOk: true,
      marketWsOk: true,
    });
    vi.mocked(probeGamebetExtension).mockResolvedValue({
      name: "gamebet",
      version: "1.0.0",
      extensionId: "test-ext",
    });

    const result = await applyPmAutoTransportOnLogin();
    expect(result.applied).toBe(true);
    expect(result.httpMode).toBe("extension");
    expect(getPmMarketWsSourceMode()).toBe("official");
    expect(getPmUserWsSourceMode()).toBe("official");
    expect(resolvePmHttpMode()).toBe("extension");
  });

  it("uses official WS and vps HTTP when plugin is missing", async () => {
    vi.spyOn(reachability, "probePolymarketOfficialReachable").mockResolvedValue({
      reachable: true,
      httpOk: false,
      marketWsOk: true,
    });
    vi.mocked(probeGamebetExtension).mockResolvedValue(null);

    const result = await applyPmAutoTransportOnLogin();
    expect(result.marketWsMode).toBe("official");
    expect(result.httpMode).toBe("vps");
  });

  it("falls back to changmen/vps when probe fails", async () => {
    vi.spyOn(reachability, "probePolymarketOfficialReachable").mockResolvedValue({
      reachable: false,
      httpOk: false,
      marketWsOk: false,
    });

    const result = await applyPmAutoTransportOnLogin();
    expect(result.applied).toBe(true);
    expect(result.httpMode).toBe("vps");
    expect(getPmMarketWsSourceMode()).toBe("changmen");
    expect(getPmUserWsSourceMode()).toBe("changmen");
    expect(resolvePmHttpMode()).toBe("vps");
  });

  it("skips auto routing after manual override", async () => {
    markPmTransportManualOverride();
    const probe = vi.spyOn(reachability, "probePolymarketOfficialReachable");

    const result = await applyPmAutoTransportOnLogin();
    expect(result.skippedManualOverride).toBe(true);
    expect(probe).not.toHaveBeenCalled();
  });
});
