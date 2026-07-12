#!/usr/bin/env node
/**
 * 持续采样 GET /health/diag，写入 NDJSON（在 VPS 上跑）。
 *
 *   SAMPLE_MS=30000 SAMPLES=40 node scripts/mem_diag_watch.mjs
 *   OUT=/var/log/changmen-mem.ndjson node scripts/mem_diag_watch.mjs
 */
import fs from "node:fs";
import path from "node:path";

const base = process.env.DIAG_BASE || "http://127.0.0.1:3456";
const intervalMs = Number(process.env.SAMPLE_MS || 30_000);
const samples = Number(process.env.SAMPLES || 40);
const outPath = process.env.OUT || path.join("/tmp", "changmen-mem-diag.ndjson");

async function fetchDiag() {
  const res = await fetch(`${base}/health/diag`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok)
    throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const stream = fs.createWriteStream(outPath, { flags: "a" });
console.log(`[mem_diag_watch] append ${outPath} every ${intervalMs}ms × ${samples}`);

for (let i = 0; i < samples; i++) {
  const ts = new Date().toISOString();
  try {
    const row = await fetchDiag();
    stream.write(`${JSON.stringify(row)}\n`);
    const m = row.memory || {};
    console.log(
      `${ts} rss=${m.rssMb}MB heap=${m.heapUsedMb} nonHeap=${m.nonHeapMb}`
      + ` uptime=${row.uptimeSec}s api=${row.esportApi?.counter}`
      + ` wsActive=${row.wsForward?.activeTotal}`
      + ` rdsQ=${row.rdsWrite?.pending}`
      + ` heapData~${row.approxHeapDataMb}MB`,
    );
  }
  catch (err) {
    console.log(`${ts} ERROR ${err.message}`);
  }
  if (i + 1 < samples)
    await new Promise(r => setTimeout(r, intervalMs));
}

stream.end();
console.log("[mem_diag_watch] done");
