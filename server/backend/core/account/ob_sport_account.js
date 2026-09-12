/**
 * OB 体育凭证与电竞 token 隔离。
 * Client_SaveData(ACCOUNT) 不得改 sportOb；Client_SaveSportAccount 不得改 token。
 */

export function isObSportBetToken(token) {
  const t = String(token || "").trim();
  return /^[0-9a-f]{16,}$/i.test(t) && !/^\d+$/.test(t);
}

export function isObEsportToken(token) {
  const t = String(token || "").trim();
  return /^\d{8,}$/.test(t);
}

export function cloneSportOb(raw) {
  const row = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const token = String(row.token || "").trim();
  const gateway = String(row.gateway || "").trim();
  const referer = String(row.referer || "").trim();
  const venueMemberId = String(row.venueMemberId || row.uid || row.sessionId || "").trim();
  const out = {};
  if (token)
    out.token = token;
  if (gateway)
    out.gateway = gateway.replace(/\/$/, "");
  if (referer)
    out.referer = referer;
  if (venueMemberId)
    out.venueMemberId = venueMemberId;
  return out;
}

export function mergeSportObPatch(stored, patch) {
  const next = { ...cloneSportOb(stored), ...cloneSportOb(patch) };
  return next.token ? next : undefined;
}

/**
 * ACCOUNT 整包保存：丢掉客户端带来的 sportOb，hex 不准写入电竞 token。
 * 仅当库里还没有体育 token、而入参 token 是 hex 时，把 hex 迁进 sportOb（存量跟单号）。
 */
export function preserveSportObOnAccountSave(incoming, stored) {
  const row = incoming && typeof incoming === "object" ? { ...incoming } : {};
  delete row.sportOb;
  const storedSport = cloneSportOb(stored?.sportOb);
  const inTok = String(row.token || "").trim();
  const storedTok = String(stored?.token || "").trim();
  if (isObSportBetToken(inTok)) {
    row.token = isObEsportToken(storedTok) ? storedTok : "";
    row.sportOb = storedSport.token
      ? storedSport
      : mergeSportObPatch(undefined, {
        token: inTok,
        gateway: row.gateway,
        referer: row.referer,
        venueMemberId: row.venueMemberId,
      });
    if (!row.sportOb)
      delete row.sportOb;
    return row;
  }
  // 编辑框把 hex 从 token 清掉后，入参是空字符串：迁进 sportOb，不要当电竞登出丢掉。
  if (!inTok && isObSportBetToken(storedTok) && !storedSport.token) {
    row.token = "";
    row.sportOb = mergeSportObPatch(undefined, {
      token: storedTok,
      gateway: stored?.gateway,
      referer: stored?.referer,
      venueMemberId: stored?.venueMemberId,
    });
    if (!row.sportOb)
      delete row.sportOb;
    return row;
  }
  if (storedSport.token)
    row.sportOb = storedSport;
  return row;
}
