/**
 * 写 client_matches + 对齐 post-hooks。
 * active 写 ended_at=NULL（DB sticky 不会清已有 ended_at）；
 * 新判定 ended 全量 UPSERT（endedRows）；
 * markEndedIds：sources-gone 的 active gap（或 sticky 再确认）；
 * 不用「本拍未合出」整表差量归档（M1 / #1669）。
 */
import * as db from "@changmen/db";
import { clientMatchWriteRow } from "../write_payload.js";

/**
 * @param {object[]} info 活跃行
 * @param {number} [builtAt]
 * @param {{ endedRows?: object[], markEndedIds?: number[], stickyEndedIds?: Set<number>|number[] }} [opts]
 */
export async function writeClientMatches(info, builtAt = Date.now(), opts = {}) {
  if (!db.isMatcherStoreReady())
    throw new Error("MATCH_COMPOSER_WRITE=1 但数据库未配置");

  const stickyEndedIds = new Set(
    [...(opts.stickyEndedIds || [])].map(Number).filter(id => Number.isFinite(id) && id > 0),
  );
  const endedRowsRaw = Array.isArray(opts.endedRows) ? opts.endedRows : [];
  const newlyEnded = [];
  const stickyOnlyIds = [];
  for (const m of endedRowsRaw) {
    const id = Number(m.ID);
    if (!Number.isFinite(id) || id <= 0)
      continue;
    if (stickyEndedIds.has(id))
      stickyOnlyIds.push(id);
    else
      newlyEnded.push(clientMatchWriteRow(m, builtAt, { endedAt: builtAt }));
  }

  const activeRows = (info || [])
    .filter(m => Number.isFinite(Number(m.ID)) && Number(m.ID) > 0)
    .map(m => clientMatchWriteRow(m, builtAt, { endedAt: null }));

  await db.writeClientMatchesAsync({
    activeRows,
    endedRows: newlyEnded,
    markEndedIds: [...(opts.markEndedIds || []), ...stickyOnlyIds],
    builtAt,
  });

  try {
    const { setClientMatchesFromMatchMerge } = await import(
      "../../../../backend/core/db/store.js"
    );
    const { isEmbeddedMatcher } = await import(
      "../../../../backend/core/shared/matcher_mode.js"
    );
    if (isEmbeddedMatcher())
      setClientMatchesFromMatchMerge(info, builtAt);
  }
  catch {
    /* 独立进程可不注入 */
  }

  try {
    const store = (await import("../../../../backend/core/esport-api/store.js")).default;
    const forPatch = [...(info || []), ...endedRowsRaw];
    store.patchCollectorMatchClientIds?.(forPatch);
  }
  catch (err) {
    console.warn("[match-composer] patchCollectorMatchClientIds:", err.message);
  }

  return { wrote: true, builtAt };
}
