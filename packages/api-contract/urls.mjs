/** @changmen/api-contract — esport URL 拼装（浏览器与 Node 脚本共用） */

export const ESPORT_PATH_PREFIX = "/esport";

export const HTTP_RELAY_SUFFIX = `${ESPORT_PATH_PREFIX}/http-relay`;

/**
 * @param {string | null | undefined} base
 * @returns {string}
 */
export function normalizeApiBase(base) {
  if (base == null || !String(base).trim())
    return "";
  return String(base).replace(/\/+$/, "");
}

/**
 * @param {string} action
 * @param {string} [query]
 * @returns {string}
 */
export function buildEsportPath(action, query = "") {
  return `${ESPORT_PATH_PREFIX}/${action}${query}`;
}

/**
 * @param {string} action
 * @param {string} [query]
 * @param {string | null | undefined} [apiBase] 如 https://api.example.com；空则返回相对路径
 * @returns {string}
 */
export function buildEsportUrl(action, query = "", apiBase) {
  const path = buildEsportPath(action, query);
  const base = normalizeApiBase(apiBase);
  return base ? `${base}${path}` : path;
}

/**
 * A8 对齐：localStorage PROXY 或 VITE_API_BASE 落到 http-relay。
 *
 * @param {{ apiBase?: string, proxyOrigin?: string }} [opts]
 * @returns {string}
 */
export function buildHttpRelayUrl(opts = {}) {
  const relay = HTTP_RELAY_SUFFIX;
  const origin = normalizeApiBase(opts.proxyOrigin) || normalizeApiBase(opts.apiBase);
  if (!origin)
    return relay;
  if (origin.endsWith(relay))
    return origin;
  return `${origin}${relay}`;
}
