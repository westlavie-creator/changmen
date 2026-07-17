/**
 * A8 v4 HTTP 客户端 — 已停用（不再请求 api.a8.to）。
 * 保留导出供历史引用编译；调用即抛错。
 */
import { A8_FORWARD_SITE } from "./constants.js";

const DISABLED = "v4 信用盘已停用（不再使用 api.a8.to）";

export function buildFormBody(fields) {
  return new URLSearchParams(fields).toString();
}

export function v4Headers(extra = {}) {
  return {
    "Content-Type": "application/x-www-form-urlencoded;",
    ...extra,
  };
}

export async function requestV4() {
  throw new Error(DISABLED);
}

export async function loginV4() {
  throw new Error(DISABLED);
}

export async function playLoginV4() {
  throw new Error(DISABLED);
}

export { A8_FORWARD_SITE };
export const A8_V4_BASE = "";
