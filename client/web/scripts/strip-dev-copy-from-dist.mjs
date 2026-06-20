/**
 * 生产 dist 保留运行时皮肤切换所需 copy 资源：
 * - /copy/copy-chrome.css（右下角切换角标）
 * - /copy/styles/modules/changmen/（ep-chalk + 业务补丁）
 * 删除 legacy 与 A8 extract 分桶，减小部署体积。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const distCopy = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dist", "copy");

if (!fs.existsSync(distCopy)) {
  console.log("[postbuild] dist/copy/ absent, skip");
  process.exit(0);
}

function rm(rel) {
  const p = path.join(distCopy, rel);
  if (fs.existsSync(p)) {
    fs.rmSync(p, { recursive: true, force: true });
  }
}

rm("styles/legacy");
rm("styles/modules/segments");

const modulesDir = path.join(distCopy, "styles/modules");
if (fs.existsSync(modulesDir)) {
  for (const name of fs.readdirSync(modulesDir)) {
    if (name === "changmen") continue;
    fs.rmSync(path.join(modulesDir, name), { recursive: true, force: true });
  }
}

rm("styles/index.css");

console.log("[postbuild] trimmed dist/copy/ → copy-chrome.css + styles/modules/changmen/");
