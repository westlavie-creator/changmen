import { describe, expect, it } from "vitest";
import type { PlatformAccount } from "@changmen/client-core/models/platformAccount";
import { buildPbAuthHeaders, parsePbVenueIdentity } from "./auth";

function makeAccount(token: string): PlatformAccount {
  return { provider: "PB", gateway: "https://pb.example", token } as PlatformAccount;
}

describe("buildPbAuthHeaders (A8 k0)", () => {
  it("515 后缀与 A8 k0 字段一致", () => {
    const appData = { BrowserSessionId_515: "sess-1", foo: "bar" };
    const token = JSON.stringify({
      "x-app-data": JSON.stringify(appData),
      custid_515: "user%2B1",
      "v-hucode": "hu",
    });
    const headers = buildPbAuthHeaders(makeAccount(token));
    expect(headers).toEqual({
      "x-app-data": "BrowserSessionId_515=sess-1;foo=bar;",
      "x-browser-session-id-515": "sess-1",
      "x-custid-515": "user+1",
      "v-hucode": "hu",
      "x-requested-with": "XMLHttpRequest",
    });
  });

  it("1228 后缀从 x-app-data 检测", () => {
    const appData = {
      BrowserSessionId_1228: "sess-1228",
      custid_1228: "id%3Dabc",
    };
    const token = JSON.stringify({
      "x-app-data": JSON.stringify(appData),
      "v-hucode": "hu1228",
      token: JSON.stringify({
        "X-U-1228": "u-token",
        "X-Custid-1228": "id=abc",
      }),
    });
    const headers = buildPbAuthHeaders(makeAccount(token));
    expect(headers?.["x-browser-session-id-1228"]).toBe("sess-1228");
    expect(headers?.["x-custid-1228"]).toBe("id=abc");
    expect(headers?.["x-u-1228"]).toBe("u-token");
    expect(headers?.["x-browser-session-id-515"]).toBeUndefined();
  });

  it("合并 extra 头（对齐 k0 第二参）", () => {
    const token = JSON.stringify({
      "x-app-data": "{}",
      custid_515: "",
      "v-hucode": "",
    });
    const headers = buildPbAuthHeaders(makeAccount(token), {
      "content-type": "application/json; charset=UTF-8",
    });
    expect(headers?.["content-type"]).toBe("application/json; charset=UTF-8");
  });
});

describe("parsePbVenueIdentity", () => {
  it("从 __udata + custid 解析会员 ID 与登录名", () => {
    const udata = Buffer.from(JSON.stringify({
      userCode: "JJJ010016S",
      loginId: "bttes2_47104",
    })).toString("base64");
    const token = JSON.stringify({
      "x-app-data": JSON.stringify({
        BrowserSessionId_1228: "sess",
        custid_1228: "id%3DJJJ010016S%26login%3D202607091121",
      }),
      __udata: udata,
      a: Buffer.from(JSON.stringify({ loginId: "bttes2_47104" })).toString("base64"),
    });
    expect(parsePbVenueIdentity(token)).toEqual({
      venueMemberId: "JJJ010016S",
      venueAccountName: "bttes2_47104",
    });
  });

  it("无 __udata 时回退 custid.id，登录名回退会员 ID", () => {
    const token = JSON.stringify({
      "x-app-data": JSON.stringify({
        BrowserSessionId_1228: "sess",
        custid_1228: "id%3DONLYID%26login%3D1",
      }),
    });
    expect(parsePbVenueIdentity(token)).toEqual({
      venueMemberId: "ONLYID",
      venueAccountName: "ONLYID",
    });
  });

  it("兼容剪贴板外层 {provider,token} 与 base64", () => {
    const udata = Buffer.from(JSON.stringify({
      userCode: "JJJ010016S",
      loginId: "bttes2_47104",
    })).toString("base64");
    const cookie = {
      "x-app-data": JSON.stringify({
        BrowserSessionId_1228: "sess",
        custid_1228: "id%3DJJJ010016S%26login%3D1",
      }),
      __udata: udata,
    };
    const clipboard = {
      provider: "PB",
      gateway: "https://pb.example",
      token: JSON.stringify(cookie),
      referer: "https://pb.example/",
    };
    expect(parsePbVenueIdentity(JSON.stringify(clipboard))).toEqual({
      venueMemberId: "JJJ010016S",
      venueAccountName: "bttes2_47104",
    });
    expect(parsePbVenueIdentity(Buffer.from(JSON.stringify(clipboard)).toString("base64"))).toEqual({
      venueMemberId: "JJJ010016S",
      venueAccountName: "bttes2_47104",
    });
  });

  it("坏 token 返回 undefined", () => {
    expect(parsePbVenueIdentity(undefined)).toBeUndefined();
    expect(parsePbVenueIdentity("{")).toBeUndefined();
  });

  it("ps3838 无后缀 custid + 顶层 token X-Custid", () => {
    const token = JSON.stringify({
      "x-app-data": JSON.stringify({
        BrowserSessionId: "sess-plain",
        custid: "id%3DGA33470888%26login%3D1",
      }),
      token: JSON.stringify({
        "X-Browser-Session-Id": "sess-plain",
        "X-Custid": "id=GA33470888&login=1",
      }),
      "v-hucode": "hu",
    });
    expect(parsePbVenueIdentity(token)).toEqual({
      venueMemberId: "GA33470888",
      venueAccountName: "GA33470888",
    });
  });
});

describe("buildPbAuthHeaders ps3838 plain keys", () => {
  it("无后缀 BrowserSessionId/custid → x-browser-session-id / x-custid", () => {
    const appData = { BrowserSessionId: "sess-plain", custid: "id%3Dabc", foo: "bar" };
    const token = JSON.stringify({
      "x-app-data": JSON.stringify(appData),
      "v-hucode": "hu",
      token: JSON.stringify({
        "X-Browser-Session-Id": "sess-plain",
        "X-Custid": "id=abc",
        "X-U": "u-token",
      }),
    });
    const headers = buildPbAuthHeaders(makeAccount(token));
    expect(headers?.["x-browser-session-id"]).toBe("sess-plain");
    expect(headers?.["x-custid"]).toBe("id=abc");
    expect(headers?.["x-u"]).toBe("u-token");
    expect(headers?.["x-browser-session-id-515"]).toBeUndefined();
  });
});
