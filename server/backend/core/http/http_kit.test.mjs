import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { readJsonBody, jsonResponse } from "./body.js";
import { compose } from "./compose.js";
import { seedRequestContext } from "./context.js";
import { catchErrors, sendUnhandledError } from "./errors.js";

function mockReq(overrides = {}) {
  return {
    url: "/api/games?x=1",
    method: "GET",
    headers: {},
    ...overrides,
  };
}

function mockRes() {
  return {
    headersSent: false,
    writableEnded: false,
    statusCode: 0,
    body: null,
    writeHead(status, _headers) {
      this.statusCode = status;
      this.headersSent = true;
    },
    end(payload) {
      this.body = payload;
      this.writableEnded = true;
    },
  };
}

describe("compose", () => {
  it("runs middlewares in order", async () => {
    const order = [];
    const run = compose(
      async (_req, _res, next) => {
        order.push("a");
        await next();
        order.push("a-after");
      },
      async (_req, _res, next) => {
        order.push("b");
        await next();
      },
      async () => {
        order.push("handler");
      },
    );
    await run(mockReq(), mockRes());
    expect(order).toEqual(["a", "b", "handler", "a-after"]);
  });

  it("rejects double next()", async () => {
    const run = compose(async (_req, _res, next) => {
      await next();
      await next();
    });
    await expect(run(mockReq(), mockRes())).rejects.toThrow(/multiple times/);
  });
});

describe("seedRequestContext", () => {
  it("parses pathname and generates reqId", () => {
    const req = mockReq();
    seedRequestContext(req);
    expect(req.pathname).toBe("/api/games");
    expect(req.reqId).toMatch(/^[0-9a-f]+$/i);
  });

  it("reuses x-request-id when present", () => {
    const req = mockReq({ headers: { "x-request-id": "abc-123" } });
    seedRequestContext(req);
    expect(req.reqId).toBe("abc-123");
  });
});

describe("body", () => {
  it("jsonResponse writes JSON envelope", () => {
    const res = mockRes();
    jsonResponse(res, 200, { ok: true });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true });
  });

  it("readJsonBody parses payload", async () => {
    const req = new EventEmitter();
    const p = readJsonBody(req);
    req.emit("data", Buffer.from('{"a":1}'));
    req.emit("end");
    await expect(p).resolves.toEqual({ a: 1 });
  });

  it("readJsonBody rejects invalid JSON", async () => {
    const req = new EventEmitter();
    const p = readJsonBody(req);
    req.emit("data", Buffer.from("{"));
    req.emit("end");
    await expect(p).rejects.toThrow(/invalid JSON/);
  });
});

describe("catchErrors", () => {
  it("converts throw into A8-shaped JSON when headers not sent", async () => {
    const req = mockReq();
    seedRequestContext(req);
    const res = mockRes();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const run = compose(
      catchErrors,
      async () => {
        throw new Error("boom");
      },
    );
    await run(req, res);
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body)).toEqual({
      success: 0,
      msg: "boom",
      info: null,
    });
    spy.mockRestore();
  });

  it("sendUnhandledError does not rewrite when headersSent", () => {
    const req = mockReq();
    const res = mockRes();
    res.headersSent = true;
    res.statusCode = 502;
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    sendUnhandledError(req, res, new Error("after proxy"));
    expect(res.statusCode).toBe(502);
    expect(res.body).toBeNull();
    spy.mockRestore();
  });
});

describe("withTiming", () => {
  it("waits for finish when headersSent but body still streaming", async () => {
    const { withTiming } = await import("./timing.js");
    const req = mockReq({ method: "GET", url: "/slow-static" });
    seedRequestContext(req);
    const res = mockRes();
    // EventEmitter-like once/on for finish
    const listeners = { finish: [], close: [] };
    res.once = (ev, fn) => {
      listeners[ev]?.push(fn);
      return res;
    };
    res.on = res.once;

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const run = compose(
      withTiming,
      async (_req, response) => {
        response.headersSent = true;
        response.writableEnded = false;
        // simulate delayed stream end
        setTimeout(() => {
          response.writableEnded = true;
          for (const fn of listeners.finish)
            fn();
        }, 550);
      },
    );
    await run(req, res);
    expect(warn).not.toHaveBeenCalled();
    await new Promise(r => setTimeout(r, 600));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toMatch(/slow .* GET \/slow-static/);
    warn.mockRestore();
  });
});
