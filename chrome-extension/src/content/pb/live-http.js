/**
 * [changmen 扩展] 平博标签页代发：现读 localStorage + Cookie。
 * 515 页不注册，避免破坏 A8 k0。
 * 主机必须命中投注账号 referer/gateway。
 */
import { PLATFORMS } from "../platforms.js";
import {
  normalizePbAccountHosts,
  pageMatchesPbAccountHosts,
  PB_ACCOUNT_HOSTS_KEY,
} from "./hosts.js";
import {
  buildLivePbAuthHeaders,
  detectPbPageSessionMode,
  isPbA8K0PageSession,
  readLocalStorageSnapshot,
} from "./page-auth.js";
import axios from "axios";

function isSportsAppPath(pathname = location.pathname) {
  return /\/esports-hub\/|\/compact\/sports\/|\/sports(\/|$)/.test(String(pathname || ""));
}

function isTopFrame() {
  try {
    return window === window.top;
  }
  catch {
    return true;
  }
}

let accountHosts = [];

export function shouldRegisterPbLiveHttp(store = readLocalStorageSnapshot()) {
  if (!isTopFrame()) return false;
  if (!pageMatchesPbAccountHosts(accountHosts)) return false;
  if (!isSportsAppPath()) return false;
  if (!store["x-app-data"]) return false;
  return !isPbA8K0PageSession(detectPbPageSessionMode(store));
}

function requestHostMatchesPage(url) {
  try {
    const host = new URL(url, location.href).hostname;
    const here = location.hostname;
    return host === here || host.endsWith(`.${here}`) || here.endsWith(`.${host}`);
  }
  catch {
    return false;
  }
}

function liveHeaders(extra = {}) {
  return buildLivePbAuthHeaders(readLocalStorageSnapshot(), extra);
}

/** 与 GetConfig 同形：整包 localStorage JSON，供 changmen 回写 account.token */
function publishLiveCredential() {
  if (!shouldRegisterPbLiveHttp()) return;
  const snapshot = readLocalStorageSnapshot();
  const mode = detectPbPageSessionMode(snapshot);
  if (isPbA8K0PageSession(mode)) return;
  try {
    chrome.runtime.sendMessage(
      {
        type: "pbLiveCredential",
        data: {
          token: JSON.stringify(snapshot),
          gateway: `https://${location.host}`,
          referer: location.href,
          capturedAt: Date.now(),
        },
      },
      () => { void chrome.runtime.lastError; },
    );
  }
  catch {
    /* ignore */
  }
}

/**
 * @param {{ type?: string; url?: string; data?: unknown; options?: { headers?: Record<string, string>; timeout?: number; withCredentials?: boolean } }} message
 */
export async function handlePbLiveTabMessage(message) {
  const method = String(message?.type || "GET").toUpperCase();
  if (method !== "GET" && method !== "POST" && method !== "DELETE")
    return undefined;
  const url = message.url;
  if (!url) return undefined;
  if (!shouldRegisterPbLiveHttp())
    throw new Error("PB 标签页不是平博活会话");
  if (!requestHostMatchesPage(url))
    throw new Error("PB live tab host mismatch");

  const extra = message.options?.headers || {};
  const headers = liveHeaders(extra);
  const result = await axios.request({
    method,
    url,
    headers,
    timeout: message.options?.timeout,
    withCredentials: message.options?.withCredentials !== false,
    data: message.data,
  });
  publishLiveCredential();
  return result;
}

/**
 * @param {(handler: typeof handlePbLiveTabMessage) => void} registerHandler
 */
export function initPbLiveHttp(registerHandler) {
  let registered = false;
  const tryReg = () => {
    if (registered || !shouldRegisterPbLiveHttp()) return registered;
    registerHandler(handlePbLiveTabMessage);
    registered = true;
    try {
      chrome.runtime.sendMessage(
        { type: "setTab", uuid: Date.now().toString(), data: { key: PLATFORMS.PB } },
        () => { void chrome.runtime.lastError; },
      );
    }
    catch {
      /* ignore */
    }
    publishLiveCredential();
    setInterval(publishLiveCredential, 10_000);
    return true;
  };
  const applyHosts = (raw) => {
    accountHosts = normalizePbAccountHosts(raw);
    tryReg();
  };
  chrome.storage.local.get([PB_ACCOUNT_HOSTS_KEY], (items) => {
    applyHosts(items?.[PB_ACCOUNT_HOSTS_KEY]);
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[PB_ACCOUNT_HOSTS_KEY]) return;
    applyHosts(changes[PB_ACCOUNT_HOSTS_KEY].newValue);
  });
  window.addEventListener("focus", tryReg);
  document.addEventListener("visibilitychange", tryReg);
  window.addEventListener("popstate", tryReg);
}
