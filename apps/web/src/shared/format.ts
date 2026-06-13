/** 对齐 A8 bundle `pt` 常用格式化 */

import { formatOdds } from "@changmen/shared/odds_format.js";
import { normalizeEpochMs } from "@changmen/shared/time/match_time.mjs";

export function formatDate(ts: number | string | null | undefined): string {
  const ms = normalizeEpochMs(ts);
  if (!ms) return "";
  const d = new Date(ms);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${mm}-${dd} ${hh}:${min}`;
}

/** 订单列表投注时间，对齐 A8 `pt.formatDate(CreateAt)` 默认 `yyyy-MM-dd HH:mm:ss` */
export function formatOrderTime(ts: number | string | null | undefined): string {
  const ms = normalizeEpochMs(ts);
  if (!ms) return "";
  return formatPbDateTime(new Date(ms));
}

/** A8 聊天室时间标签 `HH:mm:ss` */
export function formatTimeHms(ts: number): string {
  if (!ts) return "";
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  const sec = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${min}:${sec}`;
}

/** 对齐 A8 `pt.formatDate(date, "yyyy-MM-dd HH:mm:ss")` */
export function formatPbDateTime(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  const sec = String(d.getSeconds()).padStart(2, "0");
  return `${y}-${m}-${day} ${hh}:${min}:${sec}`;
}

export function formatDateKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatSecond(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

/** 与 @changmen/shared/odds_format、A8 展示一致 */
export function formatDisplayOdds(value: number): number {
  return formatOdds(value);
}

export function toFixed(n: number, digits = 3, mode: "round" | "floor" = "round"): string {
  const f = 10 ** digits;
  const v = mode === "floor" ? Math.floor(n * f) / f : Math.round(n * f) / f;
  return v.toFixed(digits);
}

export function percent(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return "N/A";
  return `${(n * 100).toFixed(digits)}%`;
}

export function arbPercent(homeOdds: number, awayOdds: number): string {
  if (!homeOdds || !awayOdds) return "N/A";
  return percent(1 / (1 / homeOdds + 1 / awayOdds));
}

/** 套利 implied 乘数（≥1）→ 净利润率，如 1.05 → 5.0% */
export function arbProfitRate(implied: number, digits = 1): string {
  if (!Number.isFinite(implied)) return "N/A";
  return percent(implied - 1, digits);
}
