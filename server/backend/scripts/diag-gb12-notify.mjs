import pg from "pg";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { isPbHashOrder } from "@changmen/db/order_link_filter.js";

function isExternalLink(link, provider) {
  return isPbHashOrder(link, provider);
}

function linkType(link) {
  const n = Number(link);
  const ARB_LINK_MIN = 1_000_000_000_000;
  if (Number.isFinite(n) && n >= ARB_LINK_MIN) return "arb";
  if (Number.isFinite(n) && n < 0) return "single";
  return "hash";
}

function shouldNotify(link, createAt, provider, now = Date.now()) {
  const ts = Number(createAt) || 0;
  const ageOk = ts && ts >= now - 120 * 60 * 1000;
  return !isExternalLink(link, provider) && ageOk;
}

const __dir = dirname(fileURLToPath(import.meta.url));
const envText = readFileSync(resolve(__dir, "../.env"), "utf8");
const dbUrl = envText.match(/^DATABASE_URL=(.+)$/m)?.[1]?.trim();
const pool = new pg.Pool({ connectionString: dbUrl });

const userRes = await pool.query(
  "SELECT id, user_name FROM users WHERE user_name ILIKE '%gb12%'",
);
if (!userRes.rows.length) {
  console.log("no gb12 user");
  await pool.end();
  process.exit(0);
}
const userId = userRes.rows[0].id;
console.log("user:", userRes.rows[0]);

const orders = await pool.query(
  `SELECT order_id, player_id, link, provider, match, bet, item, status, create_at
   FROM orders WHERE user_id = $1 ORDER BY create_at DESC LIMIT 40`,
  [userId],
);
console.log("recent orders:", orders.rows.length);
const now = Date.now();
let wouldNotify = 0;
let blockedExternal = 0;
let blockedAge = 0;
for (const r of orders.rows) {
  const ext = isExternalLink(r.link, r.provider);
  const ageOk = Number(r.create_at) >= now - 120 * 60 * 1000;
  const notify = shouldNotify(r.link, r.create_at, r.provider, now);
  if (notify) wouldNotify += 1;
  else if (ext) blockedExternal += 1;
  else if (!ageOk) blockedAge += 1;
  const t = new Date(Number(r.create_at)).toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
  });
  console.log(
    JSON.stringify({
      order_id: String(r.order_id).slice(0, 28),
      link: String(r.link),
      type: linkType(r.link),
      notify_if_inserted_now: notify,
      time: t,
      match: (r.match || "").slice(0, 40),
      provider: r.provider,
    }),
  );
}
console.log("--- summary (current link at notify time) ---");
console.log({
  would_notify: wouldNotify,
  blocked_external_link: blockedExternal,
  blocked_too_old: blockedAge,
});

console.log("--- simulate INSERT-time link (hash placeholder) ---");
function linkFromOrder(orderId, createAt) {
  const id = String(orderId || createAt || "");
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return hash || Number(createAt) || Date.now();
}
let insertWouldNotify = 0;
let insertBlocked = 0;
for (const r of orders.rows.slice(0, 15)) {
  const hashLink = linkFromOrder(r.order_id, r.create_at);
  const notifyAtInsert = shouldNotify(hashLink, r.create_at, r.provider, now);
  if (notifyAtInsert) insertWouldNotify += 1;
  else insertBlocked += 1;
  console.log(
    JSON.stringify({
      order_id: String(r.order_id).slice(0, 20),
      final_link: String(r.link),
      insert_link_hash: hashLink,
      notify_at_insert: notifyAtInsert,
      notify_after_bind: shouldNotify(r.link, r.create_at, r.provider, now),
    }),
  );
}
console.log({ insert_would_notify: insertWouldNotify, insert_blocked: insertBlocked });

const groups = await pool.query(
  `SELECT link::text, count(*)::int as cnt, max(create_at) as max_ca
   FROM orders WHERE user_id = $1 AND create_at >= $2
   GROUP BY link ORDER BY max(create_at) DESC LIMIT 15`,
  [userId, now - 24 * 3600 * 1000],
);
console.log("--- link groups last 24h ---");
for (const g of groups.rows) {
  console.log(
    JSON.stringify({
      link: g.link,
      count: g.cnt,
      type: linkType(g.link),
      notify: shouldNotify(g.link, g.max_ca, now),
    }),
  );
}

await pool.end();
