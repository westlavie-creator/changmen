/**
 * 生产 dist 不含 public/copy（DEV 皮肤走查：segments / legacy / modules）。
 * 线上 `/` 使用 dist/assets 内 Vite 打包样式；/copy 已 redirect。
 */
import { existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const distCopy = join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "copy");

if (!existsSync(distCopy)) {
  console.log("[postbuild] dist/copy/ absent, skip");
  process.exit(0);
}

rmSync(distCopy, { recursive: true, force: true });
console.log("[postbuild] removed dist/copy/ (DEV skin lab only; deploy uses dist/assets/)");
