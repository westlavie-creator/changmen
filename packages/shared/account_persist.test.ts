import { describe, expect, it } from "vitest";
import { accountsPersistUnchanged } from "./account_persist";

describe("accountsPersistUnchanged", () => {
  it("returns true when only balance/updateTime changed", () => {
    const before = [{ accountId: 1, token: "x", balance: 100, updateTime: 1 }];
    const after = [{ accountId: 1, token: "x", balance: 200, updateTime: 2 }];
    expect(accountsPersistUnchanged(before, after)).toBe(true);
  });

  it("returns false when credentials changed", () => {
    const before = [{ accountId: 1, token: "x", balance: 100 }];
    const after = [{ accountId: 1, token: "y", balance: 100 }];
    expect(accountsPersistUnchanged(before, after)).toBe(false);
  });

  it("returns false when account count changed", () => {
    expect(accountsPersistUnchanged([{ accountId: 1 }], [])).toBe(false);
  });
});
