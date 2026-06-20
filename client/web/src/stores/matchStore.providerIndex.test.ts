import { beforeEach, describe, expect, test } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useMatchStore } from "@/stores/matchStore";
import { ViewMatch } from "@/models/match";
import type { ClientMatchDto } from "@/types/esport";

function makeMatch(
  id: number,
  providers: Record<string, string>,
  reverse: string[] = [],
): ViewMatch {
  return new ViewMatch({
    ID: id,
    Title: `Match ${id}`,
    Game: "LOL",
    GameID: 1,
    StartTime: Date.now(),
    BO: 3,
    Round: 0,
    RoundStart: 0,
    Reverse: reverse,
    Matchs: providers,
    Bets: [],
  } as unknown as ClientMatchDto);
}

describe("matchStore._providerIndex + updateScore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  test("_rebuildProviderIndex builds correct index from matchs", () => {
    const store = useMatchStore();
    store.matchs = [
      makeMatch(1, { OB: "ob_100", RAY: "ray_200" }),
      makeMatch(2, { OB: "ob_101", TF: "tf_300" }),
    ];

    store._rebuildProviderIndex();

    expect(store._providerIndex.get("OB:ob_100")).toBe(0);
    expect(store._providerIndex.get("RAY:ray_200")).toBe(0);
    expect(store._providerIndex.get("OB:ob_101")).toBe(1);
    expect(store._providerIndex.get("TF:tf_300")).toBe(1);
    expect(store._providerIndex.get("OB:nonexistent")).toBeUndefined();
  });

  test("updateScore finds match via index and sets score", () => {
    const store = useMatchStore();
    store.matchs = [
      makeMatch(1, { OB: "ob_100" }),
      makeMatch(2, { OB: "ob_101" }),
    ];
    store._rebuildProviderIndex();

    store.updateScore("OB", [
      { SourceID: "ob_101", Score: { "1": { Home: 13, Away: 7 } } },
    ]);

    expect(store.score.has(2)).toBe(true);
    const board = store.score.get(2)!;
    expect(board.score.get(1)).toEqual({ Home: 13, Away: 7 });
    expect(store.score.has(1)).toBe(false);
  });

  test("updateScore respects reverse", () => {
    const store = useMatchStore();
    store.matchs = [
      makeMatch(1, { OB: "ob_100" }, ["OB"]),
    ];
    store._rebuildProviderIndex();

    store.updateScore("OB", [
      { SourceID: "ob_100", Score: { "1": { Home: 10, Away: 5 } } },
    ]);

    const round = store.score.get(1)!.score.get(1)!;
    expect(round).toEqual({ Home: 5, Away: 10 });
  });

  test("updateScore ignores unknown sourceId", () => {
    const store = useMatchStore();
    store.matchs = [makeMatch(1, { OB: "ob_100" })];
    store._rebuildProviderIndex();

    store.updateScore("OB", [
      { SourceID: "ob_999", Score: { "1": { Home: 1, Away: 0 } } },
    ]);

    expect(store.score.size).toBe(0);
  });

  test("updateScore ignores unknown platform", () => {
    const store = useMatchStore();
    store.matchs = [makeMatch(1, { OB: "ob_100" })];
    store._rebuildProviderIndex();

    store.updateScore("RAY", [
      { SourceID: "ob_100", Score: { "1": { Home: 1, Away: 0 } } },
    ]);

    expect(store.score.size).toBe(0);
  });
});
