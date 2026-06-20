/**
 * Value-bet 引擎主进程 — 定时扫描 client_matches，输出正 EV 信号。
 */

import "./lib/env.js";
import { SCAN_INTERVAL_MS, SHARP_PLATFORM, SOFT_PLATFORMS, MIN_EDGE, MAX_SIGNAL_AGE_MS, KELLY_MULTIPLIER } from "./lib/config.js";
import { scanOnce } from "./engine/scanner.js";
import { upsertSignals, expireStaleSignals } from "./db/signal_store.js";
import { formatSignalTable } from "./lib/format.js";

let scanCount = 0;
let totalSignals = 0;
let dbAvailable = false;

function toDbRow(ms) {
  const sig = ms.signal;
  return {
    matchId: ms.matchId,
    matchTitle: ms.title,
    game: ms.game,
    startTime: ms.startTime,
    betName: ms.betName,
    map: ms.map,
    homeName: ms.homeName,
    awayName: ms.awayName,
    sharpPlatform: SHARP_PLATFORM,
    sharpHome: sig.sharpHome,
    sharpAway: sig.sharpAway,
    overround: sig.overround,
    fairOdds: sig.fairOdds,
    softPlatform: sig.softPlatform,
    softSide: sig.side,
    softOdds: sig.softOdds,
    edge: sig.edge,
    kellyFull: sig.kellyFull,
    kellyFrac: sig.kellyFrac,
    trueProb: sig.trueProb,
  };
}

async function runOnce() {
  scanCount++;
  const signals = await scanOnce();
  totalSignals += signals.length;

  if (signals.length > 0) {
    console.log(`\n[value-bet] ── 扫描 #${scanCount} | ${new Date().toISOString()} ──`);
    console.log(`  发现 ${signals.length} 个正EV信号：\n`);
    console.log(formatSignalTable(signals));
    console.log();

    if (dbAvailable) {
      try {
        await upsertSignals(signals.map(toDbRow));
      } catch (err) {
        console.warn("[value-bet] DB 写入失败:", err.message);
      }
    }
  } else if (scanCount % 20 === 0) {
    console.log(
      `[value-bet] 扫描 #${scanCount} | ${new Date().toISOString()} | 无信号 | 累计 ${totalSignals}`,
    );
  }

  if (dbAvailable && scanCount % 40 === 0) {
    try {
      const expired = await expireStaleSignals(MAX_SIGNAL_AGE_MS);
      if (expired > 0) {
        console.log(`[value-bet] 过期 ${expired} 条信号`);
      }
    } catch {
      // 过期清理失败不影响主流程
    }
  }
}

async function checkDb() {
  try {
    const { getPgPool } = await import("@changmen/db");
    const pool = getPgPool();
    if (pool) {
      await pool.query("SELECT 1 FROM value_signals LIMIT 0");
      dbAvailable = true;
      console.log("[value-bet] DB 可用，信号将写入 value_signals 表");
    }
  } catch {
    dbAvailable = false;
    console.log("[value-bet] DB 不可用或 value_signals 表未创建，仅控制台输出");
  }
}

async function main() {
  console.log("[value-bet] 正EV价值投注引擎启动");
  console.log(`  基准线: ${SHARP_PLATFORM} | 目标平台: ${SOFT_PLATFORMS.join(",")}`);
  console.log(`  最小 edge: ${(MIN_EDGE * 100).toFixed(1)}% | Kelly 系数: ${KELLY_MULTIPLIER}x`);
  console.log(`  扫描间隔: ${SCAN_INTERVAL_MS / 1000}s\n`);

  await checkDb();
  await runOnce();

  setInterval(async () => {
    try {
      await runOnce();
    } catch (err) {
      console.error("[value-bet] 扫描错误:", err.message);
    }
  }, SCAN_INTERVAL_MS);
}

main().catch((err) => {
  console.error("[value-bet] fatal:", err);
  process.exit(1);
});
