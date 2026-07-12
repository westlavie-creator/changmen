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
});
