/**
 * Matcher 运行时参数（唯一读取 env 的位置）。
 * 改间隔、端口等只改此处与 server/backend/.env.example 说明。
 */

import { DEFAULT_PRUNE_INTERVAL_MS } from "@changmen/db";

const DEFAULT_MATCHER_INTERVAL_MS = 30_000;
const DEFAULT_UI_PORT = 4567;

export const MATCHER_INTERVAL_MS = Number(
  process.env.MATCHER_INTERVAL_MS || DEFAULT_MATCHER_INTERVAL_MS,
);

export const MATCHER_PRUNE_INTERVAL_MS = Number(
  process.env.MATCHER_PRUNE_INTERVAL_MS || DEFAULT_PRUNE_INTERVAL_MS,
);

export const MATCHER_UI_PORT = Number(
  process.env.MATCHER_UI_PORT || process.env.PIPEI_PORT || DEFAULT_UI_PORT,
);

/** 仅开发显式开启；须 NODE_ENV=development|test，生产或未设置 NODE_ENV 时永远无效 */
export function isMatcherSkipAuthEnabled() {
  if (String(process.env.MATCHER_SKIP_AUTH || "").trim() !== "1") return false;
  const nodeEnv = String(process.env.NODE_ENV || "").trim().toLowerCase();
  return nodeEnv === "development" || nodeEnv === "test";
}
