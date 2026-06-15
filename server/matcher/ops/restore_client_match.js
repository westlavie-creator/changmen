import "../lib/env.js";
import { rebuildOnce } from "./rebuild.js";
import * as db from "@changmen/db";
import { CLIENT_MATCH_LIST_HIDDEN, CLIENT_MATCH_LIST_DEFAULT } from "@changmen/db";

/**
 * 恢复已隐藏的 client_matches：list_status 改回 0，并 rebuild。
 */

async function restoreClientMatch(clientMatchId) {
  const cmId = Number(clientMatchId);
  if (!Number.isFinite(cmId)) throw new Error("无效的赛事 ID");

  const cm = await db.fetchClientMatchRow(cmId, "id, title, matchs, list_status");
  if (!cm) throw new Error("赛事不存在");
  if (Number(cm.list_status) !== CLIENT_MATCH_LIST_HIDDEN) {
    return {
      ok: true,
      id: cmId,
      title: cm.title || "",
      list_status: Number(cm.list_status) || CLIENT_MATCH_LIST_DEFAULT,
      alreadyVisible: true,
      rebuild: null,
    };
  }

  const restored = await db.setClientMatchListStatus(cmId, CLIENT_MATCH_LIST_DEFAULT);
  const rebuild = await rebuildOnce();

  return {
    ok: true,
    id: cmId,
    title: cm.title || "",
    list_status: restored.list_status,
    rebuild,
  };
}

export { restoreClientMatch };
