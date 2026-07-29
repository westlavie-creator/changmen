import assert from "node:assert/strict";
import fs from "node:fs";
import { afterEach, beforeEach, describe, it } from "vitest";
import {
  HEARTBEAT_PATH,
  clearMatcherHeartbeat,
  writeMatcherHeartbeat,
} from "../../matcher/lib/heartbeat.js";
import { assertProjectorMayWrite } from "../lib/write_guard.js";

const prevForce = process.env.MATCH_PROJECTOR_FORCE_WRITE;
const prevWriter = process.env.MATCHER_WRITER;

beforeEach(() => {
  // 旧「仅挡 matcher HB」测例依赖 legacy writer；composer 为生产默认会直接拒独立 projector
  process.env.MATCHER_WRITER = "legacy";
  delete process.env.MATCH_PROJECTOR_FORCE_WRITE;
  clearMatcherHeartbeat();
});

afterEach(() => {
  clearMatcherHeartbeat();
  if (prevForce === undefined)
    delete process.env.MATCH_PROJECTOR_FORCE_WRITE;
  else
    process.env.MATCH_PROJECTOR_FORCE_WRITE = prevForce;
  if (prevWriter === undefined)
    delete process.env.MATCHER_WRITER;
  else
    process.env.MATCHER_WRITER = prevWriter;
});

describe("assertProjectorMayWrite", () => {
  it("blocks when MATCHER_WRITER=composer", () => {
    process.env.MATCHER_WRITER = "composer";
    clearMatcherHeartbeat();
    const g = assertProjectorMayWrite();
    assert.equal(g.ok, false);
    assert.match(g.reason, /MATCHER_WRITER=composer/);
  });

  it("allows write when no heartbeat under legacy writer", () => {
    clearMatcherHeartbeat();
    assert.equal(assertProjectorMayWrite().ok, true);
  });

  it("blocks when matcher heartbeat is fresh", () => {
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

  it("allows with FORCE_WRITE=1 even if composer writer", () => {
    process.env.MATCHER_WRITER = "composer";
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
    fs.writeFileSync(HEARTBEAT_PATH, JSON.stringify({
      pid: process.pid,
      lastRun: Date.now() - 10 * 60_000,
      intervalMs: 30_000,
    }));
    assert.equal(assertProjectorMayWrite().ok, true);
  });
});
