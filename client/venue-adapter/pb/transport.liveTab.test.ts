import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { PlatformAccount } from "@changmen/client-core/models/platformAccount";
import { pbGet, PB_LIVE_TAB_MEMBER_MISMATCH } from "./transport";
import { PB_LIVE_TAB_UNAVAILABLE, pbLiveTabRetryDelaysMs } from "./tabId";

const { a8PluginGet, setPbTabIdCached, acceptGate } = vi.hoisted(() => ({
  a8PluginGet: vi.fn(),
  setPbTabIdCached: vi.fn(),
  acceptGate: vi.fn(async (): Promise<"ok" | "mismatch" | "missing"> => "ok"),
}));
vi.mock("@changmen/client-core/chrome-plugin/bridge", () => ({
  a8PluginGet: (...args: unknown[]) => a8PluginGet(...args),
  a8PluginPost: vi.fn(),
}));

vi.mock("./auth", () => ({
  buildPbAuthHeaders: () => ({ "x-browser-session-id": "frozen" }),
  pbAccountUsesLiveTab: () => true,
}));

vi.mock("./tabId", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./tabId")>();
  return {
    ...actual,
    readPbTabIdFromPlugin: async () => 88,
    setPbTabIdCached: (...args: unknown[]) => setPbTabIdCached(...args),
  };
});

vi.mock("./liveCredential", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./liveCredential")>();
  return {
    ...actual,
    gatePbLiveCredentialFromPlugin: (...args: unknown[]) => acceptGate(...args),
    applyPbLiveCredentialToAccount: vi.fn(() => false),
    pbLiveMemberMatchesAccount: (account: { token?: string }, cred: { token?: string }) => {
      const acc = String(account?.token || "");
      const live = String(cred?.token || "");
      if (acc.includes("member-aaa") && live.includes("member-bbb"))
        return false;
      if (acc.includes("member-aaa") && live.includes("member-aaa"))
        return true;
      return actual.pbLiveMemberMatchesAccount(account as never, cred as never);
    },
  };
});

const account = {
  provider: "PB",
  gateway: "https://www.part888.com",
  token: "plain-member-aaa",
} as PlatformAccount;

describe("pbGet live tab [changmen]", () => {
  beforeEach(() => {
    a8PluginGet.mockReset();
    setPbTabIdCached.mockReset();
    acceptGate.mockReset();
    acceptGate.mockResolvedValue("ok");
    pbLiveTabRetryDelaysMs.splice(0, pbLiveTabRetryDelaysMs.length, 0);
  });

  afterEach(() => {
    pbLiveTabRetryDelaysMs.splice(0, pbLiveTabRetryDelaysMs.length, 250, 600, 1200, 2000);
  });

  test("plain 账号带 tabId + platform=PB", async () => {
    a8PluginGet.mockResolvedValue({ data: { success: true, betCredit: 1 } });
    const data = await pbGet(account, "/member-service/v2/account-balance");
    expect(data).toEqual({ success: true, betCredit: 1 });
    expect(a8PluginGet).toHaveBeenCalledWith(
      "https://www.part888.com/member-service/v2/account-balance",
      {
        tabId: 88,
        platform: "PB",
        provider: "PB",
      },
    );
  });

  test("F5 空窗：第一次 miss 后重试活标签成功", async () => {
    a8PluginGet
      .mockRejectedValueOnce(new Error("Could not establish connection. Receiving end does not exist."))
      .mockResolvedValueOnce({ data: { success: true, betCredit: 2 } });
    const data = await pbGet(account, "/member-service/v2/account-balance");
    expect(data).toEqual({ success: true, betCredit: 2 });
    expect(a8PluginGet).toHaveBeenCalledTimes(2);
    expect(a8PluginGet.mock.calls.every((call) => !("headers" in (call[1] as object)))).toBe(true);
  });

  test("活标签一直不可用则抛出，不打冻结核", async () => {
    a8PluginGet.mockResolvedValue(undefined);
    await expect(pbGet(account, "/member-service/v2/account-balance"))
      .rejects.toThrow(PB_LIVE_TAB_UNAVAILABLE);
    expect(setPbTabIdCached).toHaveBeenCalledWith(undefined);
    expect(a8PluginGet.mock.calls.every((call) => !("headers" in (call[1] as object)))).toBe(true);
  });

  test("活标签 403 不回退冻结核", async () => {
    a8PluginGet.mockResolvedValue("Request failed with status code 403");
    await expect(pbGet(account, "/member-service/v2/account-balance"))
      .rejects.toThrow("Request failed with status code 403");
    expect(a8PluginGet).toHaveBeenCalledTimes(1);
  });

  test("同帧快照会员不一致则丢弃响应，不落地余额/下注", async () => {
    a8PluginGet.mockResolvedValue({
      data: { success: true, betCredit: 999 },
      pbLiveCredential: {
        token: "plain-member-bbb",
        gateway: "https://www.part888.com",
      },
    });
    await expect(pbGet(account, "/member-service/v2/account-balance"))
      .rejects.toThrow(PB_LIVE_TAB_MEMBER_MISMATCH);
    expect(acceptGate).not.toHaveBeenCalled();
  });

  test("storage 回落校验到异号会员同样拒绝", async () => {
    a8PluginGet.mockResolvedValue({ data: { success: true, betCredit: 3 } });
    acceptGate.mockResolvedValue("mismatch");
    await expect(pbGet(account, "/member-service/v2/account-balance"))
      .rejects.toThrow(PB_LIVE_TAB_MEMBER_MISMATCH);
  });
});
