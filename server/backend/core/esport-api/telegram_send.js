/** Telegram Bot API — 对齐 A8 前端 `SendMessage`（chat_id + text + parse_mode） */

const TELEGRAM_API = "https://api.telegram.org";
const MAX_TEXT_LEN = 4096;
const CHAT_ID_RE = /^-?\d{1,20}$/;

export function getTelegramBotToken() {
  return String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
}

export function isValidChatId(chatId) {
  const s = String(chatId ?? "").trim();
  return CHAT_ID_RE.test(s);
}

/**
 * @param {Record<string, unknown>} body
 * @returns {Promise<{ ok: true } | { ok: false; msg: string }>}
 */
export async function handleSendMessage(body) {
  const token = getTelegramBotToken();
  if (!token) {
    return { ok: false, msg: "未配置 TELEGRAM_BOT_TOKEN，请在 server/backend/.env 设置 Bot Token" };
  }

  const chatId = body.chat_id ?? body.chatId;
  const text = body.text;
  const parseMode = body.parse_mode ?? body.parseMode;

  if (chatId == null || String(chatId).trim() === "") {
    return { ok: false, msg: "缺少 chat_id" };
  }
  if (!isValidChatId(chatId)) {
    return { ok: false, msg: "chat_id 格式无效" };
  }
  if (typeof text !== "string" || !text.trim()) {
    return { ok: false, msg: "缺少 text" };
  }
  if (text.length > MAX_TEXT_LEN) {
    return { ok: false, msg: `text 超过 ${MAX_TEXT_LEN} 字符` };
  }

  const payload = {
    chat_id: String(chatId).trim(),
    text,
  };
  if (parseMode != null && String(parseMode).trim()) {
    payload.parse_mode = String(parseMode).trim();
  }

  try {
    const res = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok === true) {
      return { ok: true };
    }
    const desc =
      (data.description && String(data.description)) ||
      (data.error_code ? `Telegram error ${data.error_code}` : "") ||
      `HTTP ${res.status}`;
    return { ok: false, msg: desc };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, msg: msg || "Telegram 请求失败" };
  }
}
