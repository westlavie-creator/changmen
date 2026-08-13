import { describe, expect, test } from "vitest";
import { parseEuroOddsPayload } from "./parse";
import { buildPbCollectMatchDto } from "./markets";

describe("PB rotNum SaveMatch step1", () => {
  test("parseEuroOddsPayload keeps event.rotNum", () => {
    const { matches } = parseEuroOddsPayload({
      leagues: [
        {
          id: 1,
          gameCode: "valorant",
          gameName: "Valorant",
          name: "VCT",
          events: [
            {
              id: 1633896380,
              rotNum: "53830",
              time: 1_700_000_000_000,
              live: true,
              participants: [
                { type: "HOME", name: "KRU", englishName: "KRU" },
                { type: "AWAY", name: "BESTIA", englishName: "BESTIA" },
              ],
              periods: {
                "0": { moneyLine: { homePrice: 1.5, awayPrice: 2.5, lineId: 1 } },
              },
            },
          ],
        },
      ],
    });
    expect(matches).toHaveLength(1);
    expect(matches[0]!.matchId).toBe("1633896380");
    expect(matches[0]!.rotNum).toBe("53830");
  });

  test("buildPbCollectMatchDto uploads RotNum without changing SourceMatchID", () => {
    const dto = buildPbCollectMatchDto({
      matchId: "1633896380",
      gameId: "valorant",
      gameCode: "valorant",
      gameName: "Valorant",
      leagueName: "VCT",
      bo: 3,
      startTime: 1_700_000_000_000,
      isLive: true,
      rotNum: "53830",
      home: { id: "kru", name: "KRU", englishName: "KRU" },
      away: { id: "bestia", name: "BESTIA", englishName: "BESTIA" },
      stages: [],
    });
    expect(dto.SourceMatchID).toBe("1633896380");
    expect(dto.RotNum).toBe("53830");
  });
});
