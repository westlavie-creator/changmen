export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 对齐 A8 bundle `m()` */
export function generateUuid(stripDash = false) {
  const id = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
  return stripDash ? id.replace(/-/g, "") : id;
}

export function getCookie(name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

import axios from "axios";

/** 对齐 A8 content：Stake tabId POST 走 axios.request，返回完整 AxiosResponse */
export function tabHttpPost(url, data, options = {}) {
  return axios.request({
    method: "POST",
    url,
    headers: options.headers,
    data,
    timeout: options.timeout,
    withCredentials: options.withCredentials !== false,
  });
}

/** chrome.runtime 无法克隆 axios 响应（config/request 含函数），只回传 A8 用到的 r.data */
export function toTabHttpResponse(response) {
  if (!response || typeof response !== "object")
    return response;
  const headers = response.headers;
  let plainHeaders = {};
  if (headers && typeof headers === "object") {
    plainHeaders = typeof headers.toJSON === "function" ? headers.toJSON() : { ...headers };
  }
  return {
    data: response.data,
    status: response.status,
    statusText: response.statusText,
    headers: plainHeaders,
  };
}

export async function postFormUrlEncoded(url, fields, headers = {}) {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) {
    body.set(k, String(v ?? ""));
  }
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", ...headers },
    body,
    credentials: "include",
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
