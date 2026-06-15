#!/usr/bin/env node
// 批量把文档里的 platform-adapter 下 frontend 路径改为扁平路径
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CHANGMEN = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKIP = new Set(["node_modules", ".git", "dist", ".smoke"]);

const REPLACEMENTS = [
  [/client\/platform-adapter\/(\{[^}]+\})\/frontend\//g, "client/platform-adapter/$1/"],
  [/platform-adapter\/(\{[^}]+\})\/frontend\//g, "platform-adapter/$1/"],
  [/client\/platform-adapter\/([a-z]+)\/frontend\//g, "client/platform-adapter/$1/"],
  [/platform-adapter\/([a-z]+)\/frontend\//g, "platform-adapter/$1/"],
  [/\{platform\}\/frontend\//g, "{platform}/"],
  [/\{dir\}\/frontend\//g, "{dir}/"],
  [/\{平台\}\/frontend\//g, "{平台}/"],
  [/`\.\.\/\.\.\/\.\.\/client\/platform-adapter\/`\)/g, "`../../../client/platform-adapter/`)"],
  [/采集在 `frontend\//g, "采集在平台根目录 `"],
  [/浏览器 `frontend\//g, "浏览器 `"],
  [/生产采集在 `frontend\//g, "生产采集在平台根目录 `"],
  [/见 `frontend\//g, "见 `"],
  [/server\/platform-node/g, "devtools/platform-probes"],
  [/@changmen\/platform-node/g, "@changmen/platform-probes"],
  [/cd changmen\/server\/platform-node/g, "cd changmen/devtools/platform-probes"],
  [/\{platform\}\/frontend\/backend/g, "{platform}/ + platform-probes"],
  [/frontend\/backend \+ registry/g, "collect/bet + registry"],
  [/11 平台 frontend\/backend/g, "11 平台适配器"],
  [/frontend\/\*`/g, "*/`"],
  [/frontend\/\*/g, "*/"],
  [/frontend\/bet\.ts/g, "bet.ts"],
  [/frontend\/collect\.ts/g, "collect.ts"],
  [/frontend\/markets\.ts/g, "markets.ts"],
  [/frontend\/mqtt\.ts/g, "mqtt.ts"],
  [/frontend\/auth\.ts/g, "auth.ts"],
  [/frontend\/parse\.ts/g, "parse.ts"],
  [/frontend\/tabId/g, "tabId"],
  [/frontend\/pluginApi/g, "pluginApi"],
  [/frontend\/graphql/g, "graphql"],
  [/frontend\/\*/g, "*/"],
  [/ia\/frontend\//g, "ia/"],
  [/tf\/frontend\//g, "tf/"],
  [/ob\/frontend\//g, "ob/"],
  [/pb\/frontend\//g, "pb/"],
  [/ray\/frontend\//g, "ray/"],
  [/目录语义：`{platform}/` 为浏览器采集；`@changmen/platform-probes`（`devtools/platform-probes/`）为可选 Node 探针 CLI/`）为可选 Node 探针 CLI"],
];

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(md|mjs|js|ts)$/.test(name)) out.push(p);
  }
  return out;
}

let changed = 0;
for (const file of walk(CHANGMEN)) {
  if (file.includes(`${path.sep}node_modules${path.sep}`)) continue;
  let text = fs.readFileSync(file, "utf8");
  let next = text;
  for (const [re, rep] of REPLACEMENTS) {
    next = next.replace(re, rep);
  }
  if (next !== text) {
    fs.writeFileSync(file, next, "utf8");
    changed++;
    console.log(path.relative(CHANGMEN, file));
  }
}
console.log(`\nupdated ${changed} files`);
