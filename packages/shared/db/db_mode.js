/**
 * GAMEBET_DB_SCRIPT 模式解析（全库唯一开关逻辑）。
 * supabase | rds | dual
 */

import { resolveDbScript, usesRdsImpl, describeDbScript, DB_SCRIPT_MODES } from "./db_script.js";

/** @returns {{ script: string, readsRds: boolean, writesRds: boolean, writesSupabase: boolean, isDual: boolean, impl: 'impl_rds' | 'impl_supabase' }} */
export function getDbMode(env = process.env) {
  const script = resolveDbScript(env);
  const readsRds = usesRdsImpl(script);
  return {
    script,
    readsRds,
    writesRds: readsRds,
    writesSupabase: script === "supabase" || script === "dual",
    isDual: script === "dual",
    impl: readsRds ? "impl_rds" : "impl_supabase",
  };
}

export { resolveDbScript, usesRdsImpl, describeDbScript, DB_SCRIPT_MODES };
