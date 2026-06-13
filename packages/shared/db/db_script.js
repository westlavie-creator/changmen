/**
 * GAMEBET_DB_SCRIPT 解析（supabase | rds | dual）。
 * dual：读 RDS，写 Supabase + RDS（双写）。
 * 兼容 RDS_DUAL_WRITE=1 + GAMEBET_DB_SCRIPT=supabase → 视为 dual。
 */

export const DB_SCRIPT_MODES = ["supabase", "rds", "dual"];

/** @param {Record<string, string|undefined>} [env] */
export function resolveDbScript(env = process.env) {
  const raw = String(env.GAMEBET_DB_SCRIPT || "supabase").trim().toLowerCase();
  if (raw === "dual" || raw === "rds") return raw;
  if (raw === "supabase" && String(env.RDS_DUAL_WRITE || "").trim() === "1") {
    return "dual";
  }
  if (DB_SCRIPT_MODES.includes(raw)) return raw;
  return "supabase";
}

export function usesRdsImpl(script) {
  return script === "rds" || script === "dual";
}

export function describeDbScript(script) {
  switch (script) {
    case "dual":
      return "读 RDS，写 Supabase + RDS（双写，含队伍表）";
    case "rds":
      return "读写 RDS（含队伍表）";
    default:
      return "读写 Supabase（含队伍表）";
  }
}
