#!/usr/bin/env node
/**
 * catalog / smoke 测试聚合 runner（替代 package.json 里超长 && 链）。
 *
 * - 顺序执行、fail-fast：首个失败即退出并回传其 exit code（保持原 && 语义）。
 * - 每步打印编号 + 标题；失败时打印可复制的重跑单步命令。
 * - 新增 / 删除 smoke 请改 STEPS 数组，勿再回到一行式命令。
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const NODE = process.execPath;
const VITEST = path.join(ROOT, "node_modules", ".bin", "vitest");

/** node --experimental-strip-types <ts> */
function ts(label, file) {
  return { label, cmd: NODE, args: ["--experimental-strip-types", file] };
}
/** node <mjs> */
function mjs(label, file) {
  return { label, cmd: NODE, args: [file] };
}

/** @type {{ label: string, cmd: string, args: string[] }[]} */
const STEPS = [
  ts("shared/catalog: market", "packages/shared/catalog/market_catalog_smoke.test.ts"),
  ts("shared/catalog: game", "packages/shared/catalog/game_catalog_smoke.test.ts"),
  ts("shared/catalog: sport", "packages/shared/catalog/sport_catalog_smoke.test.ts"),
  ts("shared: im_parse", "packages/shared/im_parse_smoke.test.ts"),
  ts("shared/time: match_time", "packages/shared/time/match_time_smoke.test.ts"),
  mjs("storage: paths", "server/storage/paths_smoke.test.mjs"),
  mjs("esport-api: sport_list_cache", "server/backend/core/esport-api/sport_list_cache.smoke.test.mjs"),
  mjs("esport-api: sport_predictfun_fetch", "server/backend/core/esport-api/sport_predictfun_fetch.smoke.test.mjs"),
  mjs("esport-api: sport_football_markets", "server/backend/core/esport-api/sport_football_markets.smoke.test.mjs"),
  mjs("esport-api: sport_venue_ingest", "server/backend/core/esport-api/sport_venue_ingest.smoke.test.mjs"),
  mjs("esport-api: sport_merge", "server/backend/core/esport-api/sport_merge.smoke.test.mjs"),
  mjs("esport-api: esport_isolation_audit", "server/backend/core/esport-api/esport_isolation_audit.smoke.test.mjs"),
  mjs("team-resolver: sport_team_plugin", "server/team-resolver/sport_team_plugin.smoke.test.mjs"),
  mjs("db: sport_matcher_tables", "server/db/sport_matcher_tables.smoke.test.mjs"),
  {
    label: "db: order_link_filter + order_changmen_bet (vitest)",
    cmd: VITEST,
    args: ["run", "server/db/order_link_filter.test.mjs", "server/db/order_changmen_bet.test.mjs"],
  },
];

for (let i = 0; i < STEPS.length; i++) {
  const step = STEPS[i];
  const n = `${i + 1}/${STEPS.length}`;
  console.log(`\n>> [${n}] ${step.label}`);
  const res = spawnSync(step.cmd, step.args, { cwd: ROOT, stdio: "inherit" });
  const code = res.status ?? (res.error ? 1 : 0);
  if (code !== 0) {
    const shown = step.cmd === VITEST ? "vitest" : "node";
    console.error(`\n[FAIL] catalog-smoke 失败于 [${n}] ${step.label} (exit ${code})`);
    console.error(`       重跑单步: ${shown} ${step.args.join(" ")}`);
    process.exit(code);
  }
}
console.log(`\n[OK] catalog-smoke 全部通过 (${STEPS.length} 步)`);
