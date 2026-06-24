import { describe, expect, test, vi } from "vitest";

const getCollectPlatform = vi.hoisted(() => vi.fn());
const getGames = vi.hoisted(() => vi.fn());
const resolveCollectSession = vi.hoisted(() => vi.fn());
const oddsStore = vi.hoisted(() => ({ clean: vi.fn(), save: vi.fn() }));

vi.mock("@/api/esport", () => ({
  getCollectPlatform,
  getGames,
}));

vi.mock("@/shared/http", () => ({
  directPostJson: vi.fn(),
}));

vi.mock("@platform/shared/collectSession", () => ({
  resolveCollectSession,
}));

vi.mock("@/shared/wait", () => ({
  wait: vi.fn(() => new Promise(() => {})),
}));

vi.mock("@platform/shared/collectNotify", () => ({
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

describe("IMT collect platform parity", () => {
  test("reads platform config before checking account session, matching A8 tJ", async () => {
    const { startImtCollector } = await import("./collect");
    getCollectPlatform.mockResolvedValue({ Gateway: "https://imt.example", BetName: "winner" });
    getGames.mockResolvedValue(["43"]);
    resolveCollectSession.mockResolvedValue(null);

    const stop = startImtCollector();
    await vi.waitFor(() => expect(resolveCollectSession).toHaveBeenCalled());
    stop();

    expect(getCollectPlatform).toHaveBeenCalledWith("IMT");
    expect(getGames).toHaveBeenCalledWith("IMT");
    expect(getCollectPlatform.mock.invocationCallOrder[0]).toBeLessThan(
      resolveCollectSession.mock.invocationCallOrder[0]!,
    );
  });
});
