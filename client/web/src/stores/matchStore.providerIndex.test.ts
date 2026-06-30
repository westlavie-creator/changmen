import type { ClientMatchDto } from "@/types/esport";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import { ViewMatch } from "@/models/match";
import { useMatchStore } from "@/stores/matchStore";

function makeMatch(
  id: number,
  providers: Record<string, string>,
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
    Reverse: [],
    Matchs: providers,
    Bets: [],
  } as unknown as ClientMatchDto);
}

describe("matchStore._providerIndex", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("_rebuildProviderIndex builds correct index from matchs", () => {
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
});
