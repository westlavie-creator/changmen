/**
 * OB 进馆 URL 解析：电竞（token+addr）与体育（token+api+sessionId）分流。
 * 电竞规则保持与历史 ObProvider / venue-adapter parseObPcEntry 一致。
 * 官网熊猫体育试玩只有 token+gr，落地后 hash 清 query，token 在 sessionStorage。
 */

/** @param {string} token */
export function isObSportHexToken(token) {
  const t = String(token || "").trim();
  return /^[0-9a-f]{16,}$/i.test(t) && !/^\d+$/.test(t);
}

function storageGet(store, key) {
  try {
    return store?.getItem?.(key) ?? null;
  } catch {
    return null;
  }
}

/** TY_SDK_* 多为 { value, time, expire }；也有裸字符串。 */
export function unwrapTySdkValue(raw) {
  if (raw == null) return "";
  const s = String(raw).trim();
  if (!s) return "";
  try {
    const parsed = JSON.parse(s);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && "value" in parsed) {
      return parsed.value;
    }
    return parsed;
  } catch {
    return s;
  }
}

function asNonEmptyString(value) {
  if (typeof value === "string" || typeof value === "number") {
    const s = String(value).trim();
    return s || "";
  }
  return "";
}

function originSlash(href) {
  try {
    const u = new URL(href);
    return `${u.protocol}//${u.host}/`;
  } catch {
    return "";
  }
}

function hrefFromQuery(search, pageHref) {
  const raw = String(search || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  const q = raw.replace(/^[?#]/, "");
  if (!/(?:^|&)token=/i.test(`&${q}`)) return "";
  try {
    const page = new URL(pageHref || "https://user-pc-new.invalid/");
    return `${page.origin}/?${q}`;
  } catch {
    return `https://user-pc-new.invalid/?${q}`;
  }
}

/** @param {string|URL} href */
export function parseObEsportEntry(href) {
  let url;
  try {
    url = typeof href === "string" ? new URL(href) : href;
  } catch {
    return null;
  }
  const token = url.searchParams.get("token") || "";
  const addr = url.searchParams.get("addr") || "";
  // 历史逻辑：token 含数字即可；必须有可解的 addr.api[]
  // [A8 可证实] atob(addr)；另试 decodeURIComponent（URL 编码 addr）
  if (!token || !/\d+/.test(token) || !addr) return null;
  try {
    let parsed;
    try {
      parsed = JSON.parse(globalThis.atob(addr));
    } catch {
      parsed = JSON.parse(globalThis.atob(decodeURIComponent(addr)));
    }
    if (!Array.isArray(parsed?.api) || !parsed.api.length) return null;
    return {
      kind: "esport",
      token,
      gateway: String(parsed.api[0]),
      gateways: parsed.api.map(String),
      referer: `${url.protocol}//${url.host}/`,
      addr,
    };
  } catch {
    return null;
  }
}

/**
 * OB 体育 PC 进馆。
 * 商户壳常见 token+api+sessionId；官网试玩只有 token(+gr)，api/sessionId 可缺。
 * @param {string|URL} href
 */
export function parseObSportEntry(href) {
  let url;
  try {
    url = typeof href === "string" ? new URL(href) : href;
  } catch {
    return null;
  }
  // 有合法电竞 addr 时优先电竞，避免误判
  if (parseObEsportEntry(url)) return null;

  const token = (url.searchParams.get("token") || "").trim();
  const api = url.searchParams.get("api");
  const sessionId = (url.searchParams.get("sessionId") || "").trim();
  if (!token || !isObSportHexToken(token)) return null;

  return {
    kind: "sport",
    token,
    sessionId,
    api: api == null ? "" : api,
    referer: `${url.protocol}//${url.host}/`,
    href: url.href,
  };
}

function readStoreString(stores, keys) {
  for (const store of stores) {
    if (!store) continue;
    for (const key of keys) {
      const unwrapped = unwrapTySdkValue(storageGet(store, key));
      const text = asNonEmptyString(unwrapped);
      if (text) return text;
    }
  }
  return "";
}

export function readObSportHexToken(sessionStore, localStore) {
  const stores = [sessionStore, localStore];
  for (const store of stores) {
    if (!store) continue;
    for (const key of ["token", "TY_SDK_TOKEN"]) {
      const text = asNonEmptyString(unwrapTySdkValue(storageGet(store, key)));
      if (isObSportHexToken(text)) return text;
    }
  }
  return "";
}

export function readObSportUserId(sessionStore, localStore) {
  return readStoreString([sessionStore, localStore], ["sessionId", "TY_SDK_USER_ID"]);
}

export function readObSportSearchBlob(sessionStore, localStore) {
  return readStoreString(
    [sessionStore, localStore],
    ["LOCATION_SEARCH", "TY_SDK_LOCATION_SEARCH"],
  );
}

export function looksLikeObSportClient(href, sessionStore, localStore) {
  try {
    if (/user-pc-new/i.test(new URL(href || "https://invalid.invalid/").hostname)) return true;
  } catch {
    /* ignore */
  }
  for (const store of [sessionStore, localStore]) {
    if (!store) continue;
    for (const key of ["TY_SDK_TOKEN", "TY_SDK_USER_ID", "TY_SDK_DOMAIN_API_01", "TY_SDK_BEST_API"]) {
      if (storageGet(store, key)) return true;
    }
  }
  return false;
}

function enrichObSportEntry(entry, sessionStore, localStore, pageHref) {
  if (!entry) return null;
  const token = isObSportHexToken(entry.token)
    ? entry.token
    : readObSportHexToken(sessionStore, localStore);
  if (!isObSportHexToken(token)) return null;
  const uid = readObSportUserId(sessionStore, localStore);
  const sessionId = String(entry.sessionId || uid || "").trim();
  const referer = originSlash(pageHref) || entry.referer || "";
  return {
    ...entry,
    kind: "sport",
    token,
    sessionId,
    uid: uid || sessionId,
    api: entry.api || "",
    referer,
    href: entry.href || pageHref,
  };
}

/**
 * 当前页体育凭证：URL → LOCATION_SEARCH → sessionStorage token。
 * 官网试玩落地 `/#/home` 后必须走 storage。
 * @param {{
 *   href?: string,
 *   sessionStorage?: Storage | { getItem(key: string): string|null },
 *   localStorage?: Storage | { getItem(key: string): string|null },
 * }} [opts]
 */
export function resolveObSportPageEntry(opts = {}) {
  const href = opts.href
    ?? (typeof location !== "undefined" ? location.href : "");
  const sessionStore = opts.sessionStorage
    ?? (typeof sessionStorage !== "undefined" ? sessionStorage : null);
  const localStore = opts.localStorage
    ?? (typeof localStorage !== "undefined" ? localStorage : null);

  const fromHref = parseObSportEntry(href);
  if (fromHref) return enrichObSportEntry(fromHref, sessionStore, localStore, href);

  const search = readObSportSearchBlob(sessionStore, localStore);
  const fromSearch = search ? parseObSportEntry(hrefFromQuery(search, href)) : null;
  if (fromSearch) return enrichObSportEntry(fromSearch, sessionStore, localStore, href);

  const token = readObSportHexToken(sessionStore, localStore);
  if (!token || !looksLikeObSportClient(href, sessionStore, localStore)) return null;
  return enrichObSportEntry({
    kind: "sport",
    token,
    sessionId: "",
    api: "",
    referer: originSlash(href),
    href,
  }, sessionStore, localStore, href);
}

/** TY_SDK_BEST_API / TY_SDK_DOMAIN_API_01（官网试玩比 performance 更早） */
export function discoverObSportGatewayFromStorage(sessionStore, localStore) {
  const stores = [
    sessionStore ?? (typeof sessionStorage !== "undefined" ? sessionStorage : null),
    localStore ?? (typeof localStorage !== "undefined" ? localStorage : null),
  ];
  for (const store of stores) {
    if (!store) continue;
    const best = unwrapTySdkValue(storageGet(store, "TY_SDK_BEST_API"));
    const bestUrl = asNonEmptyString(best).replace(/\/$/, "");
    if (/^https?:\/\//i.test(bestUrl)) return bestUrl;
    const list = unwrapTySdkValue(storageGet(store, "TY_SDK_DOMAIN_API_01"));
    const rows = Array.isArray(list) ? list : [];
    for (const row of rows) {
      const api = asNonEmptyString(row?.api).replace(/\/$/, "");
      if (/^https?:\/\//i.test(api)) return api;
    }
  }
  return null;
}

/** 从当前页 performance 嗅探体育 API 网关（如 api.937kddt.com） */
export function discoverObSportGateway(
  performanceLike = globalThis.performance,
  sessionStore,
  localStore,
) {
  const hosts = [];
  const seen = new Set();
  try {
    const entries = performanceLike?.getEntriesByType?.("resource") || [];
    for (const entry of entries) {
      const name = String(entry?.name || "");
      let u;
      try {
        u = new URL(name);
      } catch {
        continue;
      }
      if (!/^https?:$/i.test(u.protocol)) continue;
      const path = u.pathname || "";
      const isObApi =
        /\/yewu\d*\//i.test(path)
        || /getFilterMatchListPB|structureTournamentMatchesPB|getAllMatchesOddsPB|getDateMenuListPB/i.test(
          path,
        );
      if (!isObApi) continue;
      const origin = u.origin;
      if (seen.has(origin)) continue;
      seen.add(origin);
      hosts.push(origin);
    }
  } catch {
    /* ignore */
  }
  if (hosts[0]) return hosts[0];
  return discoverObSportGatewayFromStorage(sessionStore, localStore);
}

/**
 * 体育 PC 页嗅探推送地址（localStorage / performance 里的 wss）。
 * 未嗅到则空，前端 OB-S 保持未连，列表仍走 HTTP 快照。
 * @param {Performance} [performanceLike]
 * @param {Storage} [storage]
 */
export function discoverObSportWsUrl(performanceLike = globalThis.performance, storage = globalThis.localStorage) {
  try {
    for (const key of ["mqttUrl", "wsUrl", "MQTT_URL", "mqtt_url"]) {
      const v = String(storage?.getItem?.(key) || "").trim();
      if (/^wss?:\/\//i.test(v))
        return v;
    }
  }
  catch {
    /* ignore */
  }
  try {
    const entries = performanceLike?.getEntriesByType?.("resource") || [];
    for (const entry of entries) {
      const name = String(entry?.name || "");
      if (/^wss?:\/\//i.test(name) && /mqtt|\/ws|websocket/i.test(name))
        return name;
    }
  }
  catch {
    /* ignore */
  }
  return "";
}

/**
 * @param {Document} doc
 * @returns {string|null}
 */
export function findObSportIframeHref(doc = document) {
  try {
    const frames = doc.querySelectorAll?.("iframe[src]") || [];
    for (const frame of frames) {
      const src = frame.getAttribute("src") || "";
      if (!src) continue;
      let abs = src;
      try {
        abs = new URL(src, doc.baseURI || location.href).href;
      } catch {
        /* keep src */
      }
      if (parseObSportEntry(abs)) return abs;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * @param {object} entry parseObSportEntry 结果
 * @param {string|null} gateway
 * @param {string} [wsUrl]
 */
export function buildObSportConfig(entry, gateway, wsUrl = "") {
  const gate = gateway ? String(gateway).replace(/\/$/, "") : "";
  const push = String(wsUrl || "").trim();
  const sessionId = String(entry.sessionId || entry.uid || "").trim();
  const uid = String(entry.uid || entry.sessionId || "").trim();
  const payload = {
    provider: "OB",
    kind: "sport",
    gateway: gate ? [gate] : [],
    token: entry.token,
    sessionId,
    ...(uid ? { uid } : {}),
    api: entry.api || "",
    referer: entry.referer,
    ...(push ? { wsUrl: push } : {}),
  };
  return {
    provider: "OB",
    kind: "sport",
    gateway: gate,
    token: entry.token,
    referer: entry.referer,
    sessionId,
    data: globalThis.btoa(JSON.stringify(payload)),
  };
}

/**
 * @param {object} entry parseObEsportEntry 结果
 * [A8 可证实] referer 固定 `https://${host}/`（见 A8 插件 ObProvider.GetConfig）
 */
export function buildObEsportConfig(entry) {
  let host = "";
  try {
    host = new URL(entry.referer || location.href).host;
  } catch {
    host = typeof location !== "undefined" ? location.host : "";
  }
  const referer = `https://${host}/`;
  return {
    provider: "OB",
    gateway: entry.gateway,
    token: entry.token,
    referer,
    data: globalThis.btoa(
      JSON.stringify({
        provider: "OB",
        gateway: entry.gateways,
        token: entry.token,
        referer,
      }),
    ),
  };
}
