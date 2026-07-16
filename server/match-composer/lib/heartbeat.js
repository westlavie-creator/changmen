import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const COMPOSER_HEARTBEAT_PATH = path.join(__dirname, "..", ".composer-heartbeat.json");

export function writeComposerHeartbeat({
  matchCount,
  intervalMs,
  builtAt,
  pid = process.pid,
  wrote = false,
}) {
  fs.writeFileSync(COMPOSER_HEARTBEAT_PATH, JSON.stringify({
    pid,
    mode: "composer",
    lastRun: Date.now(),
    intervalMs: intervalMs || 30_000,
    matchCount: matchCount ?? null,
    builtAt: builtAt ?? null,
    wrote: !!wrote,
  }));
}

export function clearComposerHeartbeat() {
  try {
    if (fs.existsSync(COMPOSER_HEARTBEAT_PATH))
      fs.unlinkSync(COMPOSER_HEARTBEAT_PATH);
  }
  catch { /* best effort */ }
}
