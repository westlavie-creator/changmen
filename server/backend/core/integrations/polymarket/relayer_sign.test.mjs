import assert from "node:assert/strict";
import { afterEach, it } from "vitest";
import {
  getPolymarketRelayerPublicStatus,
  signPolymarketRelayerRequest,
} from "./relayer_sign.js";

const ENV_KEYS = [
  "RELAYER_API_KEY",
  "RELAYER_API_KEY_ADDRESS",
  "POLY_BUILDER_API_KEY",
  "POLY_BUILDER_SECRET",
  "POLY_BUILDER_PASSPHRASE",
];

function clearRelayerEnv() {
  for (const key of ENV_KEYS)
    delete process.env[key];
}

afterEach(() => {
  clearRelayerEnv();
});

it("signPolymarketRelayerRequest fails when creds missing", () => {
  clearRelayerEnv();
  const r = signPolymarketRelayerRequest({ method: "POST", path: "/submit" });
  assert.equal(r.ok, false);
  assert.match(r.msg, /未配置/);
});

it("signPolymarketRelayerRequest returns RELAYER_API_KEY headers (preferred)", () => {
  process.env.RELAYER_API_KEY = "01967c03-b8c8-7000-8f68-8b8eaec6fd3d";
  process.env.RELAYER_API_KEY_ADDRESS = "0x8ed24e533d24c2f381983eda8f97c2358f8d65e5";
  const r = signPolymarketRelayerRequest({ method: "POST", path: "/submit" });
  assert.equal(r.ok, true);
  assert.equal(r.headers.RELAYER_API_KEY, "01967c03-b8c8-7000-8f68-8b8eaec6fd3d");
  assert.equal(r.headers.RELAYER_API_KEY_ADDRESS, "0x8ed24e533d24c2f381983eda8f97c2358f8d65e5");
  assert.equal(r.headers.POLY_BUILDER_API_KEY, undefined);
});

it("signPolymarketRelayerRequest returns POLY_BUILDER_* when no relayer key", () => {
  process.env.POLY_BUILDER_API_KEY = "test-key";
  process.env.POLY_BUILDER_SECRET = "dGVzdC1zZWNyZXQ=";
  process.env.POLY_BUILDER_PASSPHRASE = "test-pass";
  const r = signPolymarketRelayerRequest({
    method: "POST",
    path: "/submit",
    body: "{\"foo\":1}",
    timestamp: 1_700_000_000,
  });
  assert.equal(r.ok, true);
  assert.equal(r.headers.POLY_BUILDER_API_KEY, "test-key");
  assert.equal(r.headers.POLY_BUILDER_PASSPHRASE, "test-pass");
  assert.equal(r.headers.POLY_BUILDER_TIMESTAMP, "1700000000");
  assert.match(r.headers.POLY_BUILDER_SIGNATURE, /^[A-Za-z0-9_=-]+$/);
});

it("getPolymarketRelayerPublicStatus reflects env", () => {
  clearRelayerEnv();
  assert.equal(getPolymarketRelayerPublicStatus().configured, false);
  process.env.RELAYER_API_KEY = "k";
  process.env.RELAYER_API_KEY_ADDRESS = "0x0000000000000000000000000000000000000001";
  const s = getPolymarketRelayerPublicStatus();
  assert.equal(s.configured, true);
  assert.equal(s.authMode, "relayer_api_key");
});
