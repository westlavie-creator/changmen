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

/** 有 x-app-data 或内层会话头即可代发（不限 /sports 路径） */
export function hasPbPageSession(store = readLocalStorageSnapshot()) {
  const bag = store && typeof store === "object" ? store : {};
  if (bag["x-app-data"]) return true;
  try {
    const token = JSON.parse(bag.token || "");
    if (
      token
      && typeof token === "object"
      && (token["X-Browser-Session-Id"] || token["X-Custid"])
    ) {
      return true;
    }
  }
  catch {
    /* ignore */
  }
  return false;
}

function decodePbCustidRaw(raw) {
  try {
    return decodeURIComponent(String(raw).replace(/\+/g, "%20"));
  }
  catch {
    return String(raw || "");
  }
}

function custidMemberId(custidDecoded) {
  const id = new URLSearchParams(custidDecoded).get("id");
  return id != null ? String(id).trim() : "";
}

function tryParseJsonObject(raw) {
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" && !Array.isArray(v) ? v : undefined;
  }
  catch {
    return undefined;
  }
}

function decodeBase64Utf8(raw) {
  try {
    const bin = atob(String(raw).replace(/\s+/g, ""));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }
  catch {
    return "";
  }
}

/**
 * 从官网 localStorage 快照解析会员 ID（与 venue-adapter parsePbVenueIdentity 对齐）。
 * @param {Record<string, string> | Storage} [store]
 * @returns {{ venueMemberId: string; venueAccountName: string } | undefined}
 */
export function parsePbPageVenueIdentity(store = readLocalStorageSnapshot()) {
  const bag = store && typeof store === "object" ? store : {};
  let app = {};
  try {
    app = JSON.parse(bag["x-app-data"] || "{}") || {};
  }
  catch {
    app = {};
  }
  const mode = detectPbPageSessionMode(bag);
  const custidRaw = mode.kind === "plain"
    ? (app.custid || bag.custid || "")
    : (app[`custid_${mode.suffix}`] || bag[`custid_${mode.suffix}`] || "");
  const fromCustid = custidMemberId(decodePbCustidRaw(custidRaw));

  let fromInnerCustid = "";
  try {
    const inner = JSON.parse(bag.token || "{}");
    const innerCustid = mode.kind === "plain"
      ? (inner["X-Custid"] || inner["x-custid"] || "")
      : (inner[`X-Custid-${mode.suffix}`] || inner[`x-custid-${mode.suffix}`] || "");
    fromInnerCustid = custidMemberId(decodePbCustidRaw(innerCustid));
  }
  catch {
    /* optional */
  }

  const udata = tryParseJsonObject(decodeBase64Utf8(bag.__udata || ""));
  const a = tryParseJsonObject(decodeBase64Utf8(bag.a || ""));
  const userCode = String(udata?.userCode ?? "").trim();
  const loginId = String(udata?.loginId ?? a?.loginId ?? "").trim();
  const venueMemberId = userCode || fromCustid || fromInnerCustid;
  const venueAccountName = loginId || venueMemberId;
  if (!venueMemberId && !venueAccountName)
    return undefined;
  return {
    venueMemberId: venueMemberId || venueAccountName,
    venueAccountName: venueAccountName || venueMemberId,
  };
}

export function pbVenueMemberIdsEqual(left, right) {
  const a = String(left || "").trim();
  const b = String(right || "").trim();
  if (!a || !b)
    return false;
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * 官网当前登录必须等于账号绑定的会员，否则拒发（防止换号串单）。
 * @param {Record<string, string> | Storage} store
 * @param {string} [expectedMemberId]
 */
export function assertPbLiveTabMember(store, expectedMemberId) {
  const expected = String(expectedMemberId || "").trim();
  if (!expected)
    return;
  const pageId = parsePbPageVenueIdentity(store)?.venueMemberId || "";
  if (!pageId) {
    throw new Error(`平博官网登录账号无法识别，绑定 ${expected}，请刷新并登录正确账号`);
  }
  if (!pbVenueMemberIdsEqual(pageId, expected)) {
    throw new Error(`平博官网登录账号不一致：页面 ${pageId}，绑定 ${expected}`);
  }
}
