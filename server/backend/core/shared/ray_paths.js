/** RAY gateway 可能带 /v2 后缀（采集）或不带（账号凭证）；统一拼 API 路径 */
export function rayApiPath(gateway, apiPath) {
  const base = String(gateway || "").replace(/\/+$/, "");
  let p = String(apiPath || "").replace(/^\//, "");
  if (base.endsWith("/v2")) {
    p = p.replace(/^v2\//, "");
    return `/${p}`;
  }
  if (p.startsWith("v2/"))
    return `/${p}`;
  return `/v2/${p}`;
}

export function rayApiUrl(gateway, apiPath) {
  const base = String(gateway || "").replace(/\/+$/, "");
  return `${base}${rayApiPath(gateway, apiPath)}`;
}
