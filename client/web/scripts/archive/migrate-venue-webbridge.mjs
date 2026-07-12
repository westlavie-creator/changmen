import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../../venue-adapter");
const bridge = "@venue/shared/webBridge";
const fromStores = [
  "@/stores/oddsStore",
  "@/stores/collectStore",
  "@/stores/matchStore",
  "@/stores/messageStore",
  "@/stores/accountStore",
  "@/stores/configStore",
  "@/stores/userStore",
];

function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory() && ent.name !== "node_modules")
      walk(p);
    else if (ent.isFile() && /\.(ts|tsx)$/.test(ent.name))
      migrateFile(p);
  }
}

function migrateFile(filePath) {
  let s = fs.readFileSync(filePath, "utf8");
  const orig = s;
  for (const from of fromStores) {
    s = s.replaceAll(`from "${from}"`, `from "${bridge}"`);
  }
  s = s.replace(
    /void import\("@\/stores\/accountStore"\)\.then\(\(\{ useAccountStore \}\) =>\s*\n\s*useAccountStore\(\)\.refreshBalance\(account\),\s*\)/g,
    "useAccountStore().refreshBalance(account)",
  );
  if (s !== orig) {
    fs.writeFileSync(filePath, s);
    console.log("updated", path.relative(root, filePath));
  }
}

walk(root);
