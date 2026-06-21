/** 服务端管理员 Telegram 通道（与客户端用户各自填 telegramId 的 SendMessage 独立） */

import { getTelegramBotToken, handleSendMessage } from "../esport-api/telegram_send.js";

export function getAdminChatId() {
  return String(process.env.TELEGRAM_ADMIN_CHAT_ID || "").trim();
}

/** 管理员通知总开关：需 TELEGRAM_BOT_TOKEN + TELEGRAM_ADMIN_CHAT_ID；TELEGRAM_ADMIN_NOTIFY=0 关闭全部 */
export function isAdminNotifyEnabled() {
  if (String(process.env.TELEGRAM_ADMIN_NOTIFY ?? "1").trim() === "0")
    return false;
  return Boolean(getTelegramBotToken() && getAdminChatId());
}

function escapeNotifyLabel(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** 管理员消息统一前缀，区分于用户侧 Telegram */
export function prefixAdminNotifyBody(text, notifyType = "通知") {
  const label = escapeNotifyLabel(String(notifyType || "通知").trim()) || "通知";
  return `<b>【管理员·${label}】</b>\n${text}`;
}

/**
 * @param {string} text
 * @param {string} [parseMode]
 * @param {string} [notifyType] 通知类型标签（显示在【管理员·类型】前缀中）
 */
export async function sendAdminNotify(text, parseMode = "HTML", notifyType = "通知") {
  if (!isAdminNotifyEnabled()) {
    return { ok: false, msg: "未启用服务端管理员 Telegram 通知" };
  }
  return handleSendMessage({
    chat_id: getAdminChatId(),
    text: prefixAdminNotifyBody(text, notifyType),
    parse_mode: parseMode,
  });
}
