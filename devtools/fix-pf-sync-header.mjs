import fs from "fs";
import { execSync } from "child_process";

const path = "server/backend/core/integrations/predictfun/pf_sync_official.js";
const raw = execSync(`git show HEAD:${path}`, {
  cwd: "D:/River/arb/changmen",
  encoding: "buffer",
}).toString("utf8");

const bodyStart = raw.indexOf("import * as accountStore");
if (bodyStart < 0)
  throw new Error("import block not found in HEAD version");

let rest = raw.slice(bodyStart);
rest = rest.replace(
  /\/\*\*[\s\S]*?\*\/\r?\n(?=export async function syncOfficialOrderToRds)/,
  [
    "/**",
    " * Sync official status into RDS; refund stake when rejected while open.",
    " * @returns {{ venueOrder: object, refunded: boolean, settlement: string }}",
    " */",
    "",
  ].join("\n"),
);

const out = [
  "/**",
  " * Official PF order status -> RDS (reject refund / fill / late fee).",
  " * Persist via upsertPfServerOrder (server-only; not Client_SaveOrder).",
  " */",
  "",
  rest,
].join("\n");

fs.writeFileSync(`D:/River/arb/changmen/${path}`, out, "utf8");
console.log("ok imports=", out.includes("import * as accountStore"));
console.log("ok upsert=", out.includes("upsertPfServerOrder"));
console.log(out.slice(0, 220));
