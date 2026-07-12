import { beforeEach, describe, expect, it, vi } from "vitest";
import { a8PluginSetStore, hasA8PluginRuntime } from "@changmen/client-core/chrome-plugin/bridge";
import { PlatformAccount } from "@/models/platformAccount";

import {
  collectModifyHeaderRules,
  MODIFY_HEADER_KEY,
  syncModifyHeaderRules,
} from "@/stores/account/modifyHeaderSync";

vi.mock("@changmen/client-core/chrome-plugin/bridge", () => ({
  hasA8PluginRuntime: vi.fn(() => true),
  a8PluginSetStore: vi.fn(async () => {}),
}));

function makeAccount(patch: Record<string, unknown> = {}) {
  return new PlatformAccount({
    accountId: 1,
    playerName: "test",
    provider: "RAY",
    ...patch,
  });
}

describe("collectModifyHeaderRules", () => {
  it("收集同时有 gateway 与 userAgent 的账号", () => {
    const rules = collectModifyHeaderRules([
      makeAccount({
        accountId: 1,
        gateway: "https://stake.com",
        userAgent: "MobileUA",
      }),
      makeAccount({
        accountId: 2,
        gateway: "https://ray.com",
        userAgent: "",
      }),
      makeAccount({
        accountId: 3,
        gateway: "",
        userAgent: "OtherUA",
      }),
    ]);
    expect(rules).toEqual([{ UrlPattern: "https://stake.com", UserAgent: "MobileUA" }]);
  });

  it("无匹配账号时返回空数组", () => {
    expect(collectModifyHeaderRules([makeAccount({ accountId: 1 })])).toEqual([]);
  });
});

describe("syncModifyHeaderRules", () => {
  beforeEach(() => {
    vi.mocked(hasA8PluginRuntime).mockReturnValue(true);
    vi.mocked(a8PluginSetStore).mockClear();
  });

  it("有扩展时 setStore ModifyHeader", async () => {
    const accounts = [
      makeAccount({
        accountId: 1,
        gateway: "https://pb.example",
        userAgent: "UA1",
      }),
    ];
    await syncModifyHeaderRules(accounts);
    expect(a8PluginSetStore).toHaveBeenCalledWith(MODIFY_HEADER_KEY, [
      { UrlPattern: "https://pb.example", UserAgent: "UA1" },
    ]);
  });

  it("无扩展时跳过 setStore", async () => {
    vi.mocked(hasA8PluginRuntime).mockReturnValue(false);
    await syncModifyHeaderRules([
      makeAccount({ gateway: "https://x", userAgent: "UA" }),
    ]);
    expect(a8PluginSetStore).not.toHaveBeenCalled();
  });

  it("setStore 失败不抛错", async () => {
    vi.mocked(a8PluginSetStore).mockRejectedValueOnce(new Error("ext offline"));
    await expect(
      syncModifyHeaderRules([makeAccount({ gateway: "https://x", userAgent: "UA" })]),
    ).resolves.toBeUndefined();
  });
});
