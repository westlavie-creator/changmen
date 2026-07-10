import { describe, expect, it } from "vitest";
import { accountOrderDisplayName } from "./accountDisplayName";

describe("accountOrderDisplayName", () => {
  it("prefers venueAccountName over playerName", () => {
    expect(accountOrderDisplayName({
      venueAccountName: "ray_user",
      playerName: "legacy",
      accountId: 1,
    })).toBe("ray_user");
  });

  it("falls back to playerName", () => {
    expect(accountOrderDisplayName({ playerName: "legacy", accountId: 1 })).toBe("legacy");
  });

  it("falls back to account id", () => {
    expect(accountOrderDisplayName({ accountId: 42 })).toBe("#42");
  });
});
