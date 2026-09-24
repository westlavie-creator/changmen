import type { ClientMatchDto } from "@/types/esport";
import { describe, expect, it, vi } from "vitest";
import { fetchPmFootballRows } from "@/stores/footballStore";

const row = { ID: 1, Title: "A vs B", Game: "epl", GameID: 0, StartTime: 1, Matchs: { Polymarket: "pm-1" }, Bets: [] } satisfies ClientMatchDto;

describe("football PM source routing", () => {
  it("does not call VPS when official discovery succeeds", async () => {
    const vps = vi.fn(async () => [row]);
    const rows = await fetchPmFootballRows("u", {
      sourceMode: () => "official",
      direct: async () => [row],
      vps,
    });
    expect(rows).toEqual([row]);
    expect(vps).not.toHaveBeenCalled();
  });

  it("falls back to VPS when official discovery fails", async () => {
    const vps = vi.fn(async () => [row]);
    const rows = await fetchPmFootballRows("u", {
      sourceMode: () => "official",
      direct: async () => { throw new Error("blocked"); },
      vps,
    });
    expect(rows).toEqual([row]);
    expect(vps).toHaveBeenCalledOnce();
  });
});
