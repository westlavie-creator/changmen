import { initDatabaseUrl, buildPgClientConfig } from "@changmen/db";
import pg from "@changmen/db/pg.js";

const name = process.argv[2] || "tj01";
await initDatabaseUrl();
const c = new pg.Client(buildPgClientConfig(process.env.DATABASE_URL));
await c.connect();
const r = await c.query(
  "SELECT id, user_name FROM users WHERE lower(user_name) = lower($1)",
  [name],
);
const p = await c.query(
  "SELECT id, user_name, preferences FROM profiles WHERE lower(user_name) = lower($1)",
  [name],
);
console.log("users:", r.rows);
console.log(
  "profiles:",
  p.rows.map((x) => ({
    id: x.id,
    user_name: x.user_name,
    frozen: Boolean(x.preferences?.frozen),
  })),
);
await c.end();
