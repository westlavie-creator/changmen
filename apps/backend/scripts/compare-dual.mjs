#!/usr/bin/env node
/**
 * dual 对账：Supabase vs RDS 各表行数
 *
 *   cd changmen/apps/backend && node scripts/compare-dual.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import {
  compareDualRowCounts,
  formatCompareDualReport,
} from "../../../packages/shared/db/compare_dual.js";
import { initDatabaseUrl } from "../../../packages/shared/db/resolve_database_url.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "..", ".env");
if (fs.existsSync(envPath)) dotenv.config({ path: envPath });

await initDatabaseUrl();

const result = await compareDualRowCounts();
if (!result) {
  console.log("[compare-dual] 非 dual 模式，跳过");
  process.exit(0);
}

for (const line of formatCompareDualReport(result)) {
  console.log(line);
}

if (!result.ok) process.exitCode = 1;
