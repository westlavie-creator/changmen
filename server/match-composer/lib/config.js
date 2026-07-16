import { DEFAULT_CLIENT_MATCH_ARCHIVE_INTERVAL_MS } from "@changmen/db";

const DEFAULT_INTERVAL_MS = 30_000;

export const COMPOSER_INTERVAL_MS = Number(
  process.env.MATCH_COMPOSER_INTERVAL_MS
  || process.env.MATCHER_INTERVAL_MS
  || DEFAULT_INTERVAL_MS,
);

export const COMPOSER_ARCHIVE_INTERVAL_MS = Number(
  process.env.MATCH_COMPOSER_ARCHIVE_INTERVAL_MS
  || process.env.MATCHER_CLIENT_MATCH_ARCHIVE_INTERVAL_MS
  || DEFAULT_CLIENT_MATCH_ARCHIVE_INTERVAL_MS,
);

/** 1 = 写 client_matches；默认 dry-run */
export function isComposerWriteEnabled() {
  return String(process.env.MATCH_COMPOSER_WRITE || "").trim() === "1";
}

export function isComposerStickyOrientation() {
  // 兼容运维已设的 MATCH_PROJECTOR_STICKY_ORIENTATION
  const v = process.env.MATCH_COMPOSER_STICKY_ORIENTATION
    || process.env.MATCH_PROJECTOR_STICKY_ORIENTATION
    || "";
  return String(v).trim() === "1";
}

export function isComposerForceReanchor() {
  const v = process.env.MATCH_COMPOSER_REANCHOR
    || process.env.MATCH_PROJECTOR_REANCHOR
    || "";
  return String(v).trim() === "1";
}
