import { PLATFORMS } from "../platforms.js";

/**
 * dexsport.io 页：注册 tabId + 代理 HTTP 请求 + 凭证读取
 * 网络拦截器由 manifest world:MAIN（dex-intercept.js）自动注入。
 * @param {(handler: (msg: unknown) => Promise<unknown>) => void} registerHandler
 */
export function initDexPage(registerHandler) {
  if (!location.hostname.includes("dexsport")) return;

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
  const hash = el.dataset.dexHash || "";
  const nickname = el.dataset.dexNickname || "";
  const jwt = el.dataset.dexAccessToken || "";
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
  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("json") ? await response.json() : await response.text();
  return { data, status: response.status, statusText: response.statusText };
}
