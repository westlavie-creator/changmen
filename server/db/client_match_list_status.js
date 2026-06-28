/**
 * Legacy compatibility constants for old diagnostic/tests.
 * Current RDS semantics: active client_matches rows are visible; hidden/expired rows
 * live in client_matches_history.
 */

export const CLIENT_MATCH_LIST_HIDDEN = -1;

export const CLIENT_MATCH_LIST_DEFAULT = 0;

/** @param {number|null|undefined} listStatus */
export function isClientMatchListVisible(listStatus) {
  return Number(listStatus) !== CLIENT_MATCH_LIST_HIDDEN;
}
