import { DEFAULT_CLIENT_MATCH_ARCHIVE_INTERVAL_MS } from "@changmen/db";

const DEFAULT_INTERVAL_MS = 30_000;

export const PROJECTOR_INTERVAL_MS = Number(
  process.env.MATCH_PROJECTOR_INTERVAL_MS
  || process.env.MATCHER_INTERVAL_MS
  || DEFAULT_INTERVAL_MS,
);

export const PROJECTOR_ARCHIVE_INTERVAL_MS = Number(
  process.env.MATCH_PROJECTOR_ARCHIVE_INTERVAL_MS
  || process.env.MATCHER_CLIENT_MATCH_ARCHIVE_INTERVAL_MS
  || process.env.MATCHER_PRUNE_INTERVAL_MS
  || DEFAULT_CLIENT_MATCH_ARCHIVE_INTERVAL_MS,
);

/** 1 = 写 client_matches；默认 0 只预览/diff，避免与旧 matcher 双写 */
export function isProjectorWriteEnabled() {
  return String(process.env.MATCH_PROJECTOR_WRITE || "").trim() === "1";
}
