import { createRequire } from "node:module";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);

const cjs = require("./game_catalog.js");
const esm = await import("./game_catalog.mjs");

assert.equal(
  esm.getGameCodeForPlatformId("OB", "70"),
  cjs.getGameCodeForPlatformId("OB", "70"),
  "getGameCodeForPlatformId OB cs2",
);

assert.deepEqual(
  esm.resolveClientGame("RAY", "1"),
  cjs.resolveClientGame("RAY", "1"),
  "resolveClientGame RAY",
);

assert.deepEqual(
  esm.getActivePlatformGameIds("OB").sort(),
  cjs.getActivePlatformGameIds("OB").sort(),
  "getActivePlatformGameIds OB",
);

console.log("game_catalog_parity: ok");
