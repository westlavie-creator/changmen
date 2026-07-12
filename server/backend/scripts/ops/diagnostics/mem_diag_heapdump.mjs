#!/usr/bin/env node
/** POST /health/diag/heapdump on localhost backend */
const base = process.env.DIAG_BASE || "http://127.0.0.1:3456";

const res = await fetch(`${base}/health/diag/heapdump`, {
  method: "POST",
  signal: AbortSignal.timeout(120_000),
});
const body = await res.json();
console.log(JSON.stringify(body, null, 2));
if (!res.ok)
  process.exit(1);
