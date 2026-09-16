import { describe, expect, it } from "vitest";
import { preserveStoredAccountToken } from "./account_token_preserve.js";

describe("preserveStoredAccountToken", () => {
  it("keeps stored token when client omits token", () => {
    const out = preserveStoredAccountToken(
      { accountId: 303, provider: "Stake" },
      { accountId: 303, token: "session-cookie" },
    );
    expect(out.token).toBe("session-cookie");
  });

  it("allows explicit empty token", () => {
    const out = preserveStoredAccountToken(
      { accountId: 303, token: "" },
      { token: "session-cookie" },
    );
    expect(out.token).toBe("");
  });

  it("does not invent a token", () => {
    const out = preserveStoredAccountToken({ accountId: 1, provider: "OB" }, { provider: "OB" });
    expect(out.token).toBeUndefined();
  });
});
