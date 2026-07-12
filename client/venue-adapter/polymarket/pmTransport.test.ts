import { beforeEach, describe, expect, test, vi } from "vitest";



vi.mock("@changmen/client-core/shared/http", () => ({

  directGet: vi.fn(),

  directPostJson: vi.fn(),

}));



vi.mock("@changmen/client-core/shared/platformHttp", () => ({

  changmenPmHttpRequest: vi.fn(),

  changmenPmEsportCall: vi.fn(),

  parseJsonLoose: (text: string) => JSON.parse(text),

}));



vi.mock("@changmen/client-core/chrome-plugin/bridge", () => ({

  a8PluginGet: vi.fn(),

  a8PluginPost: vi.fn(),

}));



vi.mock("./l2Auth", () => ({

  buildL2HeadersFromAccount: vi.fn(async () => ({

    POLY_ADDRESS: "0xabc",

    POLY_SIGNATURE: "sig",

    POLY_TIMESTAMP: "123",

    POLY_API_KEY: "key",

    POLY_PASSPHRASE: "pass",

  })),

}));



import { directGet, directPostJson } from "@changmen/client-core/shared/http";

import { changmenPmEsportCall, changmenPmHttpRequest } from "@changmen/client-core/shared/platformHttp";

import { a8PluginGet, a8PluginPost } from "@changmen/client-core/chrome-plugin/bridge";

import { pmEsportCall, pmTransportHttpGet } from "./pmTransport";

import { resolvePmHttpMode, setPmHttpModeForTests } from "./pmTransportMode";



const pmAccount = {

  accountId: 42,

  provider: "polymarket",

  token: JSON.stringify({ walletAddress: "0xabc", apiKey: "k", secret: "s", passphrase: "p" }),

  gateway: "https://clob.polymarket.com",

};



describe("pmTransport mode", () => {

  beforeEach(() => {

    setPmHttpModeForTests(null);

    vi.mocked(changmenPmHttpRequest).mockReset();

    vi.mocked(changmenPmEsportCall).mockReset();

    vi.mocked(directGet).mockReset();

    vi.mocked(directPostJson).mockReset();

    vi.mocked(a8PluginGet).mockReset();

    vi.mocked(a8PluginPost).mockReset();

  });



  test("默认 vps 走 changmenPmHttpRequest", async () => {

    expect(resolvePmHttpMode()).toBe("vps");

    vi.mocked(changmenPmHttpRequest).mockResolvedValue({

      status: 200,

      text: JSON.stringify([{ id: "1" }]),

    });

    const rows = await pmTransportHttpGet<Array<{ id: string }>>("https://gamma-api.polymarket.com/events");

    expect(rows).toEqual([{ id: "1" }]);

    expect(changmenPmHttpRequest).toHaveBeenCalledOnce();

  });



  test("direct 模式走 directGet", async () => {

    setPmHttpModeForTests("direct");

    vi.mocked(directGet).mockResolvedValue([{ id: "2" }]);

    const rows = await pmTransportHttpGet<Array<{ id: string }>>("https://gamma-api.polymarket.com/events");

    expect(rows).toEqual([{ id: "2" }]);

    expect(directGet).toHaveBeenCalledOnce();

    expect(changmenPmHttpRequest).not.toHaveBeenCalled();

  });



  test("extension 模式走 a8PluginGet 并 unwrap axios.data", async () => {

    setPmHttpModeForTests("extension");

    vi.mocked(a8PluginGet).mockResolvedValue({ status: 200, data: [{ id: "3" }] });

    const rows = await pmTransportHttpGet<Array<{ id: string }>>("https://gamma-api.polymarket.com/events");

    expect(rows).toEqual([{ id: "3" }]);

    expect(a8PluginGet).toHaveBeenCalledOnce();

  });



  test("vps 语义 API 走 changmenPmEsportCall 且剥离 _account", async () => {

    setPmHttpModeForTests("vps");

    vi.mocked(changmenPmEsportCall).mockResolvedValue({ tick_size: "0.01" });

    const book = await pmEsportCall("Pm_GetBook", { tokenId: "123", _account: pmAccount });

    expect(book).toEqual({ tick_size: "0.01" });

    expect(changmenPmEsportCall).toHaveBeenCalledWith("Pm_GetBook", { tokenId: "123" });

  });



  test("direct 语义 API Pm_GetBook", async () => {

    setPmHttpModeForTests("direct");

    vi.mocked(directGet).mockResolvedValue({ tick_size: "0.01" });

    const book = await pmEsportCall("Pm_GetBook", { tokenId: "123" });

    expect(book).toEqual({ tick_size: "0.01" });

    expect(directGet).toHaveBeenCalledWith(

      expect.stringContaining("/book?token_id=123"),

      {},

    );

  });



  test("extension 语义 API Pm_GetBook", async () => {

    setPmHttpModeForTests("extension");

    vi.mocked(a8PluginGet).mockResolvedValue({ status: 200, data: { tick_size: "0.01" } });

    const book = await pmEsportCall("Pm_GetBook", { tokenId: "123" });

    expect(book).toEqual({ tick_size: "0.01" });

    expect(a8PluginGet).toHaveBeenCalledWith(

      expect.stringContaining("/book?token_id=123"),

      undefined,

    );

  });



  test("extension 语义 API Pm_SubmitOrder 走 a8PluginPost", async () => {

    setPmHttpModeForTests("extension");

    vi.mocked(a8PluginPost).mockResolvedValue({ success: true, orderID: "oid-1" });

    const result = await pmEsportCall("Pm_SubmitOrder", {

      playerId: 42,

      order: { foo: 1 },

      _account: pmAccount,

    });

    expect(result).toEqual({ success: true, orderID: "oid-1" });

    expect(a8PluginPost).toHaveBeenCalledWith(

      "https://clob.polymarket.com/order",

      { foo: 1 },

      expect.objectContaining({ headers: expect.objectContaining({ POLY_API_KEY: "key" }) }),

    );

  });



  test("extension 语义 API Pm_GetTrades 分页", async () => {

    setPmHttpModeForTests("extension");

    vi.mocked(a8PluginGet)

      .mockResolvedValueOnce({ data: [{ id: "t1" }], next_cursor: "LTE=" });

    const trades = await pmEsportCall<unknown[]>("Pm_GetTrades", {

      playerId: 42,

      after: 1_700_000_000,

      _account: pmAccount,

    });

    expect(trades).toEqual([{ id: "t1" }]);

    expect(a8PluginGet).toHaveBeenCalledWith(

      expect.stringContaining("/data/trades?after="),

      expect.objectContaining({ headers: expect.objectContaining({ POLY_API_KEY: "key" }) }),

    );

  });



  test("extension 语义 API Pm_Heartbeat", async () => {

    setPmHttpModeForTests("extension");

    vi.mocked(a8PluginPost).mockResolvedValue({ heartbeat_id: "hb-next" });

    const res = await pmEsportCall<{ heartbeat_id?: string }>("Pm_Heartbeat", {

      playerId: 42,

      heartbeatId: "hb-prev",

      _account: pmAccount,

    });

    expect(res).toEqual({ heartbeat_id: "hb-next" });

    expect(a8PluginPost).toHaveBeenCalledWith(

      "https://clob.polymarket.com/v1/heartbeats",

      { heartbeat_id: "hb-prev" },

      expect.any(Object),

    );

  });



  test("extension 缺少 _account 时抛错", async () => {

    setPmHttpModeForTests("extension");

    await expect(pmEsportCall("Pm_SubmitOrder", { playerId: 1, order: {} }))

      .rejects.toThrow(/需要账号 token/);

  });

});


