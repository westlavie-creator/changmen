/**
 * Matcher 运行时参数（唯一读取 env 的位置）。
 * 改间隔、端口等只改此处与 apps/backend/.env.example 说明。
 */

import { DEFAULT_PRUNE_INTERVAL_MS } from "../../../packages/shared/db/prune_stale.js";

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

export const MATCHER_SKIP_AUTH =
  String(process.env.MATCHER_SKIP_AUTH || "").trim() === "1";
