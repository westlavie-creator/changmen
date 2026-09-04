/**
 * Predict.fun http-relay：注入 PREDICT_FUN_API_KEY 前必须校验 changmen JWT。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../core/esport-api/store.js", () => ({
  default: {
    getUserByToken: vi.fn(),
  },
}));

vi.mock("./pm_relay_l2.js", () => ({
  resolvePmRelayL2Headers: vi.fn(async () => null),
}));

import store from "../core/esport-api/store.js";
import {
  injectPredictFunApiKey,
  isPredictFunUpstream,
  requirePredictFunRelayAuth,
} from "./http_proxy_relay.js";

describe("http_proxy_relay Predict.fun API key auth", () => {
  beforeEach(() => {
    vi.mocked(store.getUserByToken).mockReset();
    delete process.env.PREDICT_FUN_API_KEY;
    delete process.env.VITE_PREDICT_FUN_API_KEY;
  });

  afterEach(() => {
    delete process.env.PREDICT_FUN_API_KEY;
    delete process.env.VITE_PREDICT_FUN_API_KEY;
  });

  it("recognizes mainnet and testnet Predict.fun hosts", () => {
    expect(isPredictFunUpstream("https://api.predict.fun/v1/tags")).toBe(true);
    expect(isPredictFunUpstream("https://api-testnet.predict.fun/v1/tags")).toBe(true);
    expect(isPredictFunUpstream("https://clob.polymarket.com/time")).toBe(false);
  });

  it("injects PREDICT_FUN_API_KEY when upstream lacks x-api-key", () => {
    process.env.PREDICT_FUN_API_KEY = "house-secret-key";
    const out = injectPredictFunApiKey({}, "https://api.predict.fun/v1/markets/1/orderbook");
    expect(out["x-api-key"]).toBe("house-secret-key");
  });

  it("does not overwrite a client-supplied x-api-key", () => {
    process.env.PREDICT_FUN_API_KEY = "house-secret-key";
    const out = injectPredictFunApiKey(
      { "x-api-key": "browser-key" },
      "https://api.predict.fun/v1/tags",
    );
    expect(out["x-api-key"]).toBe("browser-key");
  });

  it("rejects Predict.fun relay without changmen token header", async () => {
    const r = await requirePredictFunRelayAuth(
      { headers: { authorization: "Bearer pf-user-jwt" } },
      "https://api.predict.fun/v1/tags",
    );
    expect(r.ok).toBe(false);
    expect(r.status).toBe(401);
    expect(store.getUserByToken).not.toHaveBeenCalled();
  });

  it("rejects Predict.fun relay when token is present but invalid", async () => {
    vi.mocked(store.getUserByToken).mockResolvedValueOnce(null);
    const r = await requirePredictFunRelayAuth(
      { headers: { token: "garbage" } },
      "https://api.predict.fun/v1/markets/9/orderbook",
    );
    expect(r).toEqual({ ok: false, status: 401, msg: "http-relay token invalid" });
    expect(store.getUserByToken).toHaveBeenCalledWith("garbage");
  });

  it("allows Predict.fun relay when changmen JWT resolves to a user", async () => {
    vi.mocked(store.getUserByToken).mockResolvedValueOnce({ id: "u1" });
    const r = await requirePredictFunRelayAuth(
      { headers: { token: "valid.jwt" } },
      "https://api.predict.fun/v1/tags",
    );
    expect(r).toEqual({ ok: true });
  });

  it("skips auth gate for non-Predict.fun upstream", async () => {
    const r = await requirePredictFunRelayAuth(
      { headers: {} },
      "https://example.com/x",
    );
    expect(r).toEqual({ ok: true });
    expect(store.getUserByToken).not.toHaveBeenCalled();
  });
});
