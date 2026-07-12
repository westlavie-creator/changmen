#!/usr/bin/env node
/** @deprecated 脚本名保留；逻辑为 matchMergeOnce */
import { ensurePgPoolReady } from "@changmen/db";
import { matchMergeOnce } from "../../matcher/ops/match_merge_once.js";

const pool = await ensurePgPoolReady();
const before = (
  await pool.query(
    `SELECT match_id FROM platform_matches WHERE platform='OB' AND source_match_id='4338949224517918'`,
  )
).rows[0]?.match_id ?? null;
console.log("OB match_id before matchMerge:", before);

const result = await matchMergeOnce();
console.log("matchMerge result:", JSON.stringify(result, null, 2));

const after = await pool.query(
  `SELECT match_id FROM platform_matches WHERE platform='OB' AND source_match_id='4338949224517918'`,
);
const cm291 = await pool.query(`SELECT id, matchs, merge_key FROM client_matches WHERE id=291`);
console.log("\nOB match_id after:", after.rows[0]?.match_id ?? null);
console.log("client #291:", cm291.rows[0]);
await pool.end();
