import { beforeEach, describe, expect, it, vi } from "vitest";

const writeProfileAsync = vi.hoisted(() => vi.fn(async () => {}));
const fetchAccountRecordsByOwnerStrict = vi.hoisted(() => vi.fn(async () => []));
const fetchAccountRecordsByOwner = vi.hoisted(() => vi.fn(async () => []));
const saveAccountRecordsForOwner = vi.hoisted(() => vi.fn(async () => {}));
const patchPlayerAccountRecord = vi.hoisted(() => vi.fn(async () => null));

vi.mock("@changmen/db", () => ({
  writeProfileAsync,
  writeProfile: vi.fn(),
  fetchProfileById: vi.fn(async () => null),
  saveAccountRecordsForOwner,
  fetchAccountRecordsByOwner,
  fetchAccountRecordsByOwnerStrict,
  patchPlayerAccountRecord,
}));

const store = await import("./store.js");

describe("core/db/store setUserSetting 写库可靠化 (P0-2)", () => {
  beforeEach(() => {
    writeProfileAsync.mockReset();
    writeProfileAsync.mockResolvedValue(undefined);
  });

  it("写库成功：内存落新值，且以 await 方式写库", async () => {
    await store.setUserSetting("u1", "CollectConfig", JSON.stringify({ a: 1 }));
    expect(writeProfileAsync).toHaveBeenCalledWith("u1", { collect_config: { a: 1 } });
    expect(JSON.parse(store.getUserSetting("u1", "CollectConfig"))).toEqual({ a: 1 });
  });

  it("写库失败：内存回滚到写前值并抛错（有前值）", async () => {
    await store.setUserSetting("u2", "CollectConfig", JSON.stringify({ a: 1 }));
    writeProfileAsync.mockRejectedValueOnce(new Error("rds down"));
    await expect(
      store.setUserSetting("u2", "CollectConfig", JSON.stringify({ a: 2 })),
    ).rejects.toThrow("rds down");
    // 内存仍为旧值，不会漂移
    expect(JSON.parse(store.getUserSetting("u2", "CollectConfig"))).toEqual({ a: 1 });
  });

  it("写库失败：写前无该行时删除内存脏行并抛错", async () => {
    writeProfileAsync.mockRejectedValueOnce(new Error("rds down"));
    await expect(
      store.setUserSetting("u3", "CollectConfig", JSON.stringify({ a: 1 })),
    ).rejects.toThrow("rds down");
    expect(store.getProfileById("u3")).toBeNull();
    expect(store.getUserSetting("u3", "CollectConfig")).toBeNull();
  });
});

describe("core/db/store updateProfileSetting 写库可靠化 (P0-2)", () => {
  beforeEach(() => {
    writeProfileAsync.mockReset();
    writeProfileAsync.mockResolvedValue(undefined);
  });

  it("写库成功：betting_config 合并并落库，返回最新 profile", async () => {
    const p = await store.updateProfileSetting("b1", { BetTarget: true });
    expect(writeProfileAsync).toHaveBeenCalledWith("b1", { betting_config: { BetTarget: true } });
    expect(p.setting.BetTarget).toBe(true);
  });

  it("写库失败：betting_config 回滚并抛错", async () => {
    await store.updateProfileSetting("b2", { BetTarget: true });
    writeProfileAsync.mockRejectedValueOnce(new Error("rds down"));
    await expect(
      store.updateProfileSetting("b2", { BetTarget: false }),
    ).rejects.toThrow("rds down");
    expect(store.getProfileById("b2").setting.BetTarget).toBe(true);
  });
});

describe("core/db/store prepareAccountsForSave 区分空/失败 (P0-4 D1)", () => {
  beforeEach(() => {
    fetchAccountRecordsByOwnerStrict.mockReset();
    fetchAccountRecordsByOwnerStrict.mockResolvedValue([]);
  });

  it("内存为空 + RDS 读成功：回源并返回账号", async () => {
    fetchAccountRecordsByOwnerStrict.mockResolvedValueOnce([{ accountId: 7 }]);
    const list = await store.prepareAccountsForSave("acc-ok");
    expect(fetchAccountRecordsByOwnerStrict).toHaveBeenCalledWith("acc-ok");
    expect(list.map(a => a.accountId)).toEqual([7]);
  });

  it("内存为空 + RDS 读失败：抛错（供上层中止），不把失败当空账号", async () => {
    fetchAccountRecordsByOwnerStrict.mockRejectedValueOnce(new Error("rds down"));
    await expect(store.prepareAccountsForSave("acc-fail")).rejects.toThrow("rds down");
    // 缓存未被污染成"空账号"：仍是空（未成功回源），而非静默的成功空
    expect(store.listAccountsForUser("acc-fail")).toEqual([]);
  });

  it("内存已有账号：直接返回，不再触发 strict 回源", async () => {
    await store.replaceAccountsForUser("acc-mem", [{ accountId: 9 }]);
    fetchAccountRecordsByOwnerStrict.mockClear();
    const list = await store.prepareAccountsForSave("acc-mem");
    expect(fetchAccountRecordsByOwnerStrict).not.toHaveBeenCalled();
    expect(list.map(a => a.accountId)).toEqual([9]);
  });
});

describe("core/db/store listAccountsForUser 读路径无写 (P0-3)", () => {
  beforeEach(() => {
    saveAccountRecordsForOwner.mockClear();
    patchPlayerAccountRecord.mockReset();
  });

  it("缓存被 patch 成旧 multiply 后，读规范化只改内存、不写 RDS", async () => {
    await store.replaceAccountsForUser("p0-3-user", [
      { accountId: 1, provider: "Polymarket", multiply: 1, playerName: "pm" },
    ]);
    // 模拟余额刷新等写回未规范化的 account_data（读路径曾因此 fire-and-forget save）
    patchPlayerAccountRecord.mockResolvedValueOnce({
      accountId: 1,
      provider: "Polymarket",
      multiply: 7,
      playerName: "pm",
    });
    await store.updateAccountForUser("p0-3-user", 1, { balance: 10 });
    saveAccountRecordsForOwner.mockClear();

    const list = store.listAccountsForUser("p0-3-user");
    expect(list).toHaveLength(1);
    expect(Number(list[0].multiply)).toBe(1);
    expect(saveAccountRecordsForOwner).not.toHaveBeenCalled();
  });

  it("显式 replaceAccountsForUser 仍会落库", async () => {
    saveAccountRecordsForOwner.mockClear();
    await store.replaceAccountsForUser("p0-3-write", [
      { accountId: 2, provider: "OB", playerName: "ob1" },
    ]);
    expect(saveAccountRecordsForOwner).toHaveBeenCalledTimes(1);
    expect(saveAccountRecordsForOwner.mock.calls[0][0]).toBe("p0-3-write");
  });
});

describe("core/db/store loadAccountsForUserStrict (P0-4 D3)", () => {
  beforeEach(() => {
    fetchAccountRecordsByOwnerStrict.mockReset();
  });

  it("读成功：写入缓存并返回", async () => {
    fetchAccountRecordsByOwnerStrict.mockResolvedValueOnce([
      { accountId: 3, provider: "PredictFun" },
    ]);
    const list = await store.loadAccountsForUserStrict("pf-ok");
    expect(list.map(a => a.accountId)).toEqual([3]);
    expect(store.listAccountsForUser("pf-ok").map(a => a.accountId)).toEqual([3]);
  });

  it("读失败：抛错且不把缓存写成空列表", async () => {
    await store.replaceAccountsForUser("pf-keep", [
      { accountId: 5, provider: "PredictFun", playerName: "x" },
    ]);
    fetchAccountRecordsByOwnerStrict.mockRejectedValueOnce(new Error("rds down"));
    await expect(store.loadAccountsForUserStrict("pf-keep")).rejects.toThrow("rds down");
    expect(store.listAccountsForUser("pf-keep").map(a => a.accountId)).toEqual([5]);
  });
});
