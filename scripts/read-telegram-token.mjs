#!/usr/bin/env node
/** Read TELEGRAM_BOT_TOKEN from changmen/apps/backend/.env (no echo). */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(here, "../apps/backend/.env");
if (!fs.existsSync(envPath)) {
  console.error("missing", envPath);
  process.exit(1);
}
const text = fs.readFileSync(envPath, "utf8");
for (const line of text.split(/\r?\n/)) {
  const m = line.match(/^\s*TELEGRAM_BOT_TOKEN=(.+)$/);
  if (m) {
    const token = m[1].trim().replace(/^["']|["']$/g, "");
    if (!token) {
      console.error("TELEGRAM_BOT_TOKEN empty");
      process.exit(1);
    }
    process.stdout.write(token);
    process.exit(0);
  }
}
console.error("TELEGRAM_BOT_TOKEN not found in", envPath);
process.exit(1);
