import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyPmAutoTransportOnLogin,
  markPmTransportManualOverride,
  resetPmTransportManualOverrideForTests,
  syncPmHttpModeWithMarketWs,
} from "./pmAutoTransport";
import { resetPmMarketWsSourceModeForTests, getPmMarketWsSourceMode, setPmMarketWsSourceMode } from "./pmMarketWsMode";
import { resetPmUserWsSourceModeForTests, getPmUserWsSourceMode } from "./pmUserWsMode";
import { setPmHttpModeForTests, resolvePmHttpMode, setPmHttpMode } from "./pmTransportMode";
import * as reachability from "./pmOfficialReachability";

vi.mock("@changmen/client-core/chrome-plugin/bridge", () => ({
  probeGamebetExtension: vi.fn(async () => null),
  a8PluginGet: vi.fn(),
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
    vi.restoreAllMocks();
    vi.mocked(probeGamebetExtension).mockResolvedValue(null);
    vi.spyOn(reachability, "probePolymarketClobViaExtension").mockResolvedValue(false);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses official WS + extension HTTP when WS ok and plugin CLOB probe succeeds", async () => {
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
    vi.mocked(reachability.probePolymarketClobViaExtension).mockResolvedValue(true);

    const result = await applyPmAutoTransportOnLogin();
    expect(result.applied).toBe(true);
    expect(result.httpMode).toBe("extension");
    expect(getPmMarketWsSourceMode()).toBe("official");
    expect(getPmUserWsSourceMode()).toBe("official");
    expect(resolvePmHttpMode()).toBe("extension");
  });

  it("uses official WS and vps HTTP when plugin exists but CLOB probe fails", async () => {
    vi.spyOn(reachability, "probePolymarketOfficialReachable").mockResolvedValue({
      reachable: true,
      httpOk: false,
      marketWsOk: true,
    });
    vi.mocked(probeGamebetExtension).mockResolvedValue({
      name: "gamebet",
      version: "1.0.0",
      extensionId: "test-ext",
    });
    vi.mocked(reachability.probePolymarketClobViaExtension).mockResolvedValue(false);

    const result = await applyPmAutoTransportOnLogin();
    expect(result.marketWsMode).toBe("official");
    expect(result.httpMode).toBe("vps");
    expect(resolvePmHttpMode()).toBe("vps");
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

  it("skips auto routing after manual override but reconciles extension HTTP when WS is changmen", async () => {
    setPmMarketWsSourceMode("changmen");
    setPmHttpMode("extension");
    markPmTransportManualOverride();
    const probe = vi.spyOn(reachability, "probePolymarketOfficialReachable");

    const result = await applyPmAutoTransportOnLogin();
    expect(result.skippedManualOverride).toBe(true);
    expect(probe).not.toHaveBeenCalled();
    expect(result.httpMode).toBe("vps");
    expect(resolvePmHttpMode()).toBe("vps");
  });

  it("under manual override + official WS, demotes extension when CLOB probe fails", async () => {
    setPmMarketWsSourceMode("official");
    setPmHttpMode("extension");
    markPmTransportManualOverride();
    vi.mocked(reachability.probePolymarketClobViaExtension).mockResolvedValue(false);

    const result = await applyPmAutoTransportOnLogin();
    expect(result.skippedManualOverride).toBe(true);
    expect(result.httpMode).toBe("vps");
    expect(resolvePmHttpMode()).toBe("vps");
  });

  it("under manual override + official WS, keeps extension when CLOB probe succeeds", async () => {
    setPmMarketWsSourceMode("official");
    setPmHttpMode("extension");
    markPmTransportManualOverride();
    vi.mocked(reachability.probePolymarketClobViaExtension).mockResolvedValue(true);

    const result = await applyPmAutoTransportOnLogin();
    expect(result.skippedManualOverride).toBe(true);
    expect(result.httpMode).toBe("extension");
    expect(resolvePmHttpMode()).toBe("extension");
  });

  it("syncPmHttpModeWithMarketWs forces vps for changmen WS", async () => {
    setPmHttpMode("extension");
    const mode = await syncPmHttpModeWithMarketWs("changmen");
    expect(mode).toBe("vps");
    expect(resolvePmHttpMode()).toBe("vps");
  });
});
