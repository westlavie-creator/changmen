/**
 * 独立比赛匹配进程（见 ops/rebuild.js 共用 rebuild 逻辑）。
 */

import { startMatcherLoop } from "./loop.js";

async function main() {
  await startMatcherLoop({ mode: "standalone", exitOnFatal: true });
}

main().catch((err) => {
  console.error("[matcher] fatal:", err);
  process.exit(1);
});
