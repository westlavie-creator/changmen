import assert from "node:assert/strict";
import fs from "node:fs";
import { afterEach, describe, it } from "vitest";
import {
  clearMatcherHeartbeat,
  HEARTBEAT_PATH,
  isPidAlive,
  isPanelProcessHeartbeat,
  readMatcherHeartbeat,
  sanitizeMatcherHeartbeat,
  writeMatcherHeartbeat,
} from "./heartbeat.js";

afterEach(() => {
  clearMatcherHeartbeat();
});

function resolveDeadPid() {
  for (let pid = process.pid + 10_000; pid < process.pid + 20_000; pid += 137) {
    if (!isPidAlive(pid))
      return pid;
  }
  return 999_999_999;
}

describe("sanitizeMatcherHeartbeat", () => {
  it("保留内嵌 matcher 心跳", () => {
    writeMatcherHeartbeat({ matchCount: 3, intervalMs: 30_000, pid: process.pid });
    assert.equal(isPanelProcessHeartbeat(), false);
    assert.equal(sanitizeMatcherHeartbeat(readMatcherHeartbeat())?.mode, "embedded");
    assert.equal(fs.existsSync(HEARTBEAT_PATH), true);
  });

  it("丢弃已不存在进程的心跳", () => {
    writeMatcherHeartbeat({ matchCount: 5, intervalMs: 30_000, pid: resolveDeadPid() });
    assert.equal(sanitizeMatcherHeartbeat(readMatcherHeartbeat()), null);
    assert.equal(fs.existsSync(HEARTBEAT_PATH), false);
  });
});
