/** PB auth headers — 从 client/venue-adapter/pb/auth.ts 复制，供 Node 脚本直连 PB API */

/** @typedef {{ kind: 'suffixed', suffix: string } | { kind: 'plain' }} PbSessionMode */

function detectPbSessionMode(appData, outer) {
  for (const key of Object.keys(appData || {})) {
    const m = key.match(/^BrowserSessionId_(\d+)$/);
    if (m)
      return { kind: "suffixed", suffix: m[1] };
  }
  for (const key of Object.keys(appData || {})) {
    const m = key.match(/^custid_(\d+)$/);
    if (m)
      return { kind: "suffixed", suffix: m[1] };
  }
  for (const key of Object.keys(outer || {})) {
    const m = key.match(/^custid_(\d+)$/);
    if (m)
      return { kind: "suffixed", suffix: m[1] };
  }
  if (
    appData?.BrowserSessionId
    || appData?.custid
    || outer?.custid
    || hasPlainTokenHeaders(outer?.token)
  ) {
    return { kind: "plain" };
  }
  return { kind: "suffixed", suffix: "515" };
}

function hasPlainTokenHeaders(tokenRaw) {
  if (!tokenRaw)
    return false;
  try {
    const inner = JSON.parse(tokenRaw);
    return Boolean(inner?.["X-Browser-Session-Id"] || inner?.["X-Custid"]);
  }
  catch {
    return false;
  }
}

function resolveCustidRaw(mode, appData, outer) {
  if (mode.kind === "plain")
    return appData.custid || outer.custid || "";
  const suffix = mode.suffix;
  return (
    appData[`custid_${suffix}`]
    || outer[`custid_${suffix}`]
    || outer.custid_515
    || ""
  );
}

function resolveBrowserSessionId(mode, appData) {
  if (mode.kind === "plain")
    return appData.BrowserSessionId || "";
  return appData[`BrowserSessionId_${mode.suffix}`] || "";
}

function decodePbCustidRaw(raw) {
  try {
    return decodeURIComponent(String(raw).replace(/\+/g, "%20"));
  }
  catch {
    return String(raw || "");
  }
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

function mergeInnerTokenHeaders(headers, outer) {
  const innerRaw = outer.token;
  if (!innerRaw)
    return;
  try {
    const inner = JSON.parse(innerRaw);
    for (const [key, value] of Object.entries(inner)) {
      if (value == null || value === "")
        continue;
      headers[key.toLowerCase()] = String(value);
    }
  }
  catch {
    /* optional */
  }
}

function normalizePbOuterToken(token) {
  const text = String(token ?? "").trim();
  if (!text)
    return undefined;
  let parsed = tryParseJsonObject(text);
  if (!parsed) {
    try {
      parsed = tryParseJsonObject(Buffer.from(text.replace(/\s+/g, ""), "base64").toString("utf8"));
    }
    catch {
      return undefined;
    }
  }
  if (!parsed)
    return undefined;
  if (typeof parsed.token === "string" && (parsed.provider || parsed.gateway || parsed.referer)) {
    const inner = tryParseJsonObject(parsed.token);
    if (inner)
      return { outer: parsed, cookie: inner };
  }
  if (parsed["x-app-data"])
    return { outer: parsed, cookie: parsed };
  return undefined;
}

export function buildPbAuthHeaders(account, extra = {}) {
  if (account.token == null)
    return undefined;
  try {
    const norm = normalizePbOuterToken(account.token);
    const outer = norm?.outer ?? tryParseJsonObject(account.token);
    if (!outer)
      return undefined;
    const appData = tryParseJsonObject(outer["x-app-data"] || "{}") || {};
    const mode = detectPbSessionMode(appData, outer);
    const sessionId = resolveBrowserSessionId(mode, appData);
    const custidRaw = resolveCustidRaw(mode, appData, outer);
    const headers = {
      "x-app-data": `${Object.keys(appData).map(k => `${k}=${appData[k]}`).join(";")};`,
    };
    if (mode.kind === "plain") {
      headers["x-browser-session-id"] = sessionId;
      headers["x-custid"] = decodePbCustidRaw(String(custidRaw)) || "";
    }
    else {
      const suffix = mode.suffix;
      headers[`x-browser-session-id-${suffix}`] = sessionId;
      headers[`x-custid-${suffix}`] = decodePbCustidRaw(String(custidRaw)) || "";
    }
    headers["v-hucode"] = outer["v-hucode"] || "";
    headers["x-requested-with"] = "XMLHttpRequest";
    mergeInnerTokenHeaders(headers, outer);
    for (const key of Object.keys(extra))
      headers[key] = extra[key];
    return headers;
  }
  catch {
    return undefined;
  }
}
