import { beforeEach, describe, expect, test, vi } from "vitest";
import type { PlatformAccount } from "@changmen/client-core/models/platformAccount";
import { pbGet } from "./transport";

const { a8PluginGet, setPbTabIdCached } = vi.hoisted(() => ({
  a8PluginGet: vi.fn(),
  setPbTabIdCached: vi.fn(),
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

describe("pbGet live tab [changmen]", () => {
  beforeEach(() => {
    a8PluginGet.mockReset();
    setPbTabIdCached.mockReset();
  });

  test("plain 账号带 tabId + platform=PB", async () => {
    a8PluginGet.mockResolvedValue({ data: { success: true, betCredit: 1 } });
    const account = {
      provider: "PB",
      gateway: "https://www.part888.com",
      token: "plain",
    } as PlatformAccount;
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

  test("标签页无 handler 时回退冻结核", async () => {
    a8PluginGet
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ data: { success: true, betCredit: 2 } });
    const account = {
      provider: "PB",
      gateway: "https://www.part888.com",
      token: "plain",
    } as PlatformAccount;
    const data = await pbGet(account, "/member-service/v2/account-balance");
    expect(data).toEqual({ success: true, betCredit: 2 });
    expect(setPbTabIdCached).toHaveBeenCalledWith(undefined);
    expect(a8PluginGet).toHaveBeenNthCalledWith(
      2,
      "https://www.part888.com/member-service/v2/account-balance",
      { headers: { "x-browser-session-id": "frozen" } },
    );
  });

  test("活标签 403 不回退冻结核", async () => {
    a8PluginGet.mockResolvedValue("Request failed with status code 403");
    const account = {
      provider: "PB",
      gateway: "https://www.part888.com",
      token: "plain",
    } as PlatformAccount;
    await expect(pbGet(account, "/member-service/v2/account-balance"))
      .rejects.toThrow("Request failed with status code 403");
    expect(a8PluginGet).toHaveBeenCalledTimes(1);
  });
});
