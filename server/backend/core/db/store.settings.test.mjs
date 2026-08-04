import { beforeEach, describe, expect, it, vi } from "vitest";

const writeProfileAsync = vi.hoisted(() => vi.fn(async () => {}));
const fetchAccountRecordsByOwnerStrict = vi.hoisted(() => vi.fn(async () => []));

vi.mock("@changmen/db", () => ({
  writeProfileAsync,
  writeProfile: vi.fn(),
  fetchProfileById: vi.fn(async () => null),
  saveAccountRecordsForOwner: vi.fn(async () => {}),
  fetchAccountRecordsByOwner: vi.fn(async () => []),
  fetchAccountRecordsByOwnerStrict,
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
