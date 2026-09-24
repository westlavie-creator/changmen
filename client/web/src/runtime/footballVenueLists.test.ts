import type { ClientMatchDto } from "@/types/esport";
import { describe, expect, it } from "vitest";
import { collectIndependentFootballVenueRows } from "@/runtime/footballVenueLists";

function row(id: number, venue: "OB" | "Polymarket"): ClientMatchDto {
  return {
    ID: id,
    Title: "Arsenal vs Chelsea",
    Game: "epl",
    GameID: 0,
    StartTime: 1_800_000_000_000,
    Matchs: { [venue]: `${venue}-${id}` },
    Bets: [],
  };
}

describe("independent football venue lists", () => {
  it("keeps identical OB and PM fixtures as separate rows", async () => {
    const rows = await collectIndependentFootballVenueRows(
      Promise.resolve([row(1, "Polymarket")]),
      Promise.resolve([row(2, "OB")]),
    );
    expect(rows).toHaveLength(2);
    expect(rows.map(item => Object.keys(item.Matchs))).toEqual([["Polymarket"], ["OB"]]);
  });

  it("keeps the available venue when the other source fails", async () => {
    const rows = await collectIndependentFootballVenueRows(
      Promise.reject(new Error("PM unavailable")),
      Promise.resolve([row(2, "OB")]),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.Matchs.OB).toBe("OB-2");
  });
});
