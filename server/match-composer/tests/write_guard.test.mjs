import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, it } from "vitest";
import {
  HEARTBEAT_PATH as MATCHER_HB,
  isPidAlive,
} from "../../matcher/lib/heartbeat.js";
import { COMPOSER_HEARTBEAT_PATH } from "../lib/heartbeat.js";
import { assertComposerMayWrite } from "../lib/write_guard.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECTOR_HB = path.join(__dirname, "../../match-projector/.projector-heartbeat.json");

const prevWriter = process.env.MATCHER_WRITER;

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
  // viaMatcherWriter 路径测例需要绕过「独立 loop 在 composer 默认下被拒」
  process.env.MATCHER_WRITER = "legacy";
  for (const p of [PROJECTOR_HB, COMPOSER_HEARTBEAT_PATH, MATCHER_HB]) {
    try {
      if (fs.existsSync(p))
        fs.unlinkSync(p);
    }
    catch { /* */ }
  }
}

function restoreWriter() {
  if (prevWriter === undefined)
    delete process.env.MATCHER_WRITER;
  else
    process.env.MATCHER_WRITER = prevWriter;
}

beforeEach(clearHbFiles);
afterEach(() => {
  clearHbFiles();
  restoreWriter();
});

describe("write_guard", () => {
  it("blocks independent WRITE when MATCHER_WRITER=composer", () => {
    process.env.MATCHER_WRITER = "composer";
    const g = assertComposerMayWrite();
    assert.equal(g.ok, false);
    assert.match(g.reason, /内嵌 composer|MATCHER_WRITER=composer/);
  });

  it("viaMatcherWriter allowed under MATCHER_WRITER=composer", () => {
    process.env.MATCHER_WRITER = "composer";
    fs.writeFileSync(MATCHER_HB, JSON.stringify({
      mode: "embedded",
      lastRun: Date.now(),
      intervalMs: 30_000,
      pid: process.pid,
      matchCount: 1,
    }));
    assert.equal(assertComposerMayWrite({ skipMatcherHeartbeat: true }).ok, true);
  });

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

  it("FORCE_WRITE bypasses", () => {
    process.env.MATCH_COMPOSER_FORCE_WRITE = "1";
    process.env.MATCHER_WRITER = "composer";
    fs.writeFileSync(PROJECTOR_HB, JSON.stringify({
      mode: "projector",
      wrote: true,
      lastRun: Date.now(),
    }));
    assert.equal(assertComposerMayWrite().ok, true);
  });
});
