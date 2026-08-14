import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
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
    assert.equal(set.has("https://changmen.fun"), true);
    assert.equal(set.has("https://www.changmen.fun"), true);
    assert.equal(set.has("https://evil.example"), false);
  });

  it("resolveCorsAllowOrigin echoes allowlisted Origin", () => {
    delete process.env.CORS_ALLOWED_ORIGINS;
    assert.equal(
      resolveCorsAllowOrigin(mockReq({ origin: "https://changmen.fun" })),
      "https://changmen.fun",
    );
    assert.equal(
      resolveCorsAllowOrigin(mockReq({ origin: "https://evil.example" })),
      null,
    );
    assert.equal(resolveCorsAllowOrigin(mockReq({})), null);
  });

  it("applyCorsHeaders sets ACAO + credentials", () => {
    delete process.env.CORS_ALLOWED_ORIGINS;
    const res = mockRes();
    assert.equal(applyCorsHeaders(mockReq({ origin: "https://changmen.fun" }), res), true);
    assert.equal(res.headers["access-control-allow-origin"], "https://changmen.fun");
    assert.equal(res.headers["access-control-allow-credentials"], "true");
    assert.match(res.headers["access-control-allow-headers"] || "", /token/i);
  });

  it("preflight 204 for allowlisted Origin", () => {
    delete process.env.CORS_ALLOWED_ORIGINS;
    const res = mockRes();
    assert.equal(
      tryHandleCorsPreflight(mockReq({ origin: "https://www.changmen.fun" }, "OPTIONS"), res),
      true,
    );
    assert.equal(res.statusCode, 204);
    assert.equal(res.ended, true);
  });

  it("preflight 403 for unknown Origin", () => {
    delete process.env.CORS_ALLOWED_ORIGINS;
    const res = mockRes();
    assert.equal(
      tryHandleCorsPreflight(mockReq({ origin: "https://evil.example" }, "OPTIONS"), res),
      true,
    );
    assert.equal(res.statusCode, 403);
  });

  it("CORS_ALLOWED_ORIGINS overrides defaults", () => {
    process.env.CORS_ALLOWED_ORIGINS = "https://staging.example,http://localhost:5174";
    assert.equal(getCorsAllowedOrigins().has("https://changmen.fun"), false);
    assert.equal(
      resolveCorsAllowOrigin(mockReq({ origin: "http://localhost:5174" })),
      "http://localhost:5174",
    );
  });
});
