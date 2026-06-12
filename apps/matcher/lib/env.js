/**
 * 统一加载 matcher 环境变量：本目录 .env → apps/backend/.env
 * 须在 import packages/shared/db 之前执行。
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const MATCHER_ROOT = path.join(__dirname, "..");

dotenv.config({ path: path.join(MATCHER_ROOT, ".env") });
if (!process.env.SUPABASE_URL) {
  dotenv.config({ path: path.join(MATCHER_ROOT, "../backend/.env") });
}
