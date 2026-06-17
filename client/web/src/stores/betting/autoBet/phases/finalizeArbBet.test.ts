import { beforeEach, describe, expect, it, vi } from "vitest";
import { BetOption } from "@/models/betOption";
import { BetResult } from "@/models/betResult";
import { PlatformAccount } from "@/models/platformAccount";
import { ViewBet, type ViewMatch } from "@/models/match";
import { createDefaultUserConfig } from "@/types/userConfig";
import type { VenueOrder } from "@platform/contract";

const {
  waitRejectDetection,
  syncVenueRejectFlags,
  applyArbMakeUpFromRejects,
  markSuccessfulBet,
  saveOrderBind,
  refreshBalance,
  bettingMessage,
} = vi.hoisted(() => ({
  waitRejectDetection: vi.fn(),
  syncVenueRejectFlags: vi.fn(),
  applyArbMakeUpFromRejects: vi.fn(),
  markSuccessfulBet: vi.fn(),
  saveOrderBind: vi.fn(),
  refreshBalance: vi.fn(),
  bettingMessage: vi.fn(),
}));

vi.mock("@/stores/betting/autoBet/rejectWait", () => ({
  rejectWaitSeconds: vi.fn(() => 3),
  waitRejectDetection,
}));

vi.mock("@/stores/betting/autoBet/venueRejectSync", () => ({
  syncVenueRejectFlags,
}));

vi.mock("@/stores/betting/autoBet/arbMakeUpFromRejects", () => ({
  applyArbMakeUpFromRejects,
}));

vi.mock("@/stores/betting/successMarkers", () => ({
  markSuccessfulBet,
  readUsedAccounts: vi.fn(() => []),
}));

vi.mock("@/api/esport", () => ({
  saveOrderBind,
}));

vi.mock("@/stores/accountStore", () => ({
  useAccountStore: () => ({ refreshBalance }),
}));

vi.mock("@/stores/loseOrderStore", () => ({
  useLoseOrderStore: () => ({ orders: new Map() }),
}));

vi.mock("@/stores/messageStore", () => ({
  useMessageStore: () => ({ bettingMessage }),
}));

vi.mock("@/stores/matchStore", () => ({
  useMatchStore: () => ({ getBetTarget: () => undefined }),
}));

vi.mock("@/extensions/arbBet/rate9999", () => ({
  findSingleLegRateAccount: vi.fn(() => null),
}));

import { finalizeArbBet } from "./finalizeArbBet";
import type { ArbBetAttemptParams, ArbBetPlaced } from "./types";

function makeMatch(): ViewMatch {
  return {
    id: 1,
    title: "VG vs Team Refuser",
    bets: [],
  } as unknown as ViewMatch;
}

function makeBet(): ViewBet {
  const row = {
    id: 10,
    name: "[地图1] 获胜",
    items: [],
    getBetName: () => "[地图1] 获胜",
  };
  return row as unknown as ViewBet;
}

function makeLeg(type: string, target: "T1" | "T2"): BetOption {
  return {
    type,
    target,
    betMoney: 100,
    odds: 1.9,
    matchId: "m1",
    betId: "b1",
    itemId: "i1",
  } as BetOption;
}

function makeAccount(provider: string): PlatformAccount {
  return new PlatformAccount({
    accountId: provider === "OB" ? 1 : 2,
    playerName: provider.toLowerCase(),
    provider,
  });
}

function makePlaced(overrides: Partial<ArbBetPlaced> = {}): ArbBetPlaced {
  const legA = makeLeg("OB", "T1");
  const legB = makeLeg("RAY", "T2");
  const accountA = makeAccount("OB");
  const accountB = makeAccount("RAY");
  return {
    legA,
    legB,
    accountA,
    accountB,
    implied: 1.04,
    betBothLegs: true,
    singleLegByRate: null,
    linkId: 1_700_000_000_000,
    waitSec: 10,
    resultA: new BetResult("OB", true),
    resultB: new BetResult("RAY", true),
    ...overrides,
  };
}

function venueOrder(orderId: string, status: VenueOrder["status"], createAt: number): VenueOrder {
  return {
    provider: "RAY",
    orderId,
    odds: 1.9,
    createAt,
    betMoney: 100,
    reward: 0,
    money: 0,
    status,
    game: "",
    match: "",
    bet: "",
    item: "",
  };
}

describe("finalizeArbBet makeup enqueue", () => {
  const params: ArbBetAttemptParams = {
    match: makeMatch(),
    bet: makeBet(),
    config: createDefaultUserConfig(),
    setMessage: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    saveOrderBind.mockResolvedValue(undefined);
    applyArbMakeUpFromRejects.mockResolvedValue(undefined);
    waitRejectDetection.mockResolvedValue(undefined);
    syncVenueRejectFlags.mockResolvedValue({
      ordersA: [venueOrder("ob-1", "none", 2)],
      ordersB: [venueOrder("ray-reject", "reject", 3)],
      rejectA: false,
      rejectB: true,
    });
  });

  it("双腿 API 成功且 B 腿拒单时入队补单", async () => {
    await finalizeArbBet(params, makePlaced());

    expect(waitRejectDetection).toHaveBeenCalledWith(10, 3);
    expect(syncVenueRejectFlags).toHaveBeenCalledTimes(1);
    expect(applyArbMakeUpFromRejects).toHaveBeenCalledWith(
      params,
      expect.anything(),
      false,
      true,
    );
  });

  it("初检无拒单时不入队", async () => {
    syncVenueRejectFlags.mockResolvedValue({
      ordersA: [venueOrder("ob-1", "none", 2)],
      ordersB: [venueOrder("ray-1", "none", 3)],
      rejectA: false,
      rejectB: false,
    });

    await finalizeArbBet(params, makePlaced());

    expect(applyArbMakeUpFromRejects).toHaveBeenCalledWith(
      params,
      expect.anything(),
      false,
      false,
    );
  });

  it("双腿均被拒单时不入队补单", async () => {
    syncVenueRejectFlags.mockResolvedValue({
      ordersA: [venueOrder("ob-reject", "reject", 3)],
      ordersB: [venueOrder("ray-reject", "reject", 2)],
      rejectA: true,
      rejectB: true,
    });

    await finalizeArbBet(params, makePlaced());

    expect(applyArbMakeUpFromRejects).toHaveBeenCalledWith(
      params,
      expect.anything(),
      true,
      true,
    );
  });

  it("9999 单边仍走拒单等待与拉单", async () => {
    const placed = makePlaced({
      betBothLegs: false,
      accountB: undefined,
      resultB: undefined,
    });

    await finalizeArbBet(params, placed);

    expect(waitRejectDetection).toHaveBeenCalled();
    expect(syncVenueRejectFlags).toHaveBeenCalled();
  });
});
