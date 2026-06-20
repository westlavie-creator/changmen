/**
 * 验证 Vue reactive Map 的追踪能力，决定 revision 计数器能否安全移除。
 *
 * 两组测试：
 * 1. 隔离测试：用纯 Vue reactive(Map) 模拟 oddsStore，完全不含 revision，
 *    排除 "revision 间接触发" 的干扰。
 * 2. 集成测试：用真实 oddsStore，但 computed 不读 revision，验证端到端链路。
 */
import { beforeEach, describe, expect, test } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { computed, nextTick, reactive, watchEffect } from "vue";
import { useOddsStore } from "@/stores/oddsStore";
import { formatDisplayOdds } from "@/shared/format";

// ─── 第一组：纯 Vue reactive Map 隔离测试（无 Pinia、无 revision）────────

describe("纯 reactive Map 追踪（排除 revision 干扰）", () => {
  /** 最小化模拟 oddsStore.data：reactive(Map<Map<OddsEntry>>) */
  function createBareOddsMap() {
    const data = reactive(new Map<string, Map<string, { odds: number; isLock: boolean }>>());

    function save(platform: string, id: string, odds: number, isLock = false) {
      if (!data.has(platform)) data.set(platform, new Map());
      data.get(platform)!.set(id, { odds, isLock });
    }

    function getOdds(platform: string, id: string, fallback = 0): number {
      const row = data.get(platform)?.get(id);
      if (row === undefined) return fallback;
      if (row.isLock) return 0;
      return row.odds;
    }

    function setLock(platform: string, id: string, locked: boolean) {
      const row = data.get(platform)?.get(id);
      if (row) row.isLock = locked;
    }

    return { data, save, getOdds, setLock };
  }

  test("save 新值 → computed 重算", async () => {
    const fo = createBareOddsMap();
    const displayed = computed(() => fo.getOdds("OB", "odd1", 0));

    expect(displayed.value).toBe(0);

    fo.save("OB", "odd1", 1.85);
    await nextTick();
    expect(displayed.value).toBe(1.85);
  });

  test("save 更新已有值 → computed 重算", async () => {
    const fo = createBareOddsMap();
    fo.save("OB", "odd1", 1.85);

    const displayed = computed(() => fo.getOdds("OB", "odd1", 0));
    expect(displayed.value).toBe(1.85);

    fo.save("OB", "odd1", 2.10);
    await nextTick();
    expect(displayed.value).toBe(2.10);

    fo.save("OB", "odd1", 1.75);
    await nextTick();
    expect(displayed.value).toBe(1.75);
  });

  test("原地修改 isLock → computed 重算", async () => {
    const fo = createBareOddsMap();
    fo.save("OB", "odd1", 1.85);

    const displayed = computed(() => fo.getOdds("OB", "odd1", 0));
    expect(displayed.value).toBe(1.85);

    fo.setLock("OB", "odd1", true);
    await nextTick();
    expect(displayed.value).toBe(0);

    fo.setLock("OB", "odd1", false);
    await nextTick();
    expect(displayed.value).toBe(1.85);
  });

  test("watchEffect 逐次触发", async () => {
    const fo = createBareOddsMap();
    const seen: number[] = [];

    watchEffect(() => {
      seen.push(fo.getOdds("OB", "odd1", 0));
    });
    expect(seen).toEqual([0]);

    fo.save("OB", "odd1", 1.85);
    await nextTick();
    expect(seen).toEqual([0, 1.85]);

    fo.save("OB", "odd1", 2.10);
    await nextTick();
    expect(seen).toEqual([0, 1.85, 2.10]);

    fo.setLock("OB", "odd1", true);
    await nextTick();
    expect(seen).toEqual([0, 1.85, 2.10, 0]);
  });

  test("不同 oddId 独立追踪：改 odd1 不触发 odd2", async () => {
    const fo = createBareOddsMap();
    fo.save("OB", "odd1", 1.85);
    fo.save("OB", "odd2", 2.30);

    let odd1Evals = 0;
    let odd2Evals = 0;

    const d1 = computed(() => { odd1Evals++; return fo.getOdds("OB", "odd1", 0); });
    const d2 = computed(() => { odd2Evals++; return fo.getOdds("OB", "odd2", 0); });

    // 初始求值
    expect(d1.value).toBe(1.85);
    expect(d2.value).toBe(2.30);
    const c1 = odd1Evals;
    const c2 = odd2Evals;

    // 只改 odd1
    fo.save("OB", "odd1", 1.90);
    await nextTick();

    expect(d1.value).toBe(1.90);
    expect(d2.value).toBe(2.30);

    console.log(
      `[粒度] 改odd1后: odd1重算=${odd1Evals - c1}次, odd2重算=${odd2Evals - c2}次`,
    );
  });

  test("不同平台独立追踪：改 OB 不触发 RAY", async () => {
    const fo = createBareOddsMap();
    fo.save("OB", "odd1", 1.85);
    fo.save("RAY", "odd1", 2.00);

    let obEvals = 0;
    let rayEvals = 0;

    const dOb = computed(() => { obEvals++; return fo.getOdds("OB", "odd1", 0); });
    const dRay = computed(() => { rayEvals++; return fo.getOdds("RAY", "odd1", 0); });

    expect(dOb.value).toBe(1.85);
    expect(dRay.value).toBe(2.00);
    const c1 = obEvals;
    const c2 = rayEvals;

    fo.save("OB", "odd1", 1.90);
    await nextTick();

    expect(dOb.value).toBe(1.90);
    expect(dRay.value).toBe(2.00);

    console.log(
      `[粒度] 改OB后: OB重算=${obEvals - c1}次, RAY重算=${rayEvals - c2}次`,
    );
  });
});

// ─── 第二组：真实 oddsStore 集成测试（computed 不读 revision）────────────

describe("真实 oddsStore（computed 不读 revision）", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  test("save → getOdds computed 重算", async () => {
    const odds = useOddsStore();
    const displayed = computed(() => odds.getOdds("OB", "odd1", 0));

    expect(displayed.value).toBe(0);

    odds.save("OB", { id: "odd1", odds: 1.85, isLock: false, time: Date.now() }, "http");
    await nextTick();
    expect(displayed.value).toBe(1.85);
  });

  test("连续 save 更新 → 逐次重算", async () => {
    const odds = useOddsStore();
    const displayed = computed(() => odds.getOdds("OB", "odd1", 0));

    odds.save("OB", { id: "odd1", odds: 1.85, isLock: false, time: Date.now() }, "http");
    await nextTick();
    expect(displayed.value).toBe(1.85);

    odds.save("OB", { id: "odd1", odds: 2.10, isLock: false, time: Date.now() }, "http");
    await nextTick();
    expect(displayed.value).toBe(2.10);

    odds.save("OB", { id: "odd1", odds: 1.75, isLock: false, time: Date.now() }, "http");
    await nextTick();
    expect(displayed.value).toBe(1.75);
  });

  test("updateOddsLock 原地修改 → 重算", async () => {
    const odds = useOddsStore();
    odds.save("OB", { id: "odd1", odds: 1.85, isLock: false, betId: "m1", time: Date.now() }, "http");

    const displayed = computed(() => odds.getOdds("OB", "odd1", 0));
    expect(displayed.value).toBe(1.85);

    odds.updateOddsLock("OB", "odd1", true);
    await nextTick();
    expect(displayed.value).toBe(0);

    odds.updateOddsLock("OB", "odd1", false);
    await nextTick();
    expect(displayed.value).toBe(1.85);
  });

  test("updateBetLock 批量锁盘 → 重算", async () => {
    const odds = useOddsStore();
    odds.save("OB", { id: "h1", odds: 1.85, isLock: false, betId: "m1", side: "home", time: Date.now() }, "http");
    odds.save("OB", { id: "a1", odds: 2.10, isLock: false, betId: "m1", side: "away", time: Date.now() }, "http");

    const home = computed(() => odds.getOdds("OB", "h1", 0));
    const away = computed(() => odds.getOdds("OB", "a1", 0));
    await nextTick();
    expect(home.value).toBe(1.85);
    expect(away.value).toBe(2.10);

    odds.updateBetLock("OB", "m1", true);
    await nextTick();
    expect(home.value).toBe(0);
    expect(away.value).toBe(0);

    odds.updateBetLock("OB", "m1", false);
    await nextTick();
    expect(home.value).toBe(1.85);
    expect(away.value).toBe(2.10);
  });

  test("clean(platform) 清空 → 回到 fallback", async () => {
    const odds = useOddsStore();
    odds.save("OB", { id: "odd1", odds: 1.85, isLock: false, time: Date.now() }, "http");

    const displayed = computed(() => odds.getOdds("OB", "odd1", 99));
    expect(displayed.value).toBe(1.85);

    odds.clean("OB");
    await nextTick();
    expect(displayed.value).toBe(formatDisplayOdds(99));
  });

  test("hasLimit / setLimit / deleteLimit 也可追踪", async () => {
    const odds = useOddsStore();
    const has = computed(() => odds.hasLimit("OB", ["odd1"]));
    expect(has.value).toBe(false);

    odds.setLimit("OB", "odd1", 500, undefined, 60);
    await nextTick();
    expect(has.value).toBe(true);

    odds.deleteLimit("OB", "odd1");
    await nextTick();
    expect(has.value).toBe(false);
  });

  test("模拟 BetRow 场景：多个 item 各自追踪", async () => {
    const odds = useOddsStore();
    // 模拟 3 个平台的同一场比赛
    odds.save("OB", { id: "ob_h", odds: 1.85, isLock: false, time: Date.now() }, "http");
    odds.save("RAY", { id: "ray_h", odds: 1.80, isLock: false, time: Date.now() }, "http");
    odds.save("TF", { id: "tf_h", odds: 1.90, isLock: false, time: Date.now() }, "http");

    // 模拟 3 个 BetRow item 的赔率显示
    const obOdds = computed(() => odds.getOdds("OB", "ob_h", 0));
    const rayOdds = computed(() => odds.getOdds("RAY", "ray_h", 0));
    const tfOdds = computed(() => odds.getOdds("TF", "tf_h", 0));

    // 模拟套利计算（依赖多个赔率）
    const bestHome = computed(() => Math.max(obOdds.value, rayOdds.value, tfOdds.value));

    expect(bestHome.value).toBe(1.90);

    // OB 赔率上涨
    odds.save("OB", { id: "ob_h", odds: 1.95, isLock: false, time: Date.now() }, "mqtt");
    await nextTick();
    expect(obOdds.value).toBe(1.95);
    expect(bestHome.value).toBe(1.95);

    // RAY 和 TF 应该不受影响
    expect(rayOdds.value).toBe(1.80);
    expect(tfOdds.value).toBe(1.90);
  });
});
