#!/usr/bin/env node
/**
 * 分析 mem_diag_watch 输出的 NDJSON，计算 RSS 增速与各字段相关性。
 *
 *   node scripts/mem_diag_report.mjs /tmp/changmen-mem-diag.ndjson
 */
import fs from "node:fs";

const file = process.argv[2] || "/tmp/changmen-mem-diag.ndjson";
if (!fs.existsSync(file)) {
  console.error("missing file:", file);
  process.exit(1);
}

const rows = fs.readFileSync(file, "utf8")
  .trim()
  .split("\n")
  .filter(Boolean)
  .map(line => JSON.parse(line));

if (rows.length < 2) {
  console.log("need >= 2 samples");
  process.exit(0);
}

const first = rows[0];
const last = rows[rows.length - 1];
const dtSec = (last.at - first.at) / 1000;
const dRss = (last.memory?.rssMb ?? 0) - (first.memory?.rssMb ?? 0);
const dHeap = (last.memory?.heapUsedMb ?? 0) - (first.memory?.heapUsedMb ?? 0);
const dNonHeap = (last.memory?.nonHeapMb ?? 0) - (first.memory?.nonHeapMb ?? 0);
const dApi = (last.esportApi?.counter ?? 0) - (first.esportApi?.counter ?? 0);

console.log("=== Memory growth report ===");
console.log(`samples: ${rows.length}`);
console.log(`span: ${Math.round(dtSec)}s (${(dtSec / 60).toFixed(1)} min)`);
console.log(`RSS: ${first.memory?.rssMb} → ${last.memory?.rssMb} MB  (Δ ${dRss} MB, ${(dRss / dtSec * 60).toFixed(1)} MB/min)`);
console.log(`Heap: ${first.memory?.heapUsedMb} → ${last.memory?.heapUsedMb} MB  (Δ ${dHeap} MB)`);
console.log(`Non-heap: ${first.memory?.nonHeapMb} → ${last.memory?.nonHeapMb} MB  (Δ ${dNonHeap} MB)`);
console.log(`API counter: +${dApi} (${(dApi / dtSec).toFixed(2)}/s)`);
console.log(`WS active: ${first.wsForward?.activeTotal} → ${last.wsForward?.activeTotal}`);
console.log(`RDS write queue: ${first.rdsWrite?.pending} → ${last.rdsWrite?.pending} (max pending ${Math.max(...rows.map(r => r.rdsWrite?.pending ?? 0))})`);
console.log(`approxHeapDataMb: ${first.approxHeapDataMb} → ${last.approxHeapDataMb}`);
console.log(`clientMatches: ${first.dbCache?.clientMatches} → ${last.dbCache?.clientMatches}`);
console.log(`betKeys: ${first.collector?.betKeys} → ${last.collector?.betKeys}`);

const peak = rows.reduce((best, r) => (
  (r.memory?.rssMb ?? 0) > (best.memory?.rssMb ?? 0) ? r : best
), rows[0]);
console.log(`peak RSS: ${peak.memory?.rssMb} MB at uptime ${peak.uptimeSec}s`);

if (dRss > 0 && dtSec > 0) {
  const etaMin = (2048 - (last.memory?.rssMb ?? 0)) / (dRss / dtSec * 60);
  if (etaMin > 0 && etaMin < 1000)
    console.log(`ETA to 2GB RSS (linear): ~${etaMin.toFixed(0)} min`);
}

console.log("\n=== Top API (last sample) ===");
for (const x of last.esportApi?.topByCount || [])
  console.log(`  ${x.action}: ${x.count} max=${x.maxMs}ms avg=${x.avgMs}ms`);
