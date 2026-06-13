/**
 * GAMEBET_DB_SCRIPT 模式解析（仅 rds）。
 */

import { resolveDbScript, usesRdsImpl, describeDbScript, DB_SCRIPT_MODES } from "./db_script.js";

/** @returns {{ script: string, readsRds: boolean, writesRds: boolean, impl: 'impl_rds' }} */
export function getDbMode(env = process.env) {
  const script = resolveDbScript(env);
  return {
    script,
    readsRds: true,
    writesRds: true,
    impl: "impl_rds",
  };
}

export { resolveDbScript, usesRdsImpl, describeDbScript, DB_SCRIPT_MODES };
