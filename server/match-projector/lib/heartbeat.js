import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PROJECTOR_HEARTBEAT_PATH = path.join(__dirname, "..", ".projector-heartbeat.json");

export function writeProjectorHeartbeat({ matchCount, intervalMs, builtAt, pid = process.pid, wrote = false }) {
  const payload = {
    pid,
    mode: "projector",
    lastRun: Date.now(),
    intervalMs: intervalMs || 30_000,
    matchCount: matchCount ?? null,
    builtAt: builtAt ?? null,
    wrote: !!wrote,
  };
  fs.writeFileSync(PROJECTOR_HEARTBEAT_PATH, JSON.stringify(payload));
}

export function clearProjectorHeartbeat() {
  try {
    if (fs.existsSync(PROJECTOR_HEARTBEAT_PATH))
      fs.unlinkSync(PROJECTOR_HEARTBEAT_PATH);
  }
  catch {
    /* best effort */
  }
}
