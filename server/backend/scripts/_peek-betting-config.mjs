import { initDatabaseUrl, buildPgClientConfig } from "@changmen/db";
import pg from "@changmen/db/pg.js";

const name = process.argv[2] || "tj01";
await initDatabaseUrl();
const c = new pg.Client(buildPgClientConfig(process.env.DATABASE_URL));
await c.connect();
const r = await c.query(
  "SELECT user_name, betting_config, updated_at FROM profiles WHERE lower(user_name) = lower($1)",
  [name],
);
console.log(JSON.stringify(r.rows, null, 2));
await c.end();
