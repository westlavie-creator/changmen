/**
 * PB 插件复制前校验：localStorage 快照是否具备下注/预检所需会话头。
 * part888/ps3838（plain）缺内层 X-U 时场馆 all-odds-selections 回 {"error":403}。
 */

/**
 * @param {Record<string, string>} snapshot localStorage 键值快照
 * @returns {string | null} 错误文案；null 表示可复制
 */
export function validatePbLocalStorageSnapshot(snapshot) {
  const store = snapshot && typeof snapshot === "object" ? snapshot : {};
  const appRaw = store["x-app-data"];
  if (!appRaw) {
    return "缺少 x-app-data：请在已登录的平博页再复制";
  }

  let app;
  try {
    app = JSON.parse(appRaw);
  }
  catch {
    return "x-app-data 无法解析：请刷新平博页后重试";
  }
  if (!app || typeof app !== "object") {
    return "x-app-data 无效：请重新登录后再复制";
  }

  let suffix = null;
  for (const key of Object.keys(app)) {
    const m = key.match(/^BrowserSessionId_(\d+)$/);
    if (m) {
      suffix = m[1];
      break;
    }
  }
  if (suffix == null) {
    for (const key of Object.keys(app)) {
      const m = key.match(/^custid_(\d+)$/);
      if (m) {
        suffix = m[1];
        break;
      }
    }
  }

  const plain = Boolean(app.BrowserSessionId || app.custid);
  if (suffix) {
    if (!app[`BrowserSessionId_${suffix}`]) {
      return `缺少 BrowserSessionId_${suffix}：请重新登录后再复制`;
    }
    if (!app[`custid_${suffix}`] && !store[`custid_${suffix}`]) {
      return `缺少 custid_${suffix}：请重新登录后再复制`;
    }
  }
  else if (plain) {
    if (!app.BrowserSessionId) {
      return "缺少 BrowserSessionId：请重新登录后再复制";
    }
    if (!app.custid) {
      return "缺少 custid：请重新登录后再复制";
    }
  }
  else {
    return "未识别到登录会话（BrowserSessionId / custid）：请重新登录后再复制";
  }

  let inner;
  try {
    inner = JSON.parse(store.token || "");
  }
  catch {
    inner = null;
  }
  if (!inner || typeof inner !== "object" || Array.isArray(inner)) {
    return "缺少内层 token（含 X-U）：会话未写全，请刷新/重新登录平博后再复制（否则预检会 403）";
  }

  if (suffix) {
    const xu =
      inner[`X-U-${suffix}`]
      || inner[`x-u-${suffix}`]
      || inner["X-U"]
      || inner["x-u"];
    if (!String(xu || "").trim()) {
      return `缺少内层 X-U-${suffix}（或 X-U）：请重新登录后再复制（否则预检会 403）`;
    }
  }
  else if (!String(inner["X-U"] || inner["x-u"] || "").trim()) {
    return "缺少内层 X-U：请重新登录后再复制（否则预检会 403）";
  }

  return null;
}
