import * as sb from "@changmen/db";
import { readPreferences } from "./user_freeze.js";

/** 不进入管理端「投注参数」展示的系统 preferences 字段 */
export const PROFILE_META_PREFERENCE_KEYS = new Set([
  "lastLoginIp",
  "lastLoginAt",
  "frozen",
  "frozenAt",
  "frozenBy",
  "unfrozenAt",
  "unfrozenBy",
]);

export function normalizeClientIp(raw) {
  const ip = String(raw || "").trim();
  if (!ip) return "";
  if (ip === "::1") return "127.0.0.1";
  if (ip.startsWith("::ffff:")) return ip.slice(7);
  return ip;
}

export function lastLoginFieldsFromProfile(row) {
  const prefs = readPreferences(row);
  return {
    lastLoginIp: String(prefs.lastLoginIp || ""),
    lastLoginAt: Number(prefs.lastLoginAt) || 0,
  };
}

async function persistProfilePreferences(uid, preferences) {
  const id = String(uid);
  const now = Date.now();
  await sb.ensurePgPoolReady();
  const pool = sb.getPgPool();
  if (!pool) return false;
  const { rowCount } = await pool.query(
    `UPDATE profiles SET preferences = $2::jsonb, updated_at = $3 WHERE id = $1`,
    [id, JSON.stringify(preferences || {}), now],
  );
  return rowCount > 0;
}

/** 登录成功时写入 profiles.preferences */
export async function recordUserLastLogin(userId, clientIp) {
  const uid = String(userId || "").trim();
  const ip = normalizeClientIp(clientIp);
  if (!uid || !ip) return false;
  const row = await sb.fetchProfileById(uid);
  if (!row) return false;
  const prefs = {
    ...readPreferences(row),
    lastLoginIp: ip,
    lastLoginAt: Date.now(),
  };
  return persistProfilePreferences(uid, prefs);
}
