import { describe, expect, it } from "vitest";
import type { PlatformAccount } from "@changmen/client-core/models/platformAccount";
import {
  applyPbLiveCredentialToAccount,
  parsePbLiveCredential,
  pbLiveMemberMatchesAccount,
  PB_LIVE_CREDENTIAL_STORE_KEY,
} from "./liveCredential";

function plainToken(member = "abc"): string {
  return JSON.stringify({
    "x-app-data": JSON.stringify({ BrowserSessionId: "sess-live", custid: `id%3D${member}` }),
    token: JSON.stringify({ "X-U": "fresh-u", "X-Custid": `id=${member}` }),
  });
}

function suffixed515(): string {
  return JSON.stringify({
    "x-app-data": JSON.stringify({ BrowserSessionId_515: "s", custid_515: "id%3Dabc" }),
    token: JSON.stringify({ "X-U": "nope" }),
  });
}

describe("applyPbLiveCredentialToAccount [changmen]", () => {
  it("plain 账号写回官网活 token", () => {
    const account = {
      provider: "PB",
      gateway: "https://www.part888.com",
      token: plainToken("abc"),
    } as PlatformAccount;
    const next = plainToken("abc").replace("fresh-u", "newer-u");
    expect(applyPbLiveCredentialToAccount(account, {
      token: next,
      gateway: "https://www.part888.com",
      referer: "https://www.part888.com/zh-cn/compact/sports/soccer",
    })).toBe(true);
    expect(account.token).toBe(next);
    expect(account.referer).toContain("compact/sports");
  });

  it("515 账号不写（对齐 A8 k0）", () => {
    const account = {
      provider: "PB",
      token: suffixed515(),
    } as PlatformAccount;
    const before = account.token;
    expect(applyPbLiveCredentialToAccount(account, { token: plainToken() })).toBe(false);
    expect(account.token).toBe(before);
  });

  it("官网快照是 515 不写进 plain 账号", () => {
    const account = {
      provider: "PB",
      token: plainToken("abc"),
    } as PlatformAccount;
    const before = account.token;
    expect(applyPbLiveCredentialToAccount(account, { token: suffixed515() })).toBe(false);
    expect(account.token).toBe(before);
  });

  it("会员 id 不一致不写，避免串号", () => {
    const account = {
      provider: "PB",
      gateway: "https://www.part888.com",
      token: plainToken("aaa"),
    } as PlatformAccount;
    const before = account.token;
    expect(applyPbLiveCredentialToAccount(account, {
      token: plainToken("bbb"),
      gateway: "https://www.part888.com",
    })).toBe(false);
    expect(account.token).toBe(before);
  });

  it("gateway 主机不一致不写", () => {
    const account = {
      provider: "PB",
      gateway: "https://www.ps3838.com",
      token: plainToken("abc"),
    } as PlatformAccount;
    expect(applyPbLiveCredentialToAccount(account, {
      token: plainToken("abc"),
      gateway: "https://www.part888.com",
    })).toBe(false);
  });
  it("空 live 会员 id 不写，避免冲掉账号 token", () => {
    const account = {
      provider: "PB",
      gateway: "https://www.part888.com",
      token: plainToken("aaa"),
    } as PlatformAccount;
    const before = account.token;
    const emptyMember = JSON.stringify({
      "x-app-data": JSON.stringify({ BrowserSessionId: "sess-live" }),
      token: JSON.stringify({ "X-U": "fresh-u" }),
    });
    expect(applyPbLiveCredentialToAccount(account, {
      token: emptyMember,
      gateway: "https://www.part888.com",
    })).toBe(false);
    expect(account.token).toBe(before);
  });

  it("pbLiveMemberMatchesAccount：账号有 id 时要求官网同号", () => {
    expect(pbLiveMemberMatchesAccount(
      { token: plainToken("aaa") },
      { token: plainToken("aaa") },
    )).toBe(true);
    expect(pbLiveMemberMatchesAccount(
      { token: plainToken("aaa") },
      { token: plainToken("bbb") },
    )).toBe(false);
  });
});

describe("parsePbLiveCredential", () => {
  it("reads plugin getStore shapes", () => {
    const cred = { token: plainToken(), gateway: "https://www.part888.com" };
    expect(parsePbLiveCredential({ data: { [PB_LIVE_CREDENTIAL_STORE_KEY]: cred } })?.gateway)
      .toBe("https://www.part888.com");
    expect(parsePbLiveCredential({ data: cred })?.token).toBe(cred.token);
  });
});
