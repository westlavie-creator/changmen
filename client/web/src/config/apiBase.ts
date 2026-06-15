/**
 * 生产/预览：API 根地址（不含尾部斜杠）。
 * 空 = 同源相对路径 `/esport/...`（推荐同源部署）。
 *
 * 分离部署示例：VITE_API_BASE=https://api.example.com
 */
export function getApiBase(): string {
  const raw = import.meta.env.VITE_API_BASE;
  return raw && String(raw).trim() ? String(raw).trim().replace(/\/+$/, "") : "";
}
