import { afterEach, describe, expect, it } from "vitest";
import {
  applyCorsHeaders,
  getCorsAllowedOrigins,
  resolveCorsAllowOrigin,
  tryHandleCorsPreflight,
} from "./cors.js";

function mockReq(headers = {}, method = "GET") {
  return { headers, method };
}

function mockRes() {
  /** @type {Record<string, string>} */
  const headers = {};
  let status = 0;
  let ended = false;
  return {
    headers,
    get statusCode() {
      return status;
    },
    get ended() {
      return ended;
    },
    setHeader(k, v) {
      headers[String(k).toLowerCase()] = String(v);
    },
    writeHead(code) {
      status = code;
    },
    end() {
      ended = true;
    },
  };
}

describe("cors", () => {
  const prev = process.env.CORS_ALLOWED_ORIGINS;
  afterEach(() => {
    if (prev === undefined)
      delete process.env.CORS_ALLOWED_ORIGINS;
    else
      process.env.CORS_ALLOWED_ORIGINS = prev;
  });

  it("defaults allow changmen.fun and www", () => {
    delete process.env.CORS_ALLOWED_ORIGINS;
    const set = getCorsAllowedOrigins();
    expect(set.has("https://changmen.fun")).toBe(true);
    expect(set.has("https://www.changmen.fun")).toBe(true);
    expect(set.has("https://evil.example")).toBe(false);
  });

  it("resolveCorsAllowOrigin echoes allowlisted Origin", () => {
    delete process.env.CORS_ALLOWED_ORIGINS;
    expect(
      resolveCorsAllowOrigin(mockReq({ origin: "https://changmen.fun" })),
    ).toBe("https://changmen.fun");
    expect(resolveCorsAllowOrigin(mockReq({ origin: "https://evil.example" }))).toBe(null);
    expect(resolveCorsAllowOrigin(mockReq({}))).toBe(null);
  });

  it("applyCorsHeaders sets ACAO + credentials", () => {
    delete process.env.CORS_ALLOWED_ORIGINS;
    const res = mockRes();
    expect(applyCorsHeaders(mockReq({ origin: "https://changmen.fun" }), res)).toBe(true);
    expect(res.headers["access-control-allow-origin"]).toBe("https://changmen.fun");
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
    expect(res.headers["access-control-allow-headers"] || "").toMatch(/token/i);
  });

  it("preflight 204 for allowlisted Origin", () => {
    delete process.env.CORS_ALLOWED_ORIGINS;
    const res = mockRes();
    expect(
      tryHandleCorsPreflight(mockReq({ origin: "https://www.changmen.fun" }, "OPTIONS"), res),
    ).toBe(true);
    expect(res.statusCode).toBe(204);
    expect(res.ended).toBe(true);
  });

  it("preflight 403 for unknown Origin", () => {
    delete process.env.CORS_ALLOWED_ORIGINS;
    const res = mockRes();
    expect(
      tryHandleCorsPreflight(mockReq({ origin: "https://evil.example" }, "OPTIONS"), res),
    ).toBe(true);
    expect(res.statusCode).toBe(403);
  });

  it("CORS_ALLOWED_ORIGINS overrides defaults", () => {
    process.env.CORS_ALLOWED_ORIGINS = "https://staging.example,http://localhost:5174";
    expect(getCorsAllowedOrigins().has("https://changmen.fun")).toBe(false);
    expect(
      resolveCorsAllowOrigin(mockReq({ origin: "http://localhost:5174" })),
    ).toBe("http://localhost:5174");
  });
});
