import { existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** 构建前清空 dist，避免 prebuild 只删 assets 后构建中断，留下「有 index.html、无 JS」的白屏状态。 */
const distDir = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");

if (existsSync(distDir)) {
  rmSync(distDir, { recursive: true, force: true });
  console.log("[prebuild] removed dist/");
}
