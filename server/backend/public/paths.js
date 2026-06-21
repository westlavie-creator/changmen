/**
 * backend/public 目录常量 — HTTP 仍走 /esport2/*（A8 兼容），磁盘按职责分目录。
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const PUBLIC_ROOT = __dirname;

/** A8 index.css、字体、背景图等（URL: /esport2/assets/…） */
export const ESPORT2_ASSETS_DIR = path.join(PUBLIC_ROOT, "assets");

/** Chrome 扩展 zip（URL: /esport2/extensions/{version}.zip） */
export const ESPORT2_EXTENSIONS_DIR = path.join(PUBLIC_ROOT, "extensions");

/** 扩展版本号（URL: /esport2/version.json） */
export const ESPORT2_VERSION_FILE = path.join(PUBLIC_ROOT, "version.json");

/**
 * 将 /esport2/* 请求路径映射为 public/ 下的相对路径。
 * @param {string} urlPath 以 /esport2 开头
 */
export function esport2UrlToFileRel(urlPath) {
  if (urlPath === "/esport2/version.json")
    return "version.json";
  if (urlPath.startsWith("/esport2/assets/")) {
    return `assets/${urlPath.slice("/esport2/assets/".length)}`;
  }
  if (urlPath.startsWith("/esport2/extensions/")) {
    return `extensions/${urlPath.slice("/esport2/extensions/".length)}`;
  }
  const tail = urlPath.replace(/^\/esport2\/?/, "");
  return tail || "index.html";
}
