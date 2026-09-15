import { beforeEach, describe, expect, it, vi } from "vitest";
import { podFollowPlaceBlock, placePodFollowBet, type PodFollowPlaceTicket } from "@/runtime/podFollowPlace";

const mocks = vi.hoisted(() => ({
  placeObSportSingle: vi.fn(),
  state: {
    todayRows: [] as Array<{ id: string }>,
    rows: [] as Array<{ id: string }>,
  },
}));

vi.mock("@/runtime/obSportPlaceBet", () => ({
  placeObSportSingle: mocks.placeObSportSingle,
}));

vi.mock("@/stores/footballOrderStore", () => ({
  useFootballOrderStore: () => ({
    get todayRows() {
      return mocks.state.todayRows;
    },
    get rows() {
      return mocks.state.rows;
    },
    orderedTicketIds: [] as string[],
    hasTicketOrder(id: string) {
      return [...mocks.state.todayRows, ...mocks.state.rows].some(row => row.id === id);
    },
    appendPlaced: vi.fn(async (row: { id: string }) => {
      mocks.state.todayRows = [...mocks.state.todayRows, row];
      return row;
    }),
  }),
}));

function ticket(over: Partial<PodFollowPlaceTicket> = {}): PodFollowPlaceTicket {
  return {
    id: "1",
    stake: 50,
    fixtureStatus: "matched",
    obMid: "5652292",
    market: { status: "matched", ob: true, locked: false, oid: "oid-over", quote: 1.95, marketCode: "totals", boardSide: "over", fromLive: true },
    quote: { status: "ok", quote: 1.95, minObOdds: 1.9, maxObOdds: 2.18, evPercent: 5.4 },
    ...over,
  };
}

beforeEach(() => {
  mocks.state.todayRows = [];
  mocks.state.rows = [];
  mocks.placeObSportSingle.mockReset();
});

describe("podFollowPlace", () => {
  it("blocks guess tickets that are not OB-ready", () => {
    expect(podFollowPlaceBlock(ticket({ fixtureStatus: "none" }))).toBe("场未对上");
    expect(podFollowPlaceBlock(ticket({
      market: { status: "none", ob: true, locked: false, oid: "x", quote: 1.9, marketCode: "totals", boardSide: "over", fromLive: true },
    }))).toBe("盘未对上");
    expect(podFollowPlaceBlock(ticket({
      market: { status: "matched", ob: false, locked: false, oid: "x", quote: 1.9, marketCode: "totals", boardSide: "over", fromLive: true },
    }))).toBe("无 OB 盘");
    expect(podFollowPlaceBlock(ticket({ quote: { status: "short", quote: 1.8, minObOdds: 1.9, maxObOdds: 2.18, evPercent: -2 } }))).toBe("OB 价不够");
    expect(podFollowPlaceBlock(ticket({ quote: { status: "spike", quote: 2.4, minObOdds: 1.9, maxObOdds: 2.18, evPercent: 30 } }))).toBe("EV 异常");
    expect(podFollowPlaceBlock(ticket({ stake: 0 }))).toBe("注码未设");
    expect(podFollowPlaceBlock(ticket())).toBeNull();
  });

  it("refuses to place again when football_orders already has the ticket", async () => {
    mocks.state.todayRows = [{ id: "1" }];
    const result = await placePodFollowBet(ticket());
    expect(result).toEqual({ ok: false, message: "已下过" });
    expect(mocks.placeObSportSingle).not.toHaveBeenCalled();
  });
});
