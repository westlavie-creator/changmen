/**
 * copy 预览样式同步入口：复用 scripts/ 里的 canonical 逻辑。
 * 用法：node public/copy/sync-styles.mjs
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  syncChangmenModuleStyles,
  syncCopyPreviewStyles,
} from "../../scripts/sync-copy-preview-styles.mjs";

const webRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

const extract = spawnSync(process.execPath, ["scripts/extract-a8-css.mjs"], {
  cwd: webRoot,
  stdio: "inherit",
});

if (extract.status !== 0) {
  process.exit(extract.status ?? 1);
}

const { copied, missing } = syncCopyPreviewStyles();
const changmen = syncChangmenModuleStyles();
if (missing.length || changmen.missing.length) {
  process.exitCode = 1;
}

console.log(
  `[copy/sync-styles] done (legacy ${copied}, changmen ${changmen.copied}, missing ${missing.length + changmen.missing.length})`,
);
