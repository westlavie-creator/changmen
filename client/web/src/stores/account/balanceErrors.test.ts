import { describe, expect, it } from "vitest";
import { PlatformAccount } from "@/models/platformAccount";
import { normalizeBalanceError } from "@/stores/account/balanceErrors";

function makeAccount(patch: Record<string, unknown> = {}) {
  const acc = new PlatformAccount({
    accountId: 1,
    playerName: "test",
    provider: "RAY",
    ...patch,
  });
  if (typeof patch.provider === "string") acc.provider = patch.provider as PlatformAccount["provider"];
  if (typeof patch.accountId === "number") acc.accountId = patch.accountId;
  if (typeof patch.profit === "number") acc.profit = patch.profit;
  return acc;
}

describe("normalizeBalanceError", () => {
  it("maps HTTP 403 to gateway hint", () => {
    const acc = makeAccount();
    expect(normalizeBalanceError(new Error("HTTP 403"), acc)).toContain("gateway");
  });

  it("maps auth-like errors to token error", () => {
    const acc = makeAccount();
    expect(normalizeBalanceError(new Error("401 Unauthorized"), acc)).toBe("token error");
  });

  it("maps RAY not configured JSON to token error", () => {
    const acc = makeAccount();
    const raw = JSON.stringify({ error: "RAY not configured", hint: "set env" });
    expect(normalizeBalanceError(new Error(raw), acc)).toBe("token error");
  });

  it("maps relay network failure when account uses proxy", () => {
    const acc = makeAccount({ proxyId: 1 });
    expect(normalizeBalanceError(new Error("Failed to fetch"), acc)).toBe(
      "本机 HTTP 代理未连接，请先运行 npm run web（3456）",
    );
  });

  it("maps direct venue network failure to CORS hint", () => {
    const acc = makeAccount({ provider: "OB" });
    expect(normalizeBalanceError(new Error("NetworkError"), acc)).toContain("无法连接 OB 场馆");
  });

  it("preserves unrelated venue error text", () => {
    const acc = makeAccount();
    expect(normalizeBalanceError(new Error("余额接口维护中"), acc)).toBe("余额接口维护中");
  });
});
