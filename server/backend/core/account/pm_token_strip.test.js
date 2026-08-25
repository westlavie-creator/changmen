import { describe, expect, it } from "vitest";
import {
  enforcePolymarketPersistDto,
  polymarketTokenHasPrivateKeyMaterial,
  toPolymarketPersistToken,
  stripPrivateKeysFromAccountList,
} from "./pm_token_strip.js";

const W = `0x${"11".repeat(20)}`;
const F = `0x${"22".repeat(20)}`;
const pk = `0x${"99".repeat(32)}`;

describe("pm persist DTO contract", () => {
  it("projects allowlisted fields only", () => {
    const raw = JSON.stringify({
      walletAddress: W,
      privateKey: "0xdead",
      extra: [{ privateKey: "x" }],
      apiCreds: { apiKey: "a", secret: "b", passphrase: "c", junk: true },
    });
    expect(JSON.parse(toPolymarketPersistToken(raw))).toEqual({
      walletAddress: W,
      apiCreds: { apiKey: "a", secret: "b", passphrase: "c" },
    });
  });

  it("detects private key material for Save reject", () => {
    expect(polymarketTokenHasPrivateKeyMaterial(JSON.stringify({
      walletAddress: W,
      privateKey: pk,
    }))).toBe(true);
    expect(polymarketTokenHasPrivateKeyMaterial(pk)).toBe(true);
    expect(polymarketTokenHasPrivateKeyMaterial(JSON.stringify({
      walletAddress: W,
      apiCreds: { apiKey: "a", secret: "b", passphrase: "c" },
    }))).toBe(false);
  });

  it("enforce rejects PM rows still carrying private key", () => {
    const bad = [
      {
        provider: "Polymarket",
        token: JSON.stringify({ walletAddress: W, privateKey: pk }),
      },
    ];
    const rejected = enforcePolymarketPersistDto(bad);
    expect(rejected.ok).toBe(false);
    expect(String(rejected.msg || "")).toMatch(/禁止包含私钥/);

    const good = [
      {
        provider: "Polymarket",
        token: JSON.stringify({
          walletAddress: W,
          funder: F,
          extra: 1,
          apiCreds: { apiKey: "a", secret: "b", passphrase: "c" },
        }),
      },
    ];
    const ok = enforcePolymarketPersistDto(good);
    expect(ok.ok).toBe(true);
    expect(JSON.parse(good[0].token)).toEqual({
      walletAddress: W,
      funder: F,
      signatureType: "3",
      apiCreds: { apiKey: "a", secret: "b", passphrase: "c" },
    });
  });

  it("enforce rejects PredictFun rows still carrying privy key", () => {
    const acc = `0x${"aa".repeat(20)}`;
    const bad = [
      {
        provider: "PredictFun",
        token: JSON.stringify({ predictAccount: acc, privyPrivateKey: pk }),
      },
    ];
    const rejected = enforcePolymarketPersistDto(bad);
    expect(rejected.ok).toBe(false);
    expect(String(rejected.msg || "")).toMatch(/PredictFun.*私钥/);

    const good = [
      {
        provider: "PredictFun",
        token: JSON.stringify({ predictAccount: acc, mode: "house", junk: 1 }),
      },
    ];
    const ok = enforcePolymarketPersistDto(good);
    expect(ok.ok).toBe(true);
    expect(JSON.parse(good[0].token)).toEqual({ predictAccount: acc });
  });

  it("Get/Admin projection still cleans legacy dirty rows", () => {
    const list = [
      {
        provider: "Polymarket",
        token: JSON.stringify({
          privateKey: "0x1",
          funder: F,
          walletAddress: W,
          polyHeaders: { POLY_ADDRESS: W, POLY_API_KEY: "k" },
        }),
      },
      {
        provider: "OB",
        token: JSON.stringify({ privateKey: "keep-me" }),
      },
    ];
    stripPrivateKeysFromAccountList(list);
    expect(JSON.parse(list[0].token)).toEqual({
      walletAddress: W,
      funder: F,
      signatureType: "3",
    });
    expect(JSON.parse(list[1].token).privateKey).toBe("keep-me");
  });
});
