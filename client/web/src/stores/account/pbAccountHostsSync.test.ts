import { beforeEach, describe, expect, it, vi } from "vitest";
import { a8PluginSetStore, hasA8PluginRuntime } from "@changmen/client-core/chrome-plugin/bridge";
import { PlatformAccount } from "@/models/platformAccount";
import { PB_ACCOUNT_HOSTS_KEY, syncPbAccountHosts } from "./pbAccountHostsSync";

vi.mock("@changmen/client-core/chrome-plugin/bridge", () => ({
  hasA8PluginRuntime: vi.fn(() => true),
  a8PluginSetStore: vi.fn(async () => {}),
}));

function makePb(referer: string, gateway = "https://unused.example"): PlatformAccount {
  return new PlatformAccount({
    accountId: 1,
    playerName: "p",
    provider: "PB",
    gateway,
    referer,
    token: "{}",
  });
}

describe("syncPbAccountHosts", () => {
  beforeEach(() => {
    vi.mocked(a8PluginSetStore).mockClear();
    vi.mocked(hasA8PluginRuntime).mockReturnValue(true);
  });

  it("setStore 账号 referer 主机", async () => {
    await syncPbAccountHosts([
      makePb("https://skin.example/zh-cn/compact/sports/soccer"),
    ]);
    expect(a8PluginSetStore).toHaveBeenCalledWith(PB_ACCOUNT_HOSTS_KEY, ["skin.example"]);
  });

  it("无扩展时跳过 setStore", async () => {
    vi.mocked(hasA8PluginRuntime).mockReturnValue(false);
    await syncPbAccountHosts([makePb("https://skin.example/")]);
    expect(a8PluginSetStore).not.toHaveBeenCalled();
  });
});
