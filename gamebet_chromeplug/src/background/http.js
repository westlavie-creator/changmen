/**
 * 对齐 A8 background `ht.request(...)` — axios 代发 HTTP
 */
import axios from "axios";

/** @typedef {{ tabId?: number; headers?: Record<string, string>; timeout?: number; withCredentials?: boolean }} TabRequestOptions */
/** @typedef {{ type?: string; url?: string; data?: unknown; options?: TabRequestOptions }} HttpMessage */

/**
 * @param {HttpMessage} message
 * @returns {Promise<import("axios").AxiosResponse>}
 */
export function axiosRequest(message) {
  const method = (message.type || "GET").toUpperCase();
  const url = message.url;
  if (!url) throw new Error("缺少 url");

  const withCredentials = message.options?.withCredentials !== false;

  return axios.request({
    method,
    url,
    headers: message.options?.headers,
    timeout: message.options?.timeout,
    withCredentials,
    data: message.data,
  });
}
