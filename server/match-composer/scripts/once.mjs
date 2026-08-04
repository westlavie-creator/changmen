#!/usr/bin/env node
import { isComposerWriteEnabled } from "../lib/config.js";
import { assertComposerMayWrite } from "../lib/write_guard.js";
import { composeOnce } from "../ops/compose_once.js";
/**
 * 独立 once：默认 dry-run。
 * --write 会被 write_guard 拒绝；应急须显式 MATCH_COMPOSER_FORCE_WRITE=1。
 */
import "../lib/env.js";

const write = process.argv.includes("--write") || isComposerWriteEnabled();
if (write) {
  const guard = assertComposerMayWrite();
  if (!guard.ok) {
    console.error(`[match-composer] ${guard.reason}`);
    console.error(
      "[match-composer] 提示：生产写路径已是 esport 内嵌 composer；"
      + "独立 --write 仅可在停掉 esport 后以 MATCH_COMPOSER_FORCE_WRITE=1 应急执行。",
    );
    process.exit(1);
  }
}

const result = await composeOnce({ write, registerTeams: !process.argv.includes("--no-teams") });
console.log(JSON.stringify({
  matchCount: result.matchCount,
  wrote: result.wrote,
  projectStats: result.projectStats,
  builtAt: result.builtAt,
}, null, 2));
