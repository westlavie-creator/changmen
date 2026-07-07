import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@changmen/db", () => ({
  fetchPlayersByIds: vi.fn(),
}));

import { fetchPlayersByIds } from "@changmen/db";
import { assertPlayersOwnedByUser } from "./player_ownership.js";

describe("assertPlayersOwnedByUser", () => {
  beforeEach(() => {
    vi.mocked(fetchPlayersByIds).mockReset();
  });

  it("validates all ids in one fetch", async () => {
    vi.mocked(fetchPlayersByIds).mockResolvedValue([
      { id: 7, ownerUserId: "u1" },
      { id: 8, ownerUserId: "u1" },
    ]);
    const result = await assertPlayersOwnedByUser([7, 8], "u1");
    expect(result.ok).toBe(true);
    expect(fetchPlayersByIds).toHaveBeenCalledOnce();
    expect(fetchPlayersByIds).toHaveBeenCalledWith([7, 8]);
  });

  it("rejects missing player", async () => {
    vi.mocked(fetchPlayersByIds).mockResolvedValue([{ id: 7, ownerUserId: "u1" }]);
    const result = await assertPlayersOwnedByUser([7, 9], "u1");
    expect(result.ok).toBe(false);
    expect(result.msg).toMatch(/playerId 9/);
  });

  it("allows empty ACCOUNT list validation", async () => {
    vi.mocked(fetchPlayersByIds).mockResolvedValue([]);
    const result = await assertPlayersOwnedByUser([], "u1");
    expect(result.ok).toBe(false);
  });
});
