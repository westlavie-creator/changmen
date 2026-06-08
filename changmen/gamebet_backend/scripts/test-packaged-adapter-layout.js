"use strict";

const fs = require("fs");
const path = require("path");

const backendRoot = path.join(__dirname, "..");
const src = path.join(backendRoot, "..", "platform_adapter");
const dst = path.join(backendRoot, "platform_adapter");

function cpDir(s, d, skipDir) {
  fs.mkdirSync(d, { recursive: true });
  for (const n of fs.readdirSync(s)) {
    if (skipDir && skipDir(n)) continue;
    const sp = path.join(s, n);
    const dp = path.join(d, n);
    if (fs.statSync(sp).isDirectory()) cpDir(sp, dp, skipDir);
    else fs.copyFileSync(sp, dp);
  }
}

cpDir(src, dst, (n) => n === "frontend" || n === "_template");
delete require.cache[require.resolve(path.join(backendRoot, "core/shared/adapter_paths.js"))];

const ap = require(path.join(backendRoot, "core/shared/adapter_paths.js"));
console.log("packaged root:", ap.getAdapterRoot());

require(path.join(backendRoot, "core/shared/platform_registry.js"));
const { requirePlatformFeed, requirePlatformRelay } = require(path.join(
  backendRoot,
  "core/shared/adapter_paths.js",
));
requirePlatformFeed("TF");
requirePlatformRelay("OB");
require(path.join(ap.getAdapterRoot(), "tf/backend/feed.js"));
console.log("packaged layout OK");

fs.rmSync(dst, { recursive: true, force: true });
