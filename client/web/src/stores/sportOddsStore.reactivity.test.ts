import { createPinia, setActivePinia } from "pinia";
import { storeToRefs } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import { computed, nextTick } from "vue";
import { useSportOddsStore } from "@/stores/sportOddsStore";
import { useObSportLiveStore } from "@/stores/obSportLiveStore";

describe("sportOdds nested tracking (no global tick)", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("save on one oid does not recompute another oid", async () => {
    const odds = useSportOddsStore();
    const a = computed(() => odds.get("OB", "oid-a"));
    const b = computed(() => odds.get("OB", "oid-b"));
    expect(a.value).toBe(0);
    expect(b.value).toBe(0);

    odds.save("OB", "oid-a", 1.91);
    await nextTick();
    expect(a.value).toBe(1.91);
    expect(b.value).toBe(0);

    const bBefore = b.value;
    odds.save("OB", "oid-a", 1.95);
    await nextTick();
    expect(a.value).toBe(1.95);
    expect(b.value).toBe(bBefore);
  });

  it("saveMany writes many oids without recomputing unrelated cells", async () => {
    const odds = useSportOddsStore();
    const a = computed(() => odds.get("OB", "a"));
    const b = computed(() => odds.get("OB", "b"));
    odds.saveMany("OB", [{ id: "a", odds: 1.8 }, { id: "c", odds: 2.1 }]);
    await nextTick();
    expect(a.value).toBe(1.8);
    expect(b.value).toBe(0);
  });

  it("has() tracks a missing oid so the first quote invalidates", async () => {
    const odds = useSportOddsStore();
    const known = computed(() => odds.has("OB", "oid-x"));
    expect(known.value).toBe(false);
    odds.save("OB", "oid-x", 2.05);
    await nextTick();
    expect(known.value).toBe(true);
    expect(odds.get("OB", "oid-x")).toBe(2.05);
  });
});

describe("obSportLive nested tracking", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("score patch on one mid does not require global tick for that card", async () => {
    const live = useObSportLiveStore();
    const score = computed(() => {
      const row = live.get("m1");
      return row ? `${row.home}:${row.away}` : "";
    });
    const other = computed(() => live.get("m2")?.home ?? null);
    expect(score.value).toBe("");
    live.applyLive({ mid: "m1", home: 1, away: 0, mmp: "6", ms: 1 });
    await nextTick();
    expect(score.value).toBe("1:0");
    expect(other.value).toBeNull();
    live.applyLive({ mid: "m1", home: 2, away: 0 });
    await nextTick();
    expect(score.value).toBe("2:0");
    expect(other.value).toBeNull();
  });

  it("storeToRefs byMid tracks first insert and later score without liveTick", async () => {
    const live = useObSportLiveStore();
    const { byMid } = storeToRefs(live);
    const score = computed(() => {
      const row = byMid.value.m1;
      void row?.home;
      void row?.away;
      return row ? `${row.home}:${row.away}` : "";
    });
    expect(score.value).toBe("");
    live.applyLive({ mid: "m1", home: 1, away: 0, mmp: "6", ms: 1 });
    await nextTick();
    expect(score.value).toBe("1:0");
    live.applyLive({ mid: "m1", home: 2, away: 0 });
    await nextTick();
    expect(score.value).toBe("2:0");
  });
});
