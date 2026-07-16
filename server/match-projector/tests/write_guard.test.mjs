import assert from "node:assert/strict";
import fs from "node:fs";
import { afterEach, describe, it } from "vitest";
import {
  HEARTBEAT_PATH,
  clearMatcherHeartbeat,
  writeMatcherHeartbeat,
} from "../../matcher/lib/heartbeat.js";
import { assertProjectorMayWrite } from "../lib/write_guard.js";

const prevForce = process.env.MATCH_PROJECTOR_FORCE_WRITE;

afterEach(() => {
  clearMatcherHeartbeat();
  if (prevForce === undefined)
    delete process.env.MATCH_PROJECTOR_FORCE_WRITE;
  else
    process.env.MATCH_PROJECTOR_FORCE_WRITE = prevForce;
});

describe("assertProjectorMayWrite", () => {
  it("allows write when no heartbeat", () => {
    clearMatcherHeartbeat();
    delete process.env.MATCH_PROJECTOR_FORCE_WRITE;
    assert.equal(assertProjectorMayWrite().ok, true);
  });

  it("blocks when matcher heartbeat is fresh", () => {
    delete process.env.MATCH_PROJECTOR_FORCE_WRITE;
    writeMatcherHeartbeat({
      matchCount: 1,
      intervalMs: 60_000,
      builtAt: Date.now(),
      pid: process.pid,
    });
    const g = assertProjectorMayWrite();
    assert.equal(g.ok, false);
    assert.match(g.reason, /心跳/);
  });

  it("allows with FORCE_WRITE=1 even if heartbeat alive", () => {
    writeMatcherHeartbeat({
      matchCount: 1,
      intervalMs: 60_000,
      builtAt: Date.now(),
      pid: process.pid,
    });
    process.env.MATCH_PROJECTOR_FORCE_WRITE = "1";
    assert.equal(assertProjectorMayWrite().ok, true);
  });

  it("allows when heartbeat is stale", () => {
    delete process.env.MATCH_PROJECTOR_FORCE_WRITE;
    fs.writeFileSync(HEARTBEAT_PATH, JSON.stringify({
      pid: process.pid,
      lastRun: Date.now() - 10 * 60_000,
      intervalMs: 30_000,
    }));
    assert.equal(assertProjectorMayWrite().ok, true);
  });
});
