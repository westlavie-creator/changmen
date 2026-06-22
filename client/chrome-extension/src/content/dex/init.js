import { PLATFORMS } from "../platforms.js";
import { injectDexInterceptor } from "./intercept.js";

/**
 * dexsport.io 页：注入 fetch 拦截器 + 注册 tabId + 代理 HTTP 请求
 * @param {(handler: (msg: unknown) => Promise<unknown>) => void} registerHandler
 */
export function initDexPage(registerHandler) {
  if (!location.hostname.includes("dexsport")) return;

  injectDexInterceptor();

  chrome.runtime.sendMessage(
    { type: "setTab", uuid: Date.now().toString(), data: { key: PLATFORMS.Dex } },
    (response) => {
      console.log("[Dex] tabId written =>", response?.response ?? response);
    },
  );

  registerHandler(handleDexMessage);
}

async function handleDexMessage(message) {
  const { type, url, data, options } = message || {};

  if (type === "GET" || type === "POST") {
    return proxyHttpRequest(type, url, data, options);
  }

  if (type === "getCredentials") {
    return getDexCredentials();
  }

  return null;
}

function getDexCredentials() {
  const el = document.documentElement;
  const jwt = el.dataset.dexAccessToken || "";
  const hash = el.dataset.dexHash || "";
  const nickname = el.dataset.dexNickname || "";
  const network = localStorage.getItem("main_network_name") || "";
  const currency = localStorage.getItem("main_currency_contract") || "";
  const sportsbookToken = hash ? `${hash}_${network}_${currency}_sportsbook` : "";

  return {
    jwt,
    hash,
    nickname,
    network,
    currency,
    sportsbookToken,
    gateway: "https://prod.dexsport.work",
    apiUrl: "https://dexsport.io/api",
  };
}

async function proxyHttpRequest(method, url, body, options) {
  const headers = { ...(options?.headers || {}) };

  if (!headers["Authorization"] && !headers["authorization"]) {
    const jwt = document.documentElement.dataset.dexAccessToken;
    if (jwt) {
      headers["Authorization"] = `Bearer ${jwt}`;
    }
  }

  const fetchOpts = { method, headers };
  if (method === "POST" && body) {
    if (!headers["content-type"] && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }
    fetchOpts.body = typeof body === "string" ? body : JSON.stringify(body);
  }

  const response = await fetch(url, fetchOpts);
  const data = await response.json();
  return { data, status: response.status, statusText: response.statusText };
}
