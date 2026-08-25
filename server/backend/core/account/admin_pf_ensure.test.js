import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../auth/admin_auth.js", () => ({
  isAdminUser: vi.fn(() => true),
}));

describe("ensurePredictFunHouseAccount (会员下线)", () => {
  const caller = { id: "admin", userName: "ops", is_admin: true };

  beforeEach(() => {
    vi.resetModules();
  });

  it("rejects ensure with membership removed message", async () => {
    const { ensurePredictFunHouseAccount, PF_MEMBERSHIP_REMOVED_MSG } = await import("./admin_pf.js");
    await expect(ensurePredictFunHouseAccount("u-pf", caller))
      .rejects
      .toThrow(PF_MEMBERSHIP_REMOVED_MSG);
  });
});
