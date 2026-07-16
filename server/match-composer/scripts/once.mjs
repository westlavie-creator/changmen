#!/usr/bin/env node
import "../lib/env.js";
import { composeOnce } from "../ops/compose_once.js";
import { isComposerWriteEnabled } from "../lib/config.js";

const write = process.argv.includes("--write") || isComposerWriteEnabled();
const result = await composeOnce({ write, registerTeams: !process.argv.includes("--no-teams") });
console.log(JSON.stringify({
  matchCount: result.matchCount,
  wrote: result.wrote,
  projectStats: result.projectStats,
  builtAt: result.builtAt,
}, null, 2));
