import { existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const distAssets = join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "assets");

if (existsSync(distAssets)) {
  rmSync(distAssets, { recursive: true, force: true });
  console.log("[prebuild] removed dist/assets/");
}
