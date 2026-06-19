import * as sb from "@changmen/db";
import { isPbHashOrder } from "@changmen/db";
import { formatCnTime } from "./user_log_lookup.js";
import { isAdminNotifyEnabled, sendAdminNotify } from "./telegram.js";

const ARB_LINK_MIN = 1_000_000_000_000;
const DEFAULT_MAX_AGE_MIN = 120;

function isOrderNotifyEnabled() {
  if (!isAdminNotifyEnabled()) return false;
  if (String(process.env.TELEGRAM_ORDER_NOTIFY ?? "1").trim() === "0") return false;
  return true;
}

function maxNotifyAgeMs() {
  const n = Number(process.env.TELEGRAM_ORDER_NOTIFY_MAX_AGE_MIN);
  const min = Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_AGE_MIN;
  return min * 60 * 1000;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function stripHtml(s) {
  return String(s ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function linkTypeLabel(link) {
  const n = Number(link);
  if (Number.isFinite(n) && n >= ARB_LINK_MIN) return "套利";
  if (Number.isFinite(n) && n < 0) return "单边";
  return "hash";
}

/** 展示 LinkID：原样数字字符串（负数为单边，对齐前端 formatLinkId） */
export function formatLinkId(link) {
  const n = Number(link);
  if (!Number.isFinite(n) || n === 0) return "—";
  return String(n);
}

export function shouldNotifyOrderCreateAt(createAt, now = Date.now()) {
  const ts = Number(createAt) || 0;
  if (!ts) return false;
  return ts >= now - maxNotifyAgeMs();
}

/** 与 DB 读路径一致：仅 PB hash 占位单不通知 */
export function isExternalLink(link, provider) {
  return isPbHashOrder(link, provider);
}

export function shouldNotifyAdminOrder(link, createAt, provider, now = Date.now()) {
  if (isPbHashOrder(link, provider)) return false;
  return shouldNotifyOrderCreateAt(createAt, now);
}

function findPlayerLabel(profile, playerId, provider) {
  const accounts = Array.isArray(profile?.accounts) ? profile.accounts : [];
  const hit = accounts.find((a) => Number(a?.accountId ?? a?.AccountId) === Number(playerId));
  const playerName = String(hit?.playerName ?? hit?.PlayerName ?? "").trim();
  const platform = String(
    hit?.platformName ?? hit?.PlatformName ?? hit?.provider ?? hit?.Provider ?? provider ?? "",
  ).trim();
  if (playerName && platform) return `${platform}/${playerName}`;
  if (playerName) return playerName;
  if (platform) return platform;
  return `#${playerId}`;
}

export function formatAdminOrderTelegramBody({
  userName,
  playerLabel,
  order,
}) {
  const match = stripHtml(order.match);
  const bet = stripHtml(order.bet);
  const item = stripHtml(order.item);
  const status = String(order.status || "None");
  const linkLabel = linkTypeLabel(order.link);
  const lines = [
    `<b>📋 新订单 · ${escapeHtml(userName || "用户")}</b>`,
    `${escapeHtml(playerLabel)} · ${escapeHtml(String(order.provider || ""))}`,
    `<blockquote>`,
    escapeHtml(match || "—"),
    `${escapeHtml(bet || "—")} / ${escapeHtml(item || "—")}`,
    `投注时间：${escapeHtml(formatCnTime(order.create_at ?? order.createAt))}`,
    `金额：${Math.round(Number(order.bet_money) || 0)} @ ${Number(order.odds) || 0}`,
    `盈亏：${Math.round(Number(order.money) || 0)} · 状态：${escapeHtml(status)}`,
    `类型：${linkLabel} · LinkID：${escapeHtml(formatLinkId(order.link))} · 单号：${escapeHtml(String(order.order_id || ""))}`,
    `</blockquote>`,
  ];
  return lines.join("\n");
}

/** RDS orders 表新行 → 管理员 Telegram */
export async function notifyNewOrdersFromRows(dbRows) {
  if (!isOrderNotifyEnabled() || !dbRows?.length) return;

  const profileCache = new Map();
  for (const order of dbRows) {
    if (!shouldNotifyAdminOrder(order.link, order.create_at, order.provider)) continue;

    const userId = String(order.user_id || "");
    if (!userId) continue;

    let profile = profileCache.get(userId);
    if (!profile) {
      profile = await sb.fetchProfileById(userId);
      profileCache.set(userId, profile);
    }
    const userName = String(profile?.user_name || userId).trim();
    const playerLabel = findPlayerLabel(profile, order.player_id, order.provider);
    const text = formatAdminOrderTelegramBody({ userName, playerLabel, order });
    const res = await sendAdminNotify(text);
    if (!res.ok) {
      console.warn("[admin-tools:order]", res.msg || "send failed");
    }
  }
}

/** 不阻塞 upsertOrders */
export function enqueueNewOrdersFromRows(dbRows) {
  if (!isOrderNotifyEnabled() || !dbRows?.length) return;
  notifyNewOrdersFromRows(dbRows).catch((err) => {
    console.warn("[admin-tools:order]", err instanceof Error ? err.message : String(err));
  });
}
