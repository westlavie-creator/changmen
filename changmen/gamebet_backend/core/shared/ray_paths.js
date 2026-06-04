"use strict";

/** RAY gateway 可能带 /v2 后缀（采集）或不带（账号凭证）；统一拼 API 路径 */
function rayApiPath(gateway, apiPath) {
  const base = String(gateway || "").replace(/\/+$/, "");
  let path = String(apiPath || "").replace(/^\//, "");
  if (base.endsWith("/v2")) {
    path = path.replace(/^v2\//, "");
    return `/${path}`;
  }
  if (path.startsWith("v2/")) return `/${path}`;
  return `/v2/${path}`;
}

function rayApiUrl(gateway, apiPath) {
  const base = String(gateway || "").replace(/\/+$/, "");
  return `${base}${rayApiPath(gateway, apiPath)}`;
}

module.exports = { rayApiPath, rayApiUrl };
