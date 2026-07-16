/**
 * match-projector 环境：本目录 .env → server/backend/.env
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PROJECTOR_ROOT = path.join(__dirname, "..");

const envCandidates = [
  path.join(PROJECTOR_ROOT, ".env"),
  path.join(PROJECTOR_ROOT, "../backend/.env"),
];
for (const envPath of envCandidates) {
  dotenv.config({ path: envPath });
  if (
    process.env.DATABASE_URL
    || process.env.DATABASE_URL_PUBLIC
    || process.env.DATABASE_URL_INTERNAL
  ) {
    break;
  }
}
