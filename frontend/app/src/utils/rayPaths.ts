/** 与 backend/shared/ray_paths.js 保持一致 */
export function rayApiPath(gateway: string | undefined, apiPath: string): string {
  const base = String(gateway || "").replace(/\/+$/, "");
  let path = String(apiPath || "").replace(/^\//, "");
  if (base.endsWith("/v2")) {
    path = path.replace(/^v2\//, "");
    return `/${path}`;
  }
  if (path.startsWith("v2/")) return `/${path}`;
  return `/v2/${path}`;
}

export function rayApiUrl(gateway: string | undefined, apiPath: string): string {
  const base = String(gateway || "").replace(/\/+$/, "");
  return `${base}${rayApiPath(gateway, apiPath)}`;
}
