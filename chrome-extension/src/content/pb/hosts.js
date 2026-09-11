/**
 * [changmen 扩展] PB 投注账号 referer/gateway 主机。
 * A8 Check/GetConfig 不走这里。
 */

export const PB_ACCOUNT_HOSTS_KEY = "pbAccountHosts";

export function pbHostFromUrl(raw = "") {
  const text = String(raw || "").trim();
  if (!text) return "";
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`);
    return url.hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return "";
  }
}

export function normalizePbAccountHosts(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const out = [];
  const seen = new Set();
  for (const item of list) {
    const host = pbHostFromUrl(typeof item === "string" ? item : String(item || ""));
    if (!host || seen.has(host)) continue;
    seen.add(host);
    out.push(host);
  }
  return out;
}

export function hostnameMatchesPbAccountHosts(hostname, hosts) {
  const h = String(hostname || "").toLowerCase().replace(/\.$/, "");
  if (!h || !Array.isArray(hosts) || !hosts.length) return false;
  for (const host of hosts) {
    if (h === host || h.endsWith(`.${host}`) || host.endsWith(`.${h}`))
      return true;
  }
  return false;
}

/** 本 frame 或同域父页主机命中账号 referer/gateway */
export function pageMatchesPbAccountHosts(
  hosts,
  win = typeof window !== "undefined" ? window : undefined,
) {
  if (!win) return false;
  try {
    if (hostnameMatchesPbAccountHosts(win.location.hostname, hosts)) return true;
  } catch {
    /* ignore */
  }
  try {
    if (win !== win.top && win.top
        && hostnameMatchesPbAccountHosts(win.top.location.hostname, hosts))
      return true;
  } catch {
    /* cross-origin */
  }
  return false;
}

export function pbApexHost(host) {
  const h = String(host || "").toLowerCase().replace(/\.$/, "");
  return h.startsWith("www.") ? h.slice(4) : h;
}

export function tabUrlPatternsForPbHosts(hosts) {
  const patterns = [];
  const seen = new Set();
  const add = (pattern) => {
    if (!pattern || seen.has(pattern)) return;
    seen.add(pattern);
    patterns.push(pattern);
  };
  for (const host of normalizePbAccountHosts(hosts)) {
    const apex = pbApexHost(host);
    add(`*://${host}/*`);
    add(`*://${apex}/*`);
    if (apex.includes("."))
      add(`*://*.${apex}/*`);
  }
  return patterns;
}
