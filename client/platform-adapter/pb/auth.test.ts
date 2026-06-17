import { describe, expect, it } from "vitest";
import type { PlatformAccount } from "@/models/platformAccount";
import { buildPbAuthHeaders } from "./auth";

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
