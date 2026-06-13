import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { CHANGMEN_ROOT, BACKEND_ROOT, ESPORT_DATA_DIR } = require("./paths.cjs");

const backendPkg = path.join(BACKEND_ROOT, "package.json");
if (!fs.existsSync(backendPkg)) {
  throw new Error(`BACKEND_ROOT missing package.json: ${BACKEND_ROOT}`);
}
const pkg = JSON.parse(fs.readFileSync(backendPkg, "utf8"));
if (pkg.name !== "@changmen/backend") {
  throw new Error(`BACKEND_ROOT not @changmen/backend: ${BACKEND_ROOT}`);
}
if (path.basename(BACKEND_ROOT) !== "backend" || path.basename(path.dirname(BACKEND_ROOT)) !== "apps") {
  throw new Error(`BACKEND_ROOT layout unexpected: ${BACKEND_ROOT}`);
}
if (!fs.existsSync(ESPORT_DATA_DIR)) {
  throw new Error(`ESPORT_DATA_DIR missing: ${ESPORT_DATA_DIR}`);
}
if (!fs.existsSync(path.join(CHANGMEN_ROOT, "packages", "db"))) {
  throw new Error(`CHANGMEN_ROOT unexpected: ${CHANGMEN_ROOT}`);
}

console.log("paths smoke OK:", { CHANGMEN_ROOT, BACKEND_ROOT, ESPORT_DATA_DIR });
