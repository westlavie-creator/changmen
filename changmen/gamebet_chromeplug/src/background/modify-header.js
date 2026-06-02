/** 对齐 A8 background：`ModifyHeader` + UA 改写（MV3 使用 declarativeNetRequest） */
export const MODIFY_HEADER_KEY = "ModifyHeader";

const RULE_ID_BASE = 10_000;
const MAX_RULES = 500;

/**
 * @param {string} urlPattern A8 `UrlPattern`（账号 gateway）
 * @returns {string}
 */
export function urlPatternToRegex(urlPattern) {
  const base = String(urlPattern || "").trim().replace(/\/+$/, "");
  if (!base) return "^$";
  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return `${escaped}(/.*)?`;
}

/**
 * @param {Array<{ UrlPattern?: string; UserAgent?: string }>} entries
 */
export async function applyModifyHeaderRules(entries) {
  const list = Array.isArray(entries) ? entries : [];
  const removeRuleIds = [];
  for (let i = 0; i < MAX_RULES; i += 1) {
    removeRuleIds.push(RULE_ID_BASE + i);
  }

  /** @type {chrome.declarativeNetRequest.Rule[]} */
  const addRules = [];
  list.slice(0, MAX_RULES).forEach((entry, index) => {
    const ua = String(entry?.UserAgent || "").trim();
    const pattern = String(entry?.UrlPattern || "").trim();
    if (!ua || !pattern) return;
    addRules.push({
      id: RULE_ID_BASE + index,
      priority: 1,
      action: {
        type: "modifyHeaders",
        requestHeaders: [{ header: "User-Agent", operation: "set", value: ua }],
      },
      condition: {
        regexFilter: urlPatternToRegex(pattern),
        resourceTypes: [
          "main_frame",
          "sub_frame",
          "xmlhttprequest",
          "websocket",
          "other",
          "script",
          "stylesheet",
          "image",
          "font",
          "media",
        ],
      },
    });
  });

  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules });
}

export async function refreshModifyHeaderFromStorage() {
  const stored = await chrome.storage.sync.get(MODIFY_HEADER_KEY);
  await applyModifyHeaderRules(stored[MODIFY_HEADER_KEY] ?? []);
}

export function initModifyHeaderListener() {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync" || !changes[MODIFY_HEADER_KEY]) return;
    void applyModifyHeaderRules(changes[MODIFY_HEADER_KEY].newValue ?? []);
  });
  void refreshModifyHeaderFromStorage();
}
