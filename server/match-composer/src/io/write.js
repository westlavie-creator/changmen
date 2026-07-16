/**
 * 写 client_matches + 对齐 post-hooks。
 */
import * as db from "@changmen/db";
import { clientMatchWriteRow } from "../write_payload.js";

export async function writeClientMatches(info, builtAt = Date.now()) {
  if (!db.isMatcherStoreReady())
    throw new Error("MATCH_COMPOSER_WRITE=1 但数据库未配置");
  await db.writeClientMatchesAsync(
    info.map(m => clientMatchWriteRow(m, builtAt)),
  );

  try {
    const { setClientMatchesFromMatchMerge } = await import(
      "../../backend/core/db/store.js"
    );
    const { isEmbeddedMatcher } = await import(
      "../../backend/core/shared/matcher_mode.js"
    );
    if (isEmbeddedMatcher())
      setClientMatchesFromMatchMerge(info, builtAt);
  }
  catch {
    /* 独立进程可不注入 */
  }

  try {
    const store = (await import("../../backend/core/esport-api/store.js")).default;
    store.patchCollectorMatchClientIds?.(info);
  }
  catch (err) {
    console.warn("[match-composer] patchCollectorMatchClientIds:", err.message);
  }

  return { wrote: true, builtAt };
}
