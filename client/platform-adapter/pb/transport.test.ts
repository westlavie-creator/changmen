import { describe, expect, test, vi } from "vitest";
import type { PlatformAccount } from "@/models/platformAccount";
import { pbOddsPath, pbOddsUrl } from "./parse";
import { pbGatewayUrl, pbGet } from "./transport";

const a8PluginGet = vi.fn();
vi.mock("@/chrome-plugin/bridge", () => ({
  a8PluginGet: (...args: unknown[]) => a8PluginGet(...args),
  a8PluginPost: vi.fn(),
}));

vi.mock("./auth", () => ({
  buildPbAuthHeaders: () => ({ "x-custid-515": "1" }),
}));

const account: PlatformAccount = {
  provider: "PB",
  gateway: "https://pb.example",
  token: "t",
} as PlatformAccount;

describe("pbGatewayUrl (A8 Ly)", () => {
  test("gateway 与 path 直接拼接", () => {
    expect(pbGatewayUrl({ gateway: "https://pb.example" }, "/member-service/v2/account-balance")).toBe(
      "https://pb.example/member-service/v2/account-balance",
    );
  });

  test("euro/odds：path 不含 gateway，避免 pbGet 二次拼接", () => {
    const path = pbOddsPath(true, 1_781_939_873_254);
    expect(path.startsWith("/sports-service/sv/euro/odds?")).toBe(true);
    expect(path).not.toMatch(/^https?:\/\//);
    expect(pbGatewayUrl({ gateway: "https://rsokff9.auremi88.com" }, path)).toBe(
      pbOddsUrl("https://rsokff9.auremi88.com", true, 1_781_939_873_254),
    );
  });
});

describe("pbGet (A8 Zn.get)", () => {
  test("unwrap axios response.data", async () => {
    a8PluginGet.mockResolvedValue({ data: { success: true, betCredit: 100 } });
    const data = await pbGet<{ success: boolean; betCredit: number }>(
      account,
      "/member-service/v2/account-balance",
    );
    expect(a8PluginGet).toHaveBeenCalledWith(
      "https://pb.example/member-service/v2/account-balance",
      { headers: { "x-custid-515": "1" } },
    );
    expect(data).toEqual({ success: true, betCredit: 100 });
  });

  test("Zn 返回 null 时得到 undefined", async () => {
    a8PluginGet.mockResolvedValue(undefined);
    const data = await pbGet(account, "/member-service/v2/account-balance");
    expect(data).toBeUndefined();
  });
});
