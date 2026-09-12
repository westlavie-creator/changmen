import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PodDropAlert } from "@/runtime/podAlerts";
import { POD_BET_SETTINGS_DEFAULTS } from "@/runtime/podBetSettings";
import { buildPodBetTicket } from "@/runtime/podBetTicket";
import {
  buildPodFollowLogRow,
  formatPodFollowLogPlace,
  parsePodFollowLog,
  ticketHasPodFollowEv,
  upsertPodFollowEv,
  markPodFollowLogPlaced,
} from "@/runtime/podFollowLog";

function alert(over: Partial<PodDropAlert> = {}): PodDropAlert {
  return {
    id: "1",
    eventId: "e",
    sport: "Football",
    sportId: 1,
    league: "EPL",
    home: "Arsenal",
    away: "Chelsea",
    starts: 2_000_000,
    alertedAt: 1_950_000,
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
    ...over,
  };
}

function liveTicket(over: Record<string, unknown> = {}) {
  const ticket = buildPodBetTicket(alert(), { ...POD_BET_SETTINGS_DEFAULTS, enabled: true, stake: 50 }, 1_960_000)!;
  return {
    ...ticket,
    fixtureMatch: { status: "matched" as const, hits: [{ fixture: { obMid: "5652292" } }] },
    marketMatch: {
      status: "matched" as const,
      oid: "oid-over",
      marketCode: "totals",
      boardLine: 2.5,
      boardSide: "over" as const,
    },
    obQuote: { status: "ok" as const, quote: 1.95, minObOdds: 1.924 },
    ...over,
  };
}

const mem = new Map<string, string>();

beforeEach(() => {
  mem.clear();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => mem.get(key) ?? null,
    setItem: (key: string, value: string) => { mem.set(key, String(value)); },
    removeItem: (key: string) => { mem.delete(key); },
  });
});

describe("podFollowLog", () => {
  it("only treats matched OB quotes above the floor as EV", () => {
    expect(ticketHasPodFollowEv(liveTicket())).toBe(true);
    expect(ticketHasPodFollowEv(liveTicket({
      obQuote: { status: "short", quote: 1.8, minObOdds: 1.924 },
    }))).toBe(false);
    expect(ticketHasPodFollowEv(liveTicket({
      fixtureMatch: { status: "none", hits: [] },
    }))).toBe(false);
  });

  it("records a follow ticket and updates the quote until placed", () => {
    const row = buildPodFollowLogRow(liveTicket(), 1_970_000);
    expect(row.home).toBe("Arsenal");
    expect(row.obMid).toBe("5652292");
    expect(row.obQuote).toBe(1.95);
    expect(row.placed).toBe(false);
    expect(formatPodFollowLogPlace(row)).toBe("未下");
    const first = upsertPodFollowEv(row);
    expect(first.added).toBe(true);
    expect(first.rows).toHaveLength(1);
    const unmatched = buildPodFollowLogRow(liveTicket({
      fixtureMatch: { status: "none", hits: [] },
      marketMatch: { status: "none" as const, oid: "", marketCode: "", boardLine: null, boardSide: null },
      obQuote: { status: "none" as const, quote: 0, minObOdds: 1.924 },
    }), 1_971_000);
    unmatched.id = "2";
    const saved = upsertPodFollowEv(unmatched);
    expect(saved.added).toBe(true);
    expect(saved.rows).toHaveLength(2);
    const again = upsertPodFollowEv({ ...row, obQuote: 2.2, at: 1_980_000 });
    expect(again.added).toBe(false);
    expect(again.wrote).toBe(true);
    expect(again.rows.find(item => item.id === "1")?.obQuote).toBe(2.2);
    expect(again.rows.find(item => item.id === "1")?.at).toBe(1_970_000);
    const placed = markPodFollowLogPlaced("1", "已下 88");
    const hit = placed.find(item => item.id === "1")!;
    expect(hit.placed).toBe(true);
    expect(formatPodFollowLogPlace(hit)).toMatch(/^已下/);
    const frozen = upsertPodFollowEv({ ...row, obQuote: 3, at: 1_990_000 });
    expect(frozen.wrote).toBe(false);
    expect(frozen.rows.find(item => item.id === "1")?.obQuote).toBe(2.2);
    expect(parsePodFollowLog([{ id: "1" }, { id: "1", home: "dup" }])).toHaveLength(1);
  });
});
