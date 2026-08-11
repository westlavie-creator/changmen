/**
 * 曾把客户端下单提醒抄送 TELEGRAM_ADMIN_CHAT_ID。
 * 已停：管理员不再收这份；旧前端仍会打 Client_NotifyAdminTelegram，这里直接吞掉。
 */

/**
 * @param {Record<string, unknown>} _body
 * @param {{ id?: string, userName?: string } | null | undefined} user
 * @returns {Promise<{ ok: true, skipped?: boolean } | { ok: false, msg: string }>}
 */
export async function handleClientNotifyAdminTelegram(_body, user) {
  if (!user?.id)
    return { ok: false, msg: "未登录" };
  return { ok: true, skipped: true };
}
