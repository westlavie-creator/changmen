import { beforeEach, describe, expect, it, vi } from "vitest";

const debitPlayerBalanceRow = vi.fn();
const creditPlayerBalanceRow = vi.fn();
const updatePlayerBalanceRow = vi.fn();

vi.mock("@changmen/db", () => ({
  debitPlayerBalanceRow,
  creditPlayerBalanceRow,
  updatePlayerBalanceRow,
  softDeletePlayersNotInList: vi.fn(),
}));

describe("account_store debit/credit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("forwards conditional debit/credit to db", async () => {
    debitPlayerBalanceRow.mockResolvedValueOnce({ total: 40 });
    creditPlayerBalanceRow.mockResolvedValueOnce({ total: 55 });
    const store = await import("./account_store.js");
    expect(await store.debitPlayerBalance(42, 60, "u1")).toEqual({ total: 40 });
    expect(await store.creditPlayerBalance(42, 15, "u1")).toEqual({ total: 55 });
    expect(debitPlayerBalanceRow).toHaveBeenCalledWith(42, 60, "u1");
    expect(creditPlayerBalanceRow).toHaveBeenCalledWith(42, 15, "u1");
  });
});
