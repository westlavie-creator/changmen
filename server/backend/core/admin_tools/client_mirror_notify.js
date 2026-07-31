/**
 * 登录用户将客户端已合成的 Telegram 文案抄送管理员频道。
 * chat_id 仅服务端 TELEGRAM_ADMIN_CHAT_ID，禁止客户端指定。
 */
import { isAdminNotifyEnabled, sendAdminNotify } from "./telegram.js";

const MAX_TEXT_LEN = 3500;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 60;

/** @type {Map<string, { windowStart: number, count: number }>} */
const rateByUser = new Map();

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function __resetClientMirrorNotifyRateForTests() {
  rateByUser.clear();
}

function allowRate(userId) {
  const id = String(userId || "");
  if (!id)
    return false;
  const now = Date.now();
  let row = rateByUser.get(id);
  if (!row || now - row.windowStart >= RATE_WINDOW_MS) {
    row = { windowStart: now, count: 0 };
    rateByUser.set(id, row);
  }
  if (row.count >= RATE_MAX)
    return false;
  row.count += 1;
  return true;
}

/**
 * @param {Record<string, unknown>} body
 * @param {{ id?: string, userName?: string } | null | undefined} user
 * @returns {Promise<{ ok: true, skipped?: boolean } | { ok: false, msg: string }>}
 */
export async function handleClientNotifyAdminTelegram(body, user) {
  if (!user?.id)
    return { ok: false, msg: "未登录" };
  if (!isAdminNotifyEnabled())
    return { ok: true, skipped: true };

  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text)
    return { ok: false, msg: "缺少 text" };
  if (text.length > MAX_TEXT_LEN)
    return { ok: false, msg: `text 超过 ${MAX_TEXT_LEN} 字符` };

  if (!allowRate(user.id))
    return { ok: false, msg: "发送过于频繁" };

  const notifyType = String(body?.notifyType || body?.notify_type || "下单提醒").trim() || "下单提醒";
  const userName = String(user.userName || user.id || "用户").trim() || "用户";
  const payload = `<b>用户：${escapeHtml(userName)}</b>\n${text}`;
  return sendAdminNotify(payload, "HTML", notifyType);
}
