#!/usr/bin/env node
/**
 * 单次扫描 — 不进入循环，输出当前所有正EV信号后退出。
 * 用法：cd changmen/server/value-bet && node scripts/scan-once.mjs
 */

import "../lib/env.js";
import { scanOnce } from "../engine/scanner.js";
import { formatSignalTable } from "../lib/format.js";
import { SHARP_PLATFORM, SOFT_PLATFORMS, MIN_EDGE } from "../lib/config.js";

console.log(`[scan-once] 基准: ${SHARP_PLATFORM} | 目标: ${SOFT_PLATFORMS.join(",")} | 最小edge: ${(MIN_EDGE * 100).toFixed(1)}%\n`);

const signals = await scanOnce();

if (signals.length === 0) {
  console.log("未发现正EV信号。可能原因：");
  console.log("  - PB 未上线 / 未采集");
  console.log("  - 当前无比赛");
  console.log("  - edge 低于阈值");
} else {
  console.log(`发现 ${signals.length} 个正EV信号：\n`);
  console.log(formatSignalTable(signals));
}

console.log();
process.exit(0);
