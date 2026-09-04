import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const dir = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(dir, "http_proxy_relay.js"), "utf8");

describe("http_proxy_relay polymarket headers", () => {
  test("POLY_UPSTREAM_HEADERS 含 L1 必需的 POLY_NONCE", () => {
    expect(source).toMatch(/POLY_UPSTREAM_HEADERS[\s\S]*?"POLY_NONCE"/);
    expect(source).toMatch(/POLY_HEADER_CANONICAL[\s\S]*?"poly_nonce":\s*"POLY_NONCE"/);
  });

  test("PM relay 合并 clob-client SDK transport 头（User-Agent / Accept / Connection）", () => {
    expect(source).toMatch(/polymarketSdkTransportHeaders/);
    expect(source).toMatch(/mergePolymarketUpstreamHeaders/);
    expect(source).toMatch(/PM_CLOB_USER_AGENT/);
    expect(source).toMatch(/@polymarket\/clob-client/);
    expect(source).toMatch(/isPolymarketUpstream\(targetUrl\)[\s\S]*mergePolymarketUpstreamHeaders/);
  });

  test("Predict.fun 上游缺 x-api-key 时注入 PREDICT_FUN_API_KEY", () => {
    expect(source).toMatch(/injectPredictFunApiKey/);
    expect(source).toMatch(/isPredictFunUpstream/);
    expect(source).toMatch(/PREDICT_FUN_API_KEY/);
    expect(source).toMatch(/return injectPredictFunApiKey\(out, targetUrl\)/);
  });

  test("Predict.fun 上游在注入 Key 前校验 changmen JWT（非 presence-only）", () => {
    expect(source).toMatch(/requirePredictFunRelayAuth/);
    expect(source).toMatch(/getUserByToken/);
    expect(source).toMatch(/http-relay token invalid/);
    // Authorization 不能单独充当 changmen 会话（可能是 Predict.fun 用户 JWT）
    expect(source).toMatch(/headerValue\(req\.headers\.token\)/);
  });
});
