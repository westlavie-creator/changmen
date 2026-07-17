/**
 * A8 esport 客户端 — 已停用（不再请求 api.a8.to/esport）。
 * TF 等凭证改走 platforms.json / env。
 */
const DISABLED = "A8 esport 已停用（不再使用 api.a8.to/esport）";

export async function loginEsportSession() {
  throw new Error(DISABLED);
}

export async function fetchCollectPlatform() {
  throw new Error(DISABLED);
}

export async function fetchCollectGames() {
  throw new Error(DISABLED);
}

export async function fetchCollectPlatformWithGames() {
  throw new Error(DISABLED);
}

export function clearEsportClientCache() {}

export const A8_ESPORT_BASE = "";
