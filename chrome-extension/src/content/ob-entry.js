/**
 * OB 进馆 URL 解析：电竞（token+addr）与体育（token+api+sessionId）分流。
 * 电竞规则保持与历史 ObProvider / venue-adapter parseObPcEntry 一致。
 */

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
  if (!token || !/\d+/.test(token) || !addr) return null;
  try {
    const parsed = JSON.parse(globalThis.atob(decodeURIComponent(addr)));
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
 * OB 体育 PC 进馆（常见于 iframe user-pc-new.*）：
 * token=十六进制，api=密文网关参数，sessionId=会话。
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
  if (!token || api == null || api === "" || !sessionId) return null;
  // 体育 token 为较长 hex；排除纯数字电竞 token
  if (!/^[0-9a-f]{16,}$/i.test(token) || /^\d+$/.test(token)) return null;

  return {
    kind: "sport",
    token,
    sessionId,
    api,
    referer: `${url.protocol}//${url.host}/`,
    href: url.href,
  };
}

/** 从当前页 performance 嗅探体育 API 网关（如 api.937kddt.com） */
export function discoverObSportGateway(performanceLike = globalThis.performance) {
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
  return hosts[0] || null;
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
 */
export function buildObSportConfig(entry, gateway) {
  const gate = gateway ? String(gateway).replace(/\/$/, "") : "";
  const payload = {
    provider: "OB",
    kind: "sport",
    gateway: gate ? [gate] : [],
    token: entry.token,
    sessionId: entry.sessionId,
    api: entry.api,
    referer: entry.referer,
  };
  return {
    provider: "OB",
    gateway: gate,
    token: entry.token,
    referer: entry.referer,
    sessionId: entry.sessionId,
    data: globalThis.btoa(JSON.stringify(payload)),
  };
}

/**
 * @param {object} entry parseObEsportEntry 结果
 */
export function buildObEsportConfig(entry) {
  return {
    provider: "OB",
    gateway: entry.gateway,
    token: entry.token,
    referer: entry.referer,
    data: globalThis.btoa(
      JSON.stringify({
        provider: "OB",
        gateway: entry.gateways,
        token: entry.token,
        referer: entry.referer,
      }),
    ),
  };
}
