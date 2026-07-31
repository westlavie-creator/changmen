import { beforeEach, describe, expect, it, vi } from "vitest";

const upsertTagPlatformByName = vi.fn();
const fetchPlayerByVenueAccountKey = vi.fn();
const findVenueAccountKeyConflict = vi.fn();
const fetchPlayerByProviderAndVenueMemberId = vi.fn();
const fetchPlayerByPlatformAndName = vi.fn();
const fetchPlayerByPlatformNameAndPlayerName = vi.fn();
const resurrectPlayerRow = vi.fn();
const insertPlayerRow = vi.fn();

vi.mock("@changmen/db", () => ({
  upsertTagPlatformByName,
  fetchPlayerByVenueAccountKey,
  findVenueAccountKeyConflict,
  fetchPlayerByProviderAndVenueMemberId,
  fetchPlayerByPlatformAndName,
  fetchPlayerByPlatformNameAndPlayerName,
  resurrectPlayerRow,
  insertPlayerRow,
  softDeletePlayersNotInList: vi.fn(),
  debitPlayerBalanceRow: vi.fn(),
  creditPlayerBalanceRow: vi.fn(),
  updatePlayerBalanceRow: vi.fn(),
}));

describe("createTagPlatform venue key soft-delete rules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    upsertTagPlatformByName.mockResolvedValue({ id: 1, name: "OB盘" });
  });

  it("resurrects own soft-deleted player via add-account path", async () => {
    fetchPlayerByVenueAccountKey.mockResolvedValueOnce({
      id: 42,
      playerId: 42,
      ownerUserId: "user-a",
      playerName: "old",
      platformId: 1,
      provider: "OB",
      venueMemberId: "m1",
      deletedAt: 100,
    });
    resurrectPlayerRow.mockResolvedValueOnce({
      id: 42,
      playerId: 42,
      ownerUserId: "user-a",
      playerName: "m1",
      platformId: 1,
      provider: "OB",
      venueMemberId: "m1",
      deletedAt: null,
    });

    const { createTagPlatform } = await import("./account_store.js");
    const created = await createTagPlatform("OB盘", "m1", "user-a", {
      provider: "OB",
      venueMemberId: "m1",
    });

    expect(created.playerId).toBe(42);
    expect(resurrectPlayerRow).toHaveBeenCalledWith(42, "user-a", expect.objectContaining({
      provider: "OB",
      venueMemberId: "m1",
    }));
    expect(insertPlayerRow).not.toHaveBeenCalled();
  });

  it("rejects when another user still holds the key after soft-delete", async () => {
    fetchPlayerByVenueAccountKey.mockResolvedValueOnce({
      id: 7,
      playerId: 7,
      ownerUserId: "user-a",
      playerName: "a",
      platformId: 1,
      provider: "OB",
      venueMemberId: "m1",
      deletedAt: 100,
    });
    findVenueAccountKeyConflict.mockResolvedValueOnce({
      id: 7,
      ownerUserId: "user-a",
      userName: "GB01",
      deletedAt: 100,
      deleted: true,
    });

    const { createTagPlatform } = await import("./account_store.js");
    await expect(createTagPlatform("OB盘", "m1", "user-b", {
      provider: "OB",
      venueMemberId: "m1",
    })).rejects.toThrow(/已删除，仅原主人可通过添加账号复活/);
    expect(resurrectPlayerRow).not.toHaveBeenCalled();
    expect(insertPlayerRow).not.toHaveBeenCalled();
  });

  it("does not resurrect soft-deleted row with different venueMemberId matched by name", async () => {
    fetchPlayerByVenueAccountKey.mockResolvedValueOnce(null);
    fetchPlayerByProviderAndVenueMemberId.mockResolvedValueOnce(null);
    fetchPlayerByPlatformAndName.mockResolvedValueOnce({
      id: 11,
      playerId: 11,
      ownerUserId: "user-a",
      playerName: "同名",
      platformId: 1,
      provider: "OB",
      venueMemberId: "old-member",
      deletedAt: 100,
    });
    insertPlayerRow.mockResolvedValueOnce({
      id: 99,
      playerId: 99,
      ownerUserId: "user-a",
      playerName: "同名",
      platformId: 1,
      provider: "OB",
      venueMemberId: "new-member",
      deletedAt: null,
    });

    const { createTagPlatform } = await import("./account_store.js");
    const created = await createTagPlatform("OB盘", "同名", "user-a", {
      provider: "OB",
      venueMemberId: "new-member",
    });

    expect(created.playerId).toBe(99);
    expect(resurrectPlayerRow).not.toHaveBeenCalled();
    expect(insertPlayerRow).toHaveBeenCalled();
  });
});
