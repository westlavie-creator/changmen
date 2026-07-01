#!/usr/bin/env node
import { loadChangmenEnv } from "@changmen/storage/load_env.js";
import { ensurePgPoolReady } from "@changmen/db";

loadChangmenEnv();
const pool = await ensurePgPoolReady();
const uid = "6ae8c38e-c4a2-4b2d-9896-733196115322";
const r = await pool.query(
  `SELECT id, player_id, provider, match, item, odds, bet_money, money, status, create_at, link, changmen_bet
   FROM orders
   WHERE user_id = $1 AND match ILIKE $2
   ORDER BY create_at ASC`,
  [uid, "%Patins da Ferrari vs Guara%"],
);
console.log("=== orders ===");
for (const o of r.rows) {
  console.log(JSON.stringify({
    ...o,
    create_at: new Date(Number(o.create_at)).toISOString(),
  }));
}
const cfg = await pool.query("SELECT betting_config FROM profiles WHERE id=$1", [uid]);
const b = cfg.rows[0].betting_config ?? {};
console.log("=== betting_config ===");
console.log(JSON.stringify({
  profit: b.profit,
  maxProfit: b.maxProfit,
  minOdds: b.minOdds,
  betMoney: b.betMoney,
  betting: b.betting,
  makeUp: b.makeUp,
  anyOdds: b.anyOdds,
  anyOddsProfit: b.anyOddsProfit,
  betSorting: b.betSorting,
}, null, 2));
await pool.end();
