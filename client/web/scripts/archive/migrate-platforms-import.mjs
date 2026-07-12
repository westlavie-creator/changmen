#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../venue-adapter");
const skip = new Set(["node_modules", "dist", "registry"]);
const re = /import \{ PLATFORMS \} from ["']@venue\/registry["'];?/g;
const next = 'import { PLATFORMS } from "@venue/shared/platforms";';

function walk(dir, files = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(ent.name)) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, files);
    else if (ent.name.endsWith(".ts")) files.push(p);
  }
  return files;
}

let changed = 0;
for (const f of walk(root)) {
  const content = fs.readFileSync(f, "utf8");
  if (!re.test(content)) continue;
  fs.writeFileSync(f, content.replace(re, next));
  changed++;
  console.log(path.relative(root, f));
}
console.log("Updated", changed, "files");
