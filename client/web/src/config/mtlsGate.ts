/**
 * 登录门：客户端证书（mTLS）门控。
 * 生产：依赖 Caddy 在 :443 注入 X-Changmen-Client-Cert；HTTP 无证。
 * DEV：默认跳过（与插件门一致）；VITE_SKIP_CERT_GATE=0 强制检测。
 */

/** DEV 本地联调默认跳过证书门 */
export function skipCertGate(): boolean {
  if (!import.meta.env.DEV)
    return false;
  const flag = import.meta.env.VITE_SKIP_CERT_GATE;
  if (flag === "0" || flag === "false")
    return false;
  return true;
}
