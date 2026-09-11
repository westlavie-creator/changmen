/**
 * 从平博页 localStorage 现读会话头。
 * [A8 可证实] 515 不合并内层 X-U。
 * [changmen 扩展] plain / 非 515 合并 X-U，供标签页代发。
 */

/**
 * @param {Record<string, string> | Storage} store
 * @returns {{ kind: "suffixed"; suffix: string } | { kind: "plain" }}
 */
export function detectPbPageSessionMode(store) {
  const bag = store && typeof store === "object" ? store : {};
  let app = {};
  try {
    app = JSON.parse(bag["x-app-data"] || "{}") || {};
  }
  catch {
    app = {};
  }
  for (const key of Object.keys(app)) {
    const m = key.match(/^BrowserSessionId_(\d+)$/);
    if (m) return { kind: "suffixed", suffix: m[1] };
  }
  for (const key of Object.keys(app)) {
    const m = key.match(/^custid_(\d+)$/);
    if (m) return { kind: "suffixed", suffix: m[1] };
  }
  if (app.BrowserSessionId || app.custid || bag.custid)
    return { kind: "plain" };
  try {
    const inner = JSON.parse(bag.token || "");
    if (inner && (inner["X-Browser-Session-Id"] || inner["X-Custid"]))
      return { kind: "plain" };
  }
  catch {
    /* ignore */
  }
  return { kind: "suffixed", suffix: "515" };
}

/** @param {{ kind: string; suffix?: string }} mode */
export function isPbA8K0PageSession(mode) {
  return mode.kind === "suffixed" && mode.suffix === "515";
}

/**
 * @param {Record<string, string> | Storage} store
 * @param {Record<string, string>} [extra]
 * @returns {Record<string, string>}
 */
export function buildLivePbAuthHeaders(store, extra = {}) {
  const bag = store && typeof store === "object" ? store : {};
  let app = {};
  try {
    app = JSON.parse(bag["x-app-data"] || "{}") || {};
  }
  catch {
    app = {};
  }
  const mode = detectPbPageSessionMode(bag);
  /** @type {Record<string, string>} */
  const headers = {
    Accept: "application/json, text/plain, */*",
    "x-requested-with": "XMLHttpRequest",
  };
  const appKeys = Object.keys(app);
  if (appKeys.length)
    headers["x-app-data"] = `${appKeys.map((k) => `${k}=${app[k]}`).join(";")};`;

  if (mode.kind === "plain") {
    if (app.BrowserSessionId) headers["x-browser-session-id"] = String(app.BrowserSessionId);
    if (app.custid) headers["x-custid"] = decodeURIComponent(String(app.custid).replace(/\+/g, "%20"));
  }
  else {
    const suffix = mode.suffix;
    const sess = app[`BrowserSessionId_${suffix}`];
    const cust = app[`custid_${suffix}`] || bag[`custid_${suffix}`];
    if (sess) headers[`x-browser-session-id-${suffix}`] = String(sess);
    if (cust) headers[`x-custid-${suffix}`] = decodeURIComponent(String(cust).replace(/\+/g, "%20"));
  }
  if (bag["v-hucode"]) headers["v-hucode"] = String(bag["v-hucode"]);

  if (!isPbA8K0PageSession(mode)) {
    try {
      const inner = JSON.parse(bag.token || "");
      if (inner && typeof inner === "object" && !Array.isArray(inner)) {
        for (const [key, value] of Object.entries(inner)) {
          if (value == null || value === "") continue;
          const lower = String(key).toLowerCase();
          if (!lower.startsWith("x-")) continue;
          headers[lower] = String(value);
        }
      }
    }
    catch {
      /* optional */
    }
  }

  for (const [key, value] of Object.entries(extra || {})) {
    if (value == null || value === "") continue;
    const lower = String(key).toLowerCase();
    if (/^(x-u|x-browser-session-id|x-custid|x-app-data|x-slid|x-lcu|v-hucode)/.test(lower))
      continue;
    headers[key] = String(value);
  }
  return headers;
}

export function readLocalStorageSnapshot() {
  /** @type {Record<string, string>} */
  const snapshot = {};
  if (typeof localStorage === "undefined") return snapshot;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key) snapshot[key] = localStorage.getItem(key) ?? "";
  }
  return snapshot;
}
