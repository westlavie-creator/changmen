/**
 * client_matches.list_status — 是否进入浏览器 Client_GetMatchs 列表。
 * 未开始、进行中等均为默认 0；仅 -1 表示对浏览器隐藏。
 */

export const CLIENT_MATCH_LIST_HIDDEN = -1;

export const CLIENT_MATCH_LIST_DEFAULT = 0;

/** @param {number|null|undefined} listStatus */
export function isClientMatchListVisible(listStatus) {
  return Number(listStatus) !== CLIENT_MATCH_LIST_HIDDEN;
}
