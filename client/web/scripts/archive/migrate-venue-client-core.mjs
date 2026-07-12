#!/usr/bin/env node
/**
 * 阶段 3a：将 venue-adapter 内 @/ 引用替换为 @changmen/client-core / @changmen/api-contract。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VENUE_ROOT = path.resolve(__dirname, "../../venue-adapter");

const REPLACEMENTS = [
  [/@\/types\/collect/g, "@changmen/client-core/types/collect"],
  [/@\/types\/limit/g, "@changmen/client-core/types/limit"],
  [/@\/types\/account/g, "@changmen/client-core/types/account"],
  [/@\/types\/userConfig/g, "@changmen/client-core/types/userConfig"],
  [/@\/types\/esport/g, "@changmen/api-contract"],
  [/@\/models\/betOption/g, "@changmen/client-core/models/betOption"],
  [/@\/models\/betResult/g, "@changmen/client-core/models/betResult"],
  [/@\/models\/platformAccount/g, "@changmen/client-core/models/platformAccount"],
  [/@\/models\/match/g, "@changmen/client-core/models/match"],
  [/@\/shared\/wait/g, "@changmen/client-core/shared/wait"],
  [/@\/shared\/format/g, "@changmen/client-core/shared/format"],
  [/@\/shared\/bracketForm/g, "@changmen/client-core/shared/bracketForm"],
  [/@\/shared\/venueGames/g, "@changmen/client-core/shared/venueGames"],
  [/@\/shared\/a8MatchTime/g, "@changmen/shared/time/match_time"],
  [/@\/shared\/currency/g, "@changmen/shared/currency"],
  [/@\/shared\/http/g, "@changmen/client-core/shared/http"],
  [/@\/shared\/a8Axios/g, "@changmen/client-core/shared/a8Axios"],
  [/@\/shared\/platformHttp/g, "@changmen/client-core/shared/platformHttp"],
  [/@\/shared\/platform/g, "@venue/registry"],
  [/@\/api\/esport/g, "@changmen/client-core/bridge/clientApi"],
  [/@\/api\/hg/g, "@changmen/client-core/bridge/clientApi"],
  [/@\/api\/v4/g, "@venue/ob/constants"],
  [/@\/chrome-plugin\/bridge/g, "@changmen/client-core/chrome-plugin/bridge"],
];

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      if (name === "node_modules")
        continue;
      walk(full, out);
    }
    else if (/\.(ts|tsx|mts|js|mjs)$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

let changed = 0;
for (const file of walk(VENUE_ROOT)) {
  let text = fs.readFileSync(file, "utf8");
  const before = text;
  for (const [from, to] of REPLACEMENTS) {
    text = text.replace(from, to);
  }
  if (text !== before) {
    fs.writeFileSync(file, text);
    changed++;
    console.log("updated:", path.relative(VENUE_ROOT, file));
  }
}
console.log(`done: ${changed} files`);
