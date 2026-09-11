/**
 * [changmen 扩展] 平博标签页代发：现读 localStorage + Cookie。
 * 515 页不注册，避免破坏 A8 k0。
 * 每个已登录 frame 用长连接向 background 报 host，避免只打到顶层壳页。
 */
import { PLATFORMS } from "../platforms.js";
import {
  buildLivePbAuthHeaders,
  detectPbPageSessionMode,
  hasPbPageSession,
  isPbA8K0PageSession,
  readLocalStorageSnapshot,
} from "./page-auth.js";
import axios from "axios";

export const PB_LIVE_HTTP_PORT = "pb-live-http";

export function shouldRegisterPbLiveHttp(store = readLocalStorageSnapshot()) {
  if (!location.hostname) return false;
  if (!hasPbPageSession(store)) return false;
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
function snapshotLiveCredential() {
  if (!shouldRegisterPbLiveHttp()) return undefined;
  const snapshot = readLocalStorageSnapshot();
  const mode = detectPbPageSessionMode(snapshot);
  if (isPbA8K0PageSession(mode)) return undefined;
  return {
    token: JSON.stringify(snapshot),
    gateway: `https://${location.host}`,
    referer: location.href,
    capturedAt: Date.now(),
  };
}

function publishLiveCredential() {
  const payload = snapshotLiveCredential();
  if (!payload) return;
  try {
    chrome.runtime.sendMessage(
      {
        type: "pbLiveCredential",
        data: payload,
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
  const pbLiveCredential = snapshotLiveCredential();
  publishLiveCredential();
  // 同帧快照挂在 axios 响应对上，避免 storage 竞态把别的登录态当成校验源
  if (pbLiveCredential && result && typeof result === "object")
    return { ...result, pbLiveCredential };
  return result;
}

function connectLivePort() {
  let port;
  try {
    port = chrome.runtime.connect({ name: PB_LIVE_HTTP_PORT });
  }
  catch {
    return;
  }
  const hello = () => {
    try {
      port.postMessage({ kind: "hello", host: location.hostname, href: location.href });
    }
    catch {
      /* disconnected */
    }
  };
  hello();
  setTimeout(hello, 50);
  setTimeout(hello, 250);
  port.onMessage.addListener((msg) => {
    if (!msg || msg.kind !== "http") return;
    void handlePbLiveTabMessage(msg).then(
      (response) => {
        try {
          port.postMessage({ kind: "httpResult", uuid: msg.uuid, response });
        }
        catch {
          /* ignore */
        }
      },
      (err) => {
        try {
          port.postMessage({
            kind: "httpResult",
            uuid: msg.uuid,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        catch {
          /* ignore */
        }
      },
    );
  });
  port.onDisconnect.addListener(() => {
    setTimeout(connectLivePort, 400);
  });
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
        {
          type: "setTab",
          uuid: Date.now().toString(),
          data: { key: PLATFORMS.PB, host: location.hostname, href: location.href },
        },
        () => { void chrome.runtime.lastError; },
      );
    }
    catch {
      /* ignore */
    }
    connectLivePort();
    publishLiveCredential();
    setInterval(publishLiveCredential, 10_000);
    return true;
  };
  tryReg();
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "pbLiveTabPing") return false;
    tryReg();
    if (!registered) return false;
    sendResponse({ host: location.hostname, href: location.href });
    return true;
  });
  window.addEventListener("focus", tryReg);
  document.addEventListener("visibilitychange", tryReg);
  window.addEventListener("popstate", tryReg);
}
