import assert from "node:assert/strict";
import fs from "node:fs";
import { afterEach, describe, it } from "vitest";
import {
  clearMatcherHeartbeat,
  HEARTBEAT_PATH,
  isPanelProcessHeartbeat,
  readMatcherHeartbeat,
  sanitizeMatcherHeartbeat,
  writeMatcherHeartbeat,
} from "./heartbeat.js";

afterEach(() => {
  clearMatcherHeartbeat();
});

describe("sanitizeMatcherHeartbeat", () => {
  it("丢弃面板进程误写的心跳", () => {
    writeMatcherHeartbeat({ matchCount: 3, intervalMs: 30_000, pid: process.pid });
    assert.equal(isPanelProcessHeartbeat(readMatcherHeartbeat()), true);
    assert.equal(sanitizeMatcherHeartbeat(readMatcherHeartbeat()), null);
    assert.equal(fs.existsSync(HEARTBEAT_PATH), false);
  });

  it("丢弃已不存在进程的心跳", () => {
    writeMatcherHeartbeat({ matchCount: 5, intervalMs: 30_000, pid: process.pid + 10_000 });
    assert.equal(sanitizeMatcherHeartbeat(readMatcherHeartbeat()), null);
    assert.equal(fs.existsSync(HEARTBEAT_PATH), false);
  });
});
