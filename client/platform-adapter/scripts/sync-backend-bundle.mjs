#!/usr/bin/env node
/**
 * 将 client/platform-adapter 同步到 server/backend/platform_adapter（跳过 frontend；不含 platform-node）。
 * 仅用于「瘦包」部署（无 changmen/packages 目录）；标准 monorepo VPS 部署不需要。
 *
 * 默认跳过 frontend/、_template/（服务端 HTTP 代理只需 node + registry + 包级 backend/_paths）。
 *
 * 用法：
 *   npm run sync:backend-bundle --workspace=@changmen/platform-adapter
 *   npm run sync:platform-adapter --workspace=@changmen/backend
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { BACKEND_ROOT } from "@changmen/db/paths.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ADAPTER_PKG_ROOT = path.join(__dirname, "..");

const DEFAULT_SKIP = new Set(["frontend", "_template"]);

function cpDir(src, dst, skipDir) {
  fs.mkdirSync(dst, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    if (skipDir?.(name)) continue;
    const from = path.join(src, name);
    const to = path.join(dst, name);
    if (fs.statSync(from).isDirectory()) cpDir(from, to, skipDir);
    else fs.copyFileSync(from, to);
  }
}

/**
 * @param {{ dst?: string, src?: string, includeFrontend?: boolean }} [options]
 * @returns {string} 目标目录绝对路径
 */
export function syncPlatformAdapterBackendBundle(options = {}) {
  const src = options.src ?? ADAPTER_PKG_ROOT;
  const dst = options.dst ?? path.join(BACKEND_ROOT, "platform_adapter");
  const skip = options.includeFrontend
    ? (name) => name === "_template"
    : (name) => DEFAULT_SKIP.has(name);

  if (!fs.existsSync(path.join(src, "registry", "manifest.json"))) {
    throw new Error(`platform-adapter source missing manifest: ${src}`);
  }

  if (fs.existsSync(dst)) {
    fs.rmSync(dst, { recursive: true, force: true });
  }
  cpDir(src, dst, skip);
  return dst;
}

const isMain =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  const dst = syncPlatformAdapterBackendBundle();
  console.log(`[sync-platform-adapter] ${dst}`);
}
