import { describe, expect, it, vi, beforeEach } from "vitest";
import { BetOption } from "@/models/betOption";
import { PlatformAccount } from "@/models/platformAccount";
import { obProvider } from "./bet";

const accountGet = vi.fn();
const accountPostForm = vi.fn();
vi.mock("@/shared/platformHttp", () => ({
  accountGet: (...args: unknown[]) => accountGet(...args),
  accountPostForm: (...args: unknown[]) => accountPostForm(...args),
}));

vi.mock("@/shared/md5", () => ({
  md5: (s: string) => `md5:${s}`,
}));

function makeOption(): BetOption {
  return {
    matchId: "m1",
    betId: "b1",
    itemId: "i1",
    betMoney: 100,
    odds: 1.85,
    updateOdds: vi.fn(),
    type: "OB",
    data: null,
  } as unknown as BetOption;
}

describe("obProvider.getBalance", () => {
  const account = new PlatformAccount({
    accountId: 1,
    playerName: "ob",
    provider: "OB",
    gateway: "https://ob.example",
    token: "tok",
  });

  beforeEach(() => {
    accountGet.mockReset();
    accountGet.mockImplementation(async (_acc, path) => {
      if (path === "/game/balance") {
        return { status: "true", data: { balance: 88, currency_en: "CNY", uid: "u1" } };
      }
      if (String(path).includes("/game/odd/updateType")) {
        return { status: "true", data: "2" };
      }
      if (path === "/game/member/heartbeat") {
        return { status: "true" };
      }
      return {};
    });
  });

  it("无 gateway/token 前置守卫，status=true 时返回余额（对齐 A8 yYe）", async () => {
    const bare = { ...account, gateway: "", token: "" } as PlatformAccount;
    const bal = await obProvider.getBalance!(bare);
    expect(bal).toEqual({ balance: 88, currency: "CNY" });
    expect(accountGet).toHaveBeenCalledWith(bare, "/game/balance");
  });
});

describe("obProvider.checkBet", () => {
  const account = new PlatformAccount({
    accountId: 1,
    playerName: "ob",
    provider: "OB",
    gateway: "https://ob.example",
    token: "tok",
  });

  beforeEach(() => {
    accountGet.mockReset();
    accountPostForm.mockReset();
    account.errorCount = 0;
  });

  it("探针与下单 data 共用同一 time_stamp / secret_key（对齐 A8 yYe）", async () => {
    accountPostForm.mockResolvedValue({ status: "false", data: "Minimum stake 10" });
    const option = makeOption();
    await obProvider.checkBet!(account, option);

    expect(accountPostForm).toHaveBeenCalledTimes(1);
    const probeBody = accountPostForm.mock.calls[0]![2] as Record<string, unknown>;
    const data = option.data as Record<string, unknown>;
    expect(data.time_stamp).toBe(probeBody.time_stamp);
    expect(data.secret_key).toBe(probeBody.secret_key);
    expect(data["b[0]"]).toMatch(/a=100&/);
  });

  it("非 Minimum 探针响应一律预检失败（对齐 A8 yYe，不看 status）", async () => {
    accountPostForm.mockResolvedValue({ status: "true", data: "ok" });
    const option = makeOption();
    const out = await obProvider.checkBet!(account, option);
    expect(out.data).toBeFalsy();
    expect(out.checkError).toBe("ok");
  });

  it("Minimum 后继续写 data 且不递归预检", async () => {
    accountPostForm.mockResolvedValue({ status: "false", data: "Minimum stake" });
    const option = makeOption();
    const out = await obProvider.checkBet!(account, option);
    expect(accountPostForm).toHaveBeenCalledTimes(1);
    expect(out.data).toBeDefined();
    expect(out.newOdds).toBe(0);
  });
});

describe("obProvider.betting", () => {
  const account = new PlatformAccount({
    accountId: 2,
    playerName: "ob2",
    provider: "OB",
    gateway: "https://ob.example",
    token: "tok",
  });

  beforeEach(() => {
    accountPostForm.mockReset();
  });

  it("成功 message 使用场馆 res.data（对齐 A8 uo）", async () => {
    accountPostForm.mockResolvedValue({ status: "true", data: "下注成功" });
    const option = makeOption();
    option.data = {
      c: 1,
      "b[0]": "mch=m1&mkt=b1&oid=i1&odd=1.850&a=100&bt=1",
      types: 1,
      time_stamp: 123,
      secret_key: "k",
    };
    const result = await obProvider.betting!(account, option);
    expect(result.success).toBe(true);
    expect(result.message).toBe("下注成功");
  });
});
