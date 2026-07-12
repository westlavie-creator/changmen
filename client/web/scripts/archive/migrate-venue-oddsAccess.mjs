import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../../venue-adapter");
const oddsAccess = "@changmen/client-core/bridge/oddsAccess";

const oddsFns = [
  "saveVenueOdds",
  "cleanVenueOdds",
  "isVenueOdds",
  "getVenueOddsEntry",
  "updateVenueOddsLock",
  "updateVenueBetLock",
  "updateVenueOddsMessage",
  "getVenueOddsLimit",
  "setVenueOddsLimit",
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
  if (filePath.endsWith("webBridge.ts") || filePath.endsWith("webBridgeTypes.ts"))
    return;

  let s = fs.readFileSync(filePath, "utf8");
  const orig = s;
  if (!s.includes("useOddsStore"))
    return;

  // drop useOddsStore from webBridge imports
  s = s.replace(
    /import\s*\{([^}]*)\}\s*from\s*["']@venue\/shared\/webBridge["'];?/g,
    (m, inner) => {
      const names = inner.split(",").map(x => x.trim()).filter(Boolean);
      const kept = names.filter(n => n !== "useOddsStore");
      if (!kept.length)
        return "";
      return `import { ${kept.join(", ")} } from "@venue/shared/webBridge";`;
    },
  );

  s = s.replace(/import type \{ OddsStoreBridge \}[^\n]+\n/g, "");
  s = s.replace(/type RayOddsStore = Pick<OddsStoreBridge[^;]+;\n\n/g, "");

  // const odds = useOddsStore(); / const oddsStore = useOddsStore();
  s = s.replace(/\n\s*const odds(?:Store)? = useOddsStore\(\);\n/g, "\n");

  // useOddsStore().method → function
  s = s.replace(/useOddsStore\(\)\.setLimit\(/g, "setVenueOddsLimit(");
  s = s.replace(/useOddsStore\(\)\.updateOddsLock\(/g, "updateVenueOddsLock(");
  s = s.replace(/oddsStore\.setLimit\(/g, "setVenueOddsLimit(");
  s = s.replace(/oddsStore\.getLimit\(/g, "getVenueOddsLimit(");
  s = s.replace(/oddsStore\.save\(/g, "saveVenueOdds(");
  s = s.replace(/odds\.save\(/g, "saveVenueOdds(");
  s = s.replace(/odds\.clean\(/g, "cleanVenueOdds(");
  s = s.replace(/odds\.isOdds\(/g, "isVenueOdds(");
  s = s.replace(/odds\.getEntry\(/g, "getVenueOddsEntry(");
  s = s.replace(/odds\.updateBetLock\(/g, "updateVenueBetLock(");
  s = s.replace(/odds\.updateOddsLock\(/g, "updateVenueOddsLock(");
  s = s.replace(/odds\.updateMessage\(/g, "updateVenueOddsMessage(");
  s = s.replace(/oddsStore\.updateOddsLock\(/g, "updateVenueOddsLock(");

  // polymarket helper signatures
  s = s.replace(
    /odds: ReturnType<typeof useOddsStore>,\n/g,
    "",
  );
  s = s.replace(/handleRayRealtimeMessage\(\s*msg,\s*odds,\s*/g, "handleRayRealtimeMessage(msg, ");
  s = s.replace(/handleRayRealtimeMessage\(msg, odds\)/g, "handleRayRealtimeMessage(msg)");

  if (s === orig)
    return;

  const used = oddsFns.filter(fn => s.includes(fn));
  if (used.length) {
    const importLine = `import { ${used.join(", ")} } from "${oddsAccess}";\n`;
    if (s.includes(`from "${oddsAccess}"`)) {
      s = s.replace(
        /import\s*\{([^}]*)\}\s*from\s*["']@changmen\/client-core\/bridge\/oddsAccess["'];?/,
        (_m, inner) => {
          const names = new Set(
            inner.split(",").map(x => x.trim()).filter(Boolean),
          );
          for (const fn of used)
            names.add(fn);
          return `import { ${[...names].join(", ")} } from "${oddsAccess}";`;
        },
      );
    }
    else {
      s = importLine + s;
    }
  }

  fs.writeFileSync(filePath, s);
  console.log("migrated", path.relative(root, filePath));
}

walk(root);
