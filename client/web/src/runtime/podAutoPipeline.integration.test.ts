import { describe, expect, it, vi } from "vitest";
import type { PodDropAlert } from "@/runtime/podAlerts";
import { POD_BET_SETTINGS_DEFAULTS } from "@/runtime/podBetSettings";
import { buildPodBetTicket } from "@/runtime/podBetTicket";
import { matchPodAlertToFixtures, type PodBoardFixture } from "@/runtime/podFixtureMatch";
import { scorePodYaboFollow } from "@/runtime/podYabo/score";
import { pickPodYaboAutoTicket } from "@/runtime/podYabo/auto";

const mocks = vi.hoisted(() => ({
  reserve: vi.fn(),
  finalize: vi.fn(),
  place: vi.fn(),
  append: vi.fn(),
  accounts: [{ accountId: 7, playerName: "OB-7", provider: "OB" }],
}));

vi.mock("@/api/podBetExecution", () => ({
  reservePodBetExecution: mocks.reserve,
  finalizePodBetExecution: mocks.finalize,
}));
vi.mock("@/runtime/obSportBetAccount", () => ({ pickObSportBetAccounts: () => mocks.accounts }));
vi.mock("@/runtime/obSportPlaceBet", () => ({ placeObSportSingle: mocks.place }));
vi.mock("@/runtime/podBetSettings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/runtime/podBetSettings")>()),
  readPodBetSettings: () => ({
    ...POD_BET_SETTINGS_DEFAULTS,
    followAccountIds: [7],
    obAccountRotation: false,
  }),
}));
vi.mock("@/runtime/podObAccountRotation", () => ({ pickPodObAccountsForPlacement: () => mocks.accounts }));
vi.mock("@/stores/accountStore", () => ({ useAccountStore: () => ({ accounts: mocks.accounts }) }));
vi.mock("@/stores/footballOrderStore", () => ({
  useFootballOrderStore: () => ({ appendPlaced: mocks.append }),
}));

import { placePodFollowBet, type PodFollowPlaceTicket } from "@/runtime/podFollowPlace";

describe("POD alert to OB order pipeline", () => {
  it("matches, gates, reserves, submits and persists exactly once", async () => {
    const now = 1_800_000_000_000;
    const alert: PodDropAlert = {
      id: "alert-e2e-1",
      eventId: "pin-event-1",
      sport: "Football",
      sportId: 1,
      league: "Premier League",
      home: "Arsenal",
      away: "Chelsea",
      starts: now + 3_600_000,
      alertedAt: now - 1_000,
      market: "Totals",
      lineType: "total",
      period: 0,
      outcome: "over",
      points: 2.5,
      previous: 2.1,
      current: 1.9,
      nvp: 1.85,
      dropPct: 10,
      ways: null,
    };
    const fixture: PodBoardFixture = {
      id: 1,
      title: "Arsenal vs Chelsea",
      game: "Premier League",
      startAt: alert.starts,
      obMid: "ob-mid-1",
      homeName: alert.home,
      awayName: alert.away,
      markets: [{
        id: 1,
        marketCode: "totals",
        line: 2.5,
        name: "全场大小 2.5",
        ob: true,
        quoteHome: 1.95,
        quoteAway: 1.85,
        quoteDraw: 0,
        oidHome: "oid-over",
        oidAway: "oid-under",
      }],
    };
    const settings = {
      ...POD_BET_SETTINGS_DEFAULTS,
      enabled: true,
      obStake: 50,
      followAccountIds: [7],
      autoPlace: true,
    };
    const base = buildPodBetTicket(alert, settings, now);
    expect(base).not.toBeNull();
    const fixtureMatch = matchPodAlertToFixtures(alert, [fixture]);
    expect(fixtureMatch).toMatchObject({ status: "matched", basis: "confirmed" });
    const scored = scorePodYaboFollow(base!, {
      fixture,
      live: {
        get: oid => oid === "oid-over" ? 1.95 : 0,
        has: oid => oid === "oid-over",
      },
      settings,
    });
    const candidate: PodFollowPlaceTicket = {
      id: scored.id,
      auto: true,
      stake: settings.obStake,
      accountIds: settings.followAccountIds,
      fixtureStatus: fixtureMatch.status,
      fixtureBasis: fixtureMatch.basis,
      obMid: fixture.obMid || "",
      home: alert.home,
      away: alert.away,
      sideLabel: scored.sideLabel,
      marketLabel: scored.marketLabel,
      // 实盘 WebSocket 已确认该 oid 的当前价；自动闸门只消费实时价。
      market: { ...scored.marketMatch, fromLive: true },
      quote: scored.obQuote,
    };
    expect(candidate).toMatchObject({
      fixtureStatus: "matched",
      fixtureBasis: "confirmed",
      market: { status: "matched", oid: "oid-over", fromLive: true },
      quote: { status: "ok" },
    });
    const picked = pickPodYaboAutoTicket([candidate], []);
    expect(picked?.id).toBe(alert.id);

    mocks.reserve.mockResolvedValue({ acquired: true, leaseToken: "lease-e2e", state: "reserved", venueOrderId: "" });
    mocks.place.mockResolvedValue({ ok: true, orderId: "ob-order-e2e", odds: 1.95 });
    mocks.finalize.mockResolvedValue(undefined);
    mocks.append.mockResolvedValue(undefined);
    const placed = await placePodFollowBet(picked!);
    expect(placed.ok).toBe(true);
    expect(mocks.reserve).toHaveBeenCalledTimes(1);
    expect(mocks.place).toHaveBeenCalledTimes(1);
    expect(mocks.finalize).toHaveBeenCalledWith(expect.objectContaining({ state: "accepted" }));
    expect(mocks.append).toHaveBeenCalledTimes(1);

    mocks.reserve.mockResolvedValue({ acquired: false, leaseToken: "", state: "accepted", venueOrderId: "ob-order-e2e" });
    const duplicate = await placePodFollowBet(picked!);
    expect(duplicate.ok).toBe(false);
    expect(mocks.place).toHaveBeenCalledTimes(1);
    expect(mocks.append).toHaveBeenCalledTimes(1);
  });
});
