import { describe, expect, test, vi } from "vitest";

const hasA8PluginRuntime = vi.hoisted(() => vi.fn());
const getCollectPlatform = vi.hoisted(() => vi.fn());
const resolvePbAccount = vi.hoisted(() => vi.fn());
const oddsStore = vi.hoisted(() => ({ clean: vi.fn() }));

vi.mock("@/chrome-plugin/bridge", () => ({
  hasA8PluginRuntime,
}));

vi.mock("@/api/esport", () => ({
  getCollectPlatform,
}));

vi.mock("./transport", () => ({
  PB_PLUGIN_REQUIRED_MSG: "plugin required",
  pbCollectEuroOdds: vi.fn(),
  resolvePbAccount,
}));

vi.mock("@/shared/wait", () => ({
  wait: vi.fn(() => new Promise(() => {})),
}));

vi.mock("@venue/shared/collectNotify", () => ({
  notifyCollectError: vi.fn(),
}));

vi.mock("@/stores/collectStore", () => ({
  useCollectStore: () => ({ saveMatch: vi.fn(), saveBets: vi.fn() }),
}));

vi.mock("@/stores/oddsStore", () => ({
  useOddsStore: () => oddsStore,
}));

vi.mock("@/stores/matchStore", () => ({
  useMatchStore: () => ({ refreshOddsOnBets: vi.fn() }),
}));

describe("PB collect platform parity", () => {
  test("reads platform config before checking the PB account, matching A8 XY", async () => {
    const { startPbCollector } = await import("./collect");
    hasA8PluginRuntime.mockReturnValue(true);
    getCollectPlatform.mockResolvedValue({ Gateway: "https://pb.example", BetName: "winner" });
    resolvePbAccount.mockReturnValue(null);

    const stop = startPbCollector();
    await vi.waitFor(() => expect(resolvePbAccount).toHaveBeenCalled());
    stop();

    expect(getCollectPlatform).toHaveBeenCalledWith("PB");
    expect(getCollectPlatform.mock.invocationCallOrder[0]).toBeLessThan(
      resolvePbAccount.mock.invocationCallOrder[0]!,
    );
  });
});
