/**
 * Guard: new ALTER migrations must be wired into apply-rds-schema.mjs
 * (rot_num 038 was; line_id 039 initially was not — SaveBet/fetch would crash).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const applySrc = readFileSync(join(__dirname, "apply-rds-schema.mjs"), "utf8");
const storeSrc = readFileSync(
  join(__dirname, "../../db/rds/platform_collector_store.js"),
  "utf8",
);

describe("apply-rds-schema migration wiring", () => {
  it("runs platform_bets market_id + line_id migrations before finish", () => {
    assert.match(applySrc, /034_platform_bets_market_id\.sql/);
    assert.match(applySrc, /039_platform_bets_line_id\.sql/);
    const i034 = applySrc.indexOf("034_platform_bets_market_id.sql");
    const i039 = applySrc.indexOf("039_platform_bets_line_id.sql");
    const iDone = applySrc.indexOf("[rds] 完成");
    assert.ok(i034 > 0 && i039 > i034 && iDone > i039);
  });

  it("upsert preserves existing line_id when SaveBet omits it", () => {
    assert.match(
      storeSrc,
      /line_id\s*=\s*COALESCE\(\s*EXCLUDED\.line_id\s*,\s*platform_bets\.line_id\s*\)/,
    );
  });
});
