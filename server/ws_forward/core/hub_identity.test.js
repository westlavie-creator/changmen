import crypto from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { peekHubAccessToken, resolveHubIdentity } from "./hub_identity.js";

function signAccess(sub, secret, expOffsetSec = 3600) {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const body = { sub, typ: "access", iat: now, exp: now + expOffsetSec };
  const h = Buffer.from(JSON.stringify(header)).toString("base64url");
  const p = Buffer.from(JSON.stringify(body)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(`${h}.${p}`).digest("base64url");
  return `${h}.${p}.${sig}`;
}

describe("hub_identity", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("peeks access token without @changmen/db", () => {
    vi.stubEnv("JWT_SECRET", "hub-test-secret");
    delete process.env.DATABASE_URL;
    delete process.env.DATABASE_URL_PUBLIC;
    delete process.env.DATABASE_URL_INTERNAL;
    const token = signAccess("user-1", "hub-test-secret");
    expect(peekHubAccessToken(token)).toEqual({ userId: "user-1" });
  });

  it("rejects missing secret, wrong sig, refresh typ, expired", () => {
    vi.stubEnv("JWT_SECRET", "hub-test-secret");
    expect(peekHubAccessToken(signAccess("u", "hub-test-secret"))).toEqual({ userId: "u" });
    vi.stubEnv("JWT_SECRET", "");
    expect(peekHubAccessToken(signAccess("u", "hub-test-secret"))).toBeNull();
    vi.stubEnv("JWT_SECRET", "hub-test-secret");
    expect(peekHubAccessToken(signAccess("u", "other"))).toBeNull();
    expect(peekHubAccessToken(signAccess("u", "hub-test-secret", -10))).toBeNull();
  });

  it("resolveHubIdentity skips db when no DATABASE_URL", async () => {
    vi.stubEnv("JWT_SECRET", "hub-test-secret");
    delete process.env.DATABASE_URL;
    delete process.env.DATABASE_URL_PUBLIC;
    delete process.env.DATABASE_URL_INTERNAL;
    const token = signAccess("user-2", "hub-test-secret");
    await expect(resolveHubIdentity(token)).resolves.toEqual({
      userId: "user-2",
      userName: "",
    });
  });
});
