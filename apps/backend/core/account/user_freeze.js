/** 账号冻结状态存于 profiles.preferences（changmen 扩展） */

export function readPreferences(row) {
  const prefs = row?.preferences;
  if (prefs && typeof prefs === "object" && !Array.isArray(prefs)) return prefs;
  return {};
}

export function isProfileFrozen(row) {
  return Boolean(readPreferences(row).frozen);
}

export function frozenFieldsFromProfile(row) {
  const prefs = readPreferences(row);
  return {
    frozen: prefs.frozen ? 1 : 0,
    frozenAt: Number(prefs.frozenAt) || 0,
  };
}

export function nextPreferencesForFreeze(prefs, frozen, operatorUserId) {
  const base = prefs && typeof prefs === "object" && !Array.isArray(prefs) ? { ...prefs } : {};
  const op = String(operatorUserId || "");
  const now = Date.now();
  if (frozen) {
    return { ...base, frozen: true, frozenAt: now, frozenBy: op };
  }
  const next = { ...base };
  delete next.frozen;
  delete next.frozenAt;
  delete next.frozenBy;
  next.unfrozenAt = now;
  next.unfrozenBy = op;
  return next;
}
