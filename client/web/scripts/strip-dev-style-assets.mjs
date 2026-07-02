/**
 * 生产 dist 保留运行时所需静态资源：/assets/platform/（平台图标）等。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function rm(rel) {
  const p = path.join(webRoot, "dist", rel);
  if (fs.existsSync(p)) {
    fs.rmSync(p, { recursive: true, force: true });
  }
}

rm("copy");

console.log("[postbuild] trimmed dist assets -> assets/platform/");
