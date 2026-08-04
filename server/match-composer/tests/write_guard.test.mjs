import assert from "node:assert/strict";
import fs from "node:fs";
import { afterEach, beforeEach, describe, it } from "vitest";
import {
  isPidAlive,
  HEARTBEAT_PATH as MATCHER_HB,
} from "../../matcher/lib/heartbeat.js";
import { COMPOSER_HEARTBEAT_PATH } from "../lib/heartbeat.js";
import { assertComposerMayWrite } from "../lib/write_guard.js";

/** 找一个仍存活且 ≠ 本进程的 pid（sanitize 会清掉已死 pid） */
function resolveLiveOtherPid() {
  const candidates = [
    Number(process.ppid) || 0,
    process.platform === "win32" ? 4 : 1,
  ];
  for (const pid of candidates) {
    if (pid > 0 && pid !== process.pid && isPidAlive(pid))
      return pid;
  }
  return null;
}

const liveOtherPid = resolveLiveOtherPid();

function clearHbFiles() {
  delete process.env.MATCH_COMPOSER_FORCE_WRITE;
  delete process.env.MATCH_COMPOSER_ALLOW_MULTI;
  for (const p of [COMPOSER_HEARTBEAT_PATH, MATCHER_HB]) {
    try {
      if (fs.existsSync(p))
        fs.unlinkSync(p);
    }
    catch { /* */ }
  }
}

beforeEach(clearHbFiles);
afterEach(clearHbFiles);

describe("write_guard", () => {
  it("blocks independent WRITE while embedded composer is canonical", () => {
    const g = assertComposerMayWrite();
    assert.equal(g.ok, false);
    assert.match(g.reason, /内嵌 composer/);
  });

  it("viaMatcherWriter is allowed for the embedded writer", () => {
    fs.writeFileSync(MATCHER_HB, JSON.stringify({
      mode: "embedded",
      lastRun: Date.now(),
      intervalMs: 30_000,
      pid: process.pid,
      matchCount: 1,
    }));
    assert.equal(assertComposerMayWrite({ skipMatcherHeartbeat: true }).ok, true);
  });

  it.skipIf(!liveOtherPid)("viaMatcherWriter still blocked by other live composer WRITE", () => {
    fs.writeFileSync(COMPOSER_HEARTBEAT_PATH, JSON.stringify({
      mode: "composer",
      wrote: true,
      lastRun: Date.now(),
      pid: liveOtherPid,
    }));
    const g = assertComposerMayWrite({ skipMatcherHeartbeat: true });
    assert.equal(g.ok, false);
    assert.match(g.reason, /composer WRITE/i);
  });

  it("dead composer WRITE pid does not block", () => {
    fs.writeFileSync(COMPOSER_HEARTBEAT_PATH, JSON.stringify({
      mode: "composer",
      wrote: true,
      lastRun: Date.now(),
      pid: process.pid + 12345,
    }));
    assert.equal(assertComposerMayWrite({ skipMatcherHeartbeat: true }).ok, true);
    assert.equal(fs.existsSync(COMPOSER_HEARTBEAT_PATH), false);
  });

  it("same pid composer HB does not block", () => {
    fs.writeFileSync(COMPOSER_HEARTBEAT_PATH, JSON.stringify({
      mode: "composer",
      wrote: true,
      lastRun: Date.now(),
      pid: process.pid,
    }));
    assert.equal(assertComposerMayWrite({ skipMatcherHeartbeat: true }).ok, true);
  });

  it.skipIf(!liveOtherPid)("viaMatcherWriter blocks other matcher pid", () => {
    fs.writeFileSync(MATCHER_HB, JSON.stringify({
      mode: "embedded",
      lastRun: Date.now(),
      intervalMs: 30_000,
      pid: liveOtherPid,
      matchCount: 1,
    }));
    const g = assertComposerMayWrite({ skipMatcherHeartbeat: true });
    assert.equal(g.ok, false);
    assert.match(g.reason, /另一 matcher/);
  });

  it("viaMatcherWriter allows same matcher pid", () => {
    fs.writeFileSync(MATCHER_HB, JSON.stringify({
      mode: "embedded",
      lastRun: Date.now(),
      intervalMs: 30_000,
      pid: process.pid,
      matchCount: 1,
    }));
    assert.equal(assertComposerMayWrite({ skipMatcherHeartbeat: true }).ok, true);
  });

  it("fORCE_WRITE bypasses", () => {
    process.env.MATCH_COMPOSER_FORCE_WRITE = "1";
    assert.equal(assertComposerMayWrite().ok, true);
  });
});
