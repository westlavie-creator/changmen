/**
 * 加载环境变量：value-bet/.env → server/backend/.env
 * 须在 import @changmen/db 之前执行。
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const VALUE_BET_ROOT = path.join(__dirname, "..");

const envCandidates = [
  path.join(VALUE_BET_ROOT, ".env"),
  path.join(VALUE_BET_ROOT, "../backend/.env"),
];
for (const envPath of envCandidates) {
  dotenv.config({ path: envPath });
  if (
    process.env.DATABASE_URL ||
    process.env.DATABASE_URL_PUBLIC ||
    process.env.DATABASE_URL_INTERNAL
  ) {
    break;
  }
}
