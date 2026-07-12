#!/usr/bin/env node
/** @deprecated 使用 ops/migrations/archive-stale-client-matches.mjs */
console.warn("[deprecated] prune-stale.mjs → archive-stale-client-matches.mjs");
await import("./archive-stale-client-matches.mjs");
