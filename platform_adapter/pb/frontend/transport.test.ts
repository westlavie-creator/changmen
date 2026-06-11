import { describe, expect, test, vi } from "vitest";
import type { PlatformAccount } from "@/models/platformAccount";
import { PB_PLUGIN_REQUIRED_MSG, pbGet } from "./transport";

vi.mock("@/extension/bridge", () => ({
  hasA8PluginRuntime: () => false,
  a8PluginGet: vi.fn(),
  a8PluginPost: vi.fn(),
}));

vi.mock("./auth", () => ({
  buildPbAuthHeaders: () => ({ Authorization: "Bearer x" }),
}));

const account: PlatformAccount = {
  provider: "PB",
  gateway: "https://pb.example",
  token: "t",
  referer: "https://pb.example/",
} as PlatformAccount;

describe("pb transport plugin gate", () => {
  test("pbGet without plugin throws", async () => {
    await expect(pbGet(account, "/member-service/v2/account-balance")).rejects.toThrow(
      PB_PLUGIN_REQUIRED_MSG,
    );
  });
});
