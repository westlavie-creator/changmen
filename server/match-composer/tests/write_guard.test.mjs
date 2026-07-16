import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, it } from "vitest";
import { HEARTBEAT_PATH as MATCHER_HB } from "../../matcher/lib/heartbeat.js";
import { COMPOSER_HEARTBEAT_PATH } from "../lib/heartbeat.js";
import { assertComposerMayWrite } from "../lib/write_guard.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECTOR_HB = path.join(__dirname, "../../match-projector/.projector-heartbeat.json");

function clearHbFiles() {
  delete process.env.MATCH_COMPOSER_FORCE_WRITE;
  delete process.env.MATCH_COMPOSER_ALLOW_MULTI;
  for (const p of [PROJECTOR_HB, COMPOSER_HEARTBEAT_PATH, MATCHER_HB]) {
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
  it("blocks when projector WRITE heartbeat active", () => {
    // 同 pid matcher HB：模拟 viaMatcherWriter 本进程，避免误撞其它存活 matcher
    fs.writeFileSync(MATCHER_HB, JSON.stringify({
      mode: "embedded",
      lastRun: Date.now(),
      intervalMs: 30_000,
      pid: process.pid,
      matchCount: 1,
    }));
    fs.writeFileSync(PROJECTOR_HB, JSON.stringify({
      mode: "projector",
      wrote: true,
      lastRun: Date.now(),
      pid: 99999,
    }));
    const g = assertComposerMayWrite({ skipMatcherHeartbeat: true });
    assert.equal(g.ok, false);
    assert.match(g.reason, /projector/i);
  });

  it("viaMatcherWriter still blocked by other composer WRITE", () => {
    fs.writeFileSync(COMPOSER_HEARTBEAT_PATH, JSON.stringify({
      mode: "composer",
      wrote: true,
      lastRun: Date.now(),
      pid: process.pid + 12345,
    }));
    const g = assertComposerMayWrite({ skipMatcherHeartbeat: true });
    assert.equal(g.ok, false);
    assert.match(g.reason, /composer WRITE/i);
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

  it("viaMatcherWriter blocks other matcher pid", () => {
    const otherPid = process.ppid && process.ppid !== process.pid
      ? process.ppid
      : null;
    if (!otherPid) {
      // 无可用存活异 pid 时跳过（sanitize 会清掉已死 pid）
      return;
    }
    fs.writeFileSync(MATCHER_HB, JSON.stringify({
      mode: "embedded",
      lastRun: Date.now(),
      intervalMs: 30_000,
      pid: otherPid,
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

  it("FORCE_WRITE bypasses", () => {
    process.env.MATCH_COMPOSER_FORCE_WRITE = "1";
    fs.writeFileSync(PROJECTOR_HB, JSON.stringify({
      mode: "projector",
      wrote: true,
      lastRun: Date.now(),
    }));
    assert.equal(assertComposerMayWrite().ok, true);
  });
});
