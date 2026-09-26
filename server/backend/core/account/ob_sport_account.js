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
  const venueAccountName = String(row.venueAccountName || row.userName || "").trim();
  const out = {};
  if (token)
    out.token = token;
  if (gateway)
    out.gateway = gateway.replace(/\/$/, "");
  if (referer)
    out.referer = referer;
  if (venueMemberId)
    out.venueMemberId = venueMemberId;
  if (venueAccountName)
    out.venueAccountName = venueAccountName;
  return out;
}

/**
 * 同一账号卡同时配置 OB 电竞和体育时，两个凭证必须属于同一会员账号。
 * 数字 UID 属于不同产品体系，不能用来跨产品比较。
 */
export function validateSportObMemberBinding(account, sportPatch) {
  const sportAccountName = String(sportPatch?.venueAccountName || "").trim();
  if (!sportAccountName)
    return "体育会员账号无效";
  if (!isObEsportToken(account?.token))
    return "";
  const esportAccountName = String(account?.venueAccountName || "").trim();
  if (!esportAccountName)
    return "电竞会员账号缺失，请先刷新并保存电竞凭证";
  if (
    esportAccountName.toLowerCase() !== sportAccountName.toLowerCase()
  ) {
    return `体育会员账号 ${sportAccountName} 与电竞会员账号 ${esportAccountName} 不一致`;
  }
  return "";
}

export function mergeSportObPatch(stored, patch) {
  const current = cloneSportOb(stored);
  const incoming = cloneSportOb(patch);
  // 体育 token、网关、UID 是同一组凭证。token 变化时不得继承旧 token
  // 的网关或会员 ID；同 token 才允许补 referer 等局部字段。
  const tokenChanged = Boolean(
    incoming.token
    && current.token
    && incoming.token !== current.token,
  );
  const next = tokenChanged ? incoming : { ...current, ...incoming };
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
