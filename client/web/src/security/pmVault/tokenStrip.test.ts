import { describe, expect, it } from "vitest";
import {
  extractPrivateKeyFromToken,
  mergePrivateKeyIntoToken,
  stripPrivateKeyFromToken,
} from "./tokenStrip";
import {
  createVerifier,
  decryptUtf8,
  deriveKek,
  encryptUtf8,
  randomBytes,
  verifyKek,
  bytesToBase64,
  base64ToBytes,
} from "./crypto";

function b64utf8(text: string): string {
  return btoa(unescape(encodeURIComponent(text)));
}

describe("pmVault tokenStrip allowlist", () => {
  const W = `0x${"11".repeat(20)}`;
  const F = `0x${"22".repeat(20)}`;

  it("keeps only allowlisted fields and drops privateKey", () => {
    const raw = JSON.stringify({
      walletAddress: W,
      privateKey: `0x${"11".repeat(32)}`,
      extra: [{ privateKey: "nope" }],
      apiCreds: { apiKey: "k", secret: "s", passphrase: "p", junk: 1 },
    });
    const stripped = stripPrivateKeyFromToken(raw);
    expect(extractPrivateKeyFromToken(stripped)).toBeUndefined();
    const parsed = JSON.parse(stripped);
    expect(parsed).toEqual({
      walletAddress: W,
      apiCreds: { apiKey: "k", secret: "s", passphrase: "p" },
    });
  });

  it("unwraps nested token and maps funderAddress", () => {
    const nested = JSON.stringify({
      funderAddress: F,
      privateKey: `0x${"33".repeat(32)}`,
      walletAddress: W,
    });
    const raw = JSON.stringify({ token: nested, noise: 1 });
    const stripped = stripPrivateKeyFromToken(raw);
    expect(JSON.parse(stripped)).toEqual({
      walletAddress: W,
      funder: F,
      signatureType: "3",
    });
  });

  it("accepts base64-wrapped token", () => {
    const inner = JSON.stringify({
      walletAddress: W,
      privateKey: `0x${"44".repeat(32)}`,
    });
    const stripped = stripPrivateKeyFromToken(b64utf8(inner));
    expect(JSON.parse(stripped)).toEqual({ walletAddress: W });
  });

  it("extracts nested privateKey for resolve", () => {
    const nested = JSON.stringify({ privateKey: `0x${"55".repeat(32)}` });
    const raw = JSON.stringify({ token: nested });
    expect(extractPrivateKeyFromToken(raw)).toBe(`0x${"55".repeat(32)}`);
  });

  it("drops deep / array / blob smuggled keys via allowlist", () => {
    const pk = `0x${"66".repeat(32)}`;
    expect(extractPrivateKeyFromToken(JSON.stringify({
      a: { a: { privateKey: pk } },
    }))).toBe(pk);
    expect(stripPrivateKeyFromToken(JSON.stringify({
      a: { a: { privateKey: pk, keep: 1 } },
      walletAddress: W,
    }))).toBe(JSON.stringify({ walletAddress: W }));

    expect(stripPrivateKeyFromToken(JSON.stringify({
      extra: [{ privateKey: pk }],
      walletAddress: W,
    }))).toBe(JSON.stringify({ walletAddress: W }));

    const b64 = b64utf8(JSON.stringify({ privateKey: pk }));
    expect(JSON.parse(stripPrivateKeyFromToken(JSON.stringify({
      blob: b64,
      walletAddress: W,
    })))).toEqual({ walletAddress: W });
  });

  it("clears raw hex and rejects PK-shaped allowlist values", () => {
    const pk = `0x${"99".repeat(32)}`;
    expect(stripPrivateKeyFromToken(pk)).toBe("");
    expect(extractPrivateKeyFromToken(pk)).toBe(pk);
    expect(JSON.parse(stripPrivateKeyFromToken(JSON.stringify({
      PrivateKey: pk,
      walletAddress: W,
    })))).toEqual({ walletAddress: W });
    expect(stripPrivateKeyFromToken(JSON.stringify({ walletAddress: pk }))).toBe("{}");
    expect(JSON.parse(stripPrivateKeyFromToken(JSON.stringify({
      walletAddress: W,
      polyHeaders: { x: pk, POLY_ADDRESS: W },
      apiCreds: { apiKey: "a", secret: "b", passphrase: "c" },
    })))).toEqual({
      walletAddress: W,
      apiCreds: { apiKey: "a", secret: "b", passphrase: "c" },
    });
    expect(JSON.parse(stripPrivateKeyFromToken(JSON.stringify({
      walletAddress: W,
      signatureType: pk,
    })))).toEqual({ walletAddress: W });
  });

  it("merges privateKey back onto allowlisted base", () => {
    const base = JSON.stringify({ funder: F, walletAddress: W });
    const merged = mergePrivateKeyIntoToken(base, `0x${"22".repeat(32)}`);
    expect(extractPrivateKeyFromToken(merged)).toBe(`0x${"22".repeat(32)}`);
    expect(JSON.parse(merged).funder).toBe(F);
  });
});

describe("pmVault crypto", () => {
  it("encrypt/decrypt roundtrip with verifier", async () => {
    const salt = randomBytes(16);
    const kek = await deriveKek("test-password-123", salt, 10_000);
    const blob = await encryptUtf8(kek, `0x${"ab".repeat(32)}`);
    expect(await decryptUtf8(kek, blob)).toBe(`0x${"ab".repeat(32)}`);
    const verifier = await createVerifier(kek);
    expect(await verifyKek(kek, verifier)).toBe(true);
    const wrong = await deriveKek("wrong-password", salt, 10_000);
    expect(await verifyKek(wrong, verifier)).toBe(false);
    expect(base64ToBytes(bytesToBase64(salt))).toEqual(salt);
  });
});
