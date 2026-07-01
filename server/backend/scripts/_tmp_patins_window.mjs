#!/usr/bin/env node
import { loadChangmenEnv } from "@changmen/storage/load_env.js";
import { ensurePgPoolReady } from "@changmen/db";

loadChangmenEnv();
const pool = await ensurePgPoolReady();
const uid = "6ae8c38e-c4a2-4b2d-9896-733196115322";
const t0 = new Date("2026-06-30T22:03:00Z").getTime();
const t1 = new Date("2026-06-30T22:06:00Z").getTime();
const r = await pool.query(
  `SELECT id, player_id, provider, match, bet, item, odds, bet_money, money, status, create_at, link, changmen_bet
   FROM orders
   WHERE user_id = $1 AND create_at BETWEEN $2 AND $3
   ORDER BY create_at ASC`,
  [uid, t0, t1],
);
console.log("orders in window:", r.rowCount);
for (const o of r.rows) {
  console.log(JSON.stringify({
    id: o.id,
    provider: o.provider,
    player_id: o.player_id,
    match: o.match,
    item: o.item,
    odds: o.odds,
    bet_money: o.bet_money,
    money: o.money,
    link: o.link,
    changmen_bet: o.changmen_bet,
    create_at: new Date(Number(o.create_at)).toISOString(),
  }));
}
await pool.end();
