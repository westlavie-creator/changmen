import { beforeEach, describe, expect, it, vi } from "vitest";

const getObSportPb = vi.fn();
const postObSportPb = vi.fn();
const pickObSportBetAccount = vi.fn();
const sportObSessionFromAccount = vi.fn();
const readLocalSportObSession = vi.fn();
const readPodBetSettings = vi.fn();
const accounts = [
  {
    accountId: 15,
    provider: "OB",
    pause: false,
    sportOb: {
      token: "abcdef0123456789abcdef",
      gateway: "https://api.example.com",
      venueMemberId: "1009328104483790848",
    },
  },
];

vi.mock("@/runtime/obSportFootballFetch", () => ({
  getObSportPb: (...args: unknown[]) => getObSportPb(...args),
  postObSportPb: (...args: unknown[]) => postObSportPb(...args),
}));

vi.mock("@/runtime/obSportBetAccount", () => ({
  isObSportMemberId: (value: unknown) => /^\d{18,}$/.test(String(value || "")),
  pickObSportBetAccount: (...args: unknown[]) => pickObSportBetAccount(...args),
  sportObSessionFromAccount: (...args: unknown[]) => sportObSessionFromAccount(...args),
}));

vi.mock("@/runtime/obSportSessionLocal", () => ({
  readLocalSportObSession: () => readLocalSportObSession(),
}));

vi.mock("@/runtime/podBetSettings", () => ({
  readPodBetSettings: () => readPodBetSettings(),
}));

vi.mock("@/stores/accountStore", () => ({
  useAccountStore: () => ({ accounts }),
}));

describe("obSportBetRecord", () => {
  beforeEach(() => {
    getObSportPb.mockReset();
    postObSportPb.mockReset();
    pickObSportBetAccount.mockReset();
    sportObSessionFromAccount.mockReset();
    readLocalSportObSession.mockReset();
    readPodBetSettings.mockReset();
    readPodBetSettings.mockReturnValue({ followAccountIds: [15], followAccountId: 15 });
    pickObSportBetAccount.mockReturnValue(accounts[0]);
    sportObSessionFromAccount.mockImplementation((acc: { accountId?: number; sportOb?: { venueMemberId?: string } } | null) => {
      if (!acc)
        return null;
      return {
        kind: "sport",
        token: "abcdef0123456789abcdef",
        gateway: "https://api.example.com",
        sessionId: String(acc.sportOb?.venueMemberId || `u${acc.accountId || 0}`),
        uid: String(acc.sportOb?.venueMemberId || `u${acc.accountId || 0}`),
      };
    });
    readLocalSportObSession.mockReturnValue({
      kind: "sport",
      token: "collect",
      gateway: "https://api.example.com",
      sessionId: "collect",
    });
    getObSportPb.mockResolvedValue({ code: 200, data: [] });
    postObSportPb.mockResolvedValue({
      code: "0000000",
      data: { records: [{ orderNo: "ord-1", profitAmount: 55, outcome: 4 }] },
    });
  });

  it("posts official orderStatus bodies and maps Win from outcome 4", async () => {
    const {
      fetchObSportPendingOrderPatches,
      buildObSportOrderListBodies,
    } = await import("@/runtime/obSportBetRecord");
    const bodies = buildObSportOrderListBodies("1009328104483790848");
    expect(bodies).toEqual([
      expect.objectContaining({ orderStatus: 0, selected: 0, timeType: 1, orderBy: 1, userId: "1009328104483790848" }),
      expect.objectContaining({ orderStatus: 1, selected: 1, timeType: 1, orderBy: 1 }),
    ]);
    expect(bodies.some(body => "settleFlag" in body)).toBe(false);

    const patches = await fetchObSportPendingOrderPatches([
      { orderId: "ord-1", playerId: 15 },
    ]);
    expect(patches).toEqual([{ orderId: "ord-1", status: "Win", profit: 55 }]);
    expect(postObSportPb).toHaveBeenCalledWith(
      "/yewurecord/order/betRecord/getOrderListPB",
      expect.objectContaining({ orderStatus: 0, selected: 0 }),
      expect.anything(),
    );
  });

  it("pulls one account-wide order window for historical pending orders", async () => {
    const {
      fetchObSportPendingOrderPatches,
    } = await import("@/runtime/obSportBetRecord");

    postObSportPb.mockResolvedValue({
      code: "0000000",
      data: { records: [
        { orderNo: "ord-old", profitAmount: -100, outcome: 3 },
        { orderNo: "ord-new", profitAmount: 50, outcome: 4 },
      ] },
    });

    const patches = await fetchObSportPendingOrderPatches([
      { orderId: "ord-old", playerId: 15, at: new Date(2026, 8, 17, 20, 30, 0).getTime() },
      { orderId: "ord-new", playerId: 15, at: new Date(2026, 8, 19, 12, 0, 0).getTime() },
    ]);

    expect(patches).toEqual(expect.arrayContaining([
      { orderId: "ord-old", status: "Lose", profit: -100 },
      { orderId: "ord-new", status: "Win", profit: 50 },
    ]));
    expect(postObSportPb).toHaveBeenCalledWith(
      "/yewurecord/order/betRecord/getOrderListPB",
      expect.objectContaining({
        orderStatus: 0,
        selected: 0,
        beginTime: "2026-09-17 00:00:00",
        endTime: expect.stringMatching(/ 23:59:59$/),
      }),
      expect.anything(),
    );
    const firstBody = postObSportPb.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(firstBody.timeType).toBeUndefined();
    // 同一账号无论有多少待结单，都只拉一轮未结 + 一轮已结列表。
    expect(postObSportPb).toHaveBeenCalledTimes(2);
    expect(getObSportPb).not.toHaveBeenCalled();
  });

  it("pulls the full recent account list without requiring a known local order id", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 26, 12, 0, 0));
    postObSportPb.mockResolvedValue({
      code: "0000000",
      data: { records: [{
        orderNo: "venue-only-1",
        outcome: 4,
        profitAmount: 18,
        betAmount: 100,
        oddFinally: 1.88,
        betTime: new Date(2026, 8, 25, 20, 0, 0).getTime(),
        detailList: [{ homeName: "Alpha", awayName: "Beta", playName: "独赢", playOptionName: "主胜" }],
      }] },
    });

    const { fetchObSportAccountOrderPatches } = await import("@/runtime/obSportBetRecord");
    const patches = await fetchObSportAccountOrderPatches(15);

    expect(patches).toEqual([expect.objectContaining({
      orderId: "venue-only-1",
      status: "Win",
      home: "Alpha",
      away: "Beta",
    })]);
    expect(postObSportPb).toHaveBeenCalledTimes(2);
    expect(postObSportPb).toHaveBeenCalledWith(
      "/yewurecord/order/betRecord/getOrderListPB",
      expect.objectContaining({
        beginTime: "2026-09-25 00:00:00",
        endTime: "2026-09-26 23:59:59",
      }),
      expect.anything(),
    );
    vi.useRealTimers();
  });
});
