/** 服务端管理员 Telegram 通道（与客户端用户各自填 telegramId 的 SendMessage 独立） */

import { getTelegramBotToken, handleSendMessage } from "../esport-api/telegram_send.js";

export function getAdminChatId() {
  return String(process.env.TELEGRAM_ADMIN_CHAT_ID || "").trim();
}

/** 管理员通知总开关：需 TELEGRAM_BOT_TOKEN + TELEGRAM_ADMIN_CHAT_ID；TELEGRAM_ADMIN_NOTIFY=0 关闭全部 */
export function isAdminNotifyEnabled() {
  if (String(process.env.TELEGRAM_ADMIN_NOTIFY ?? "1").trim() === "0") return false;
  return Boolean(getTelegramBotToken() && getAdminChatId());
}

/**
 * @param {string} text
 * @param {string} [parseMode]
 */
export async function sendAdminNotify(text, parseMode = "HTML") {
  if (!isAdminNotifyEnabled()) {
    return { ok: false, msg: "未启用服务端管理员 Telegram 通知" };
  }
  return handleSendMessage({
    chat_id: getAdminChatId(),
    text,
    parse_mode: parseMode,
  });
}
