/**
 * 统一加载 matcher 环境变量：matcher/.env → apps/backend/.env
 * 须在 import packages/shared/db 之前执行。
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const MATCHER_ROOT = path.join(__dirname, "..");

const envCandidates = [
  path.join(MATCHER_ROOT, ".env"),
  path.join(MATCHER_ROOT, "../backend/.env"),
];
for (const envPath of envCandidates) {
  dotenv.config({ path: envPath });
  if (
    process.env.SUPABASE_URL ||
    process.env.DATABASE_URL ||
    process.env.DATABASE_URL_PUBLIC ||
    process.env.DATABASE_URL_INTERNAL
  ) {
    break;
  }
}
