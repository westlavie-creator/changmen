/**
 * [changmen 扩展] 商户内嵌 OB 体育凭证观察器。
 *
 * 部分白标站（如 `/home/sports/OBSPORT`）不再打开带 token 的 OB iframe，
 * 而是在本页请求 `/yewu12/api/user/getUserInfo?token=...&enName=OBSPORT`。
 * content provider 看不到页面运行时变量，因此在 document_start 观察资源 URL，
 * 只记录 token 识别线索；不改写 fetch/XHR，也不把商户 origin 当 OB API gateway。
 */
(function installObSportMerchantCapture() {
  const STORAGE_KEY = "gamebet.obSportMerchantCreds";
  const MESSAGE_SOURCE = "changmen-ob-sport-merchant-hook";
  const TOKEN_RE = /^[0-9a-f]{16,}$/i;
  const SUPPORTED_NAMES = new Set(["OBSPORT", "OBTY"]);

  function credentialFromUrl(rawUrl) {
    let url;
    try {
      url = new URL(String(rawUrl || ""), location.href);
    }
    catch {
      return null;
    }
    if (!/^\/yewu12\/api\/user\/getUserInfo\/?$/i.test(url.pathname))
      return null;
    const token = String(url.searchParams.get("token") || "").trim();
    const enName = String(url.searchParams.get("enName") || "").trim().toUpperCase();
    if (!TOKEN_RE.test(token) || /^\d+$/.test(token) || !SUPPORTED_NAMES.has(enName))
      return null;
    const sessionId = String(
      url.searchParams.get("sessionId")
      || url.searchParams.get("userId")
      || url.searchParams.get("uid")
      || "",
    ).trim();
    return {
      kind: "sport",
      source: "merchant-proxy",
      token,
      sessionId,
      uid: sessionId,
      gateway: "",
      merchantOrigin: url.origin,
      pageOrigin: location.origin,
      referer: `${location.origin}/`,
      href: location.href,
      enName,
      updatedAt: Date.now(),
    };
  }

  function persist(row) {
    if (!row || !globalThis.chrome?.storage?.local)
      return false;
    try {
      globalThis.chrome.storage.local.get(STORAGE_KEY, (bag) => {
        const prev = bag?.[STORAGE_KEY];
        const sameToken = prev && String(prev.token || "") === String(row.token || "");
        const merged = sameToken ? { ...prev, ...row } : row;
        if (sameToken && !row.gateway && prev.gateway)
          merged.gateway = prev.gateway;
        if (sameToken && !row.sessionId && prev.sessionId) {
          merged.sessionId = prev.sessionId;
          merged.uid = prev.uid || prev.sessionId;
        }
        globalThis.chrome.storage.local.set({ [STORAGE_KEY]: merged });
      });
    }
    catch {
      return false;
    }
    return true;
  }

  function remember(rawUrl) {
    return persist(credentialFromUrl(rawUrl));
  }

  globalThis.addEventListener("message", (event) => {
    if (event.source !== globalThis || event.data?.source !== MESSAGE_SOURCE || event.data?.kind !== "credential")
      return;
    const token = String(event.data.token || "").trim();
    if (!TOKEN_RE.test(token) || /^\d+$/.test(token))
      return;
    const sessionId = String(event.data.sessionId || event.data.uid || "").trim();
    const gateway = String(event.data.gateway || "").trim().replace(/\/$/, "");
    persist({
      kind: "sport",
      source: "merchant-proxy",
      token,
      sessionId,
      uid: sessionId,
      gateway,
      merchantOrigin: location.origin,
      pageOrigin: location.origin,
      referer: `${location.origin}/`,
      href: location.href,
      launchHref: String(event.data.launchHref || ""),
      enName: "OBSPORT",
      updatedAt: Date.now(),
    });
  });

  function rememberVenueParams(value) {
    if (!value || typeof value !== "object")
      return false;
    const token = String(value.requestId || value.token || "").trim();
    const rawGateway = String(value.origin || value.gateway || "").trim();
    if (!TOKEN_RE.test(token) || /^\d+$/.test(token) || !rawGateway)
      return false;
    let gateway;
    try {
      gateway = new URL(rawGateway).origin;
    }
    catch {
      return false;
    }
    const sessionId = String(value.cuid || value.userId || value.uid || value.sessionId || "").trim();
    persist({
      kind: "sport",
      source: "merchant-proxy",
      token,
      sessionId,
      uid: sessionId,
      gateway,
      merchantOrigin: location.origin,
      pageOrigin: location.origin,
      referer: `${location.origin}/`,
      href: location.href,
      enName: "OBSPORT",
      updatedAt: Date.now(),
    });
    // launchV6 会先写 token+origin，getUserInfo 成功后才补 cuid；
    // cuid 为空时必须继续轮询，不能把残缺凭证当作采集完成。
    return Boolean(sessionId);
  }

  async function scanVenueParamsDb() {
    if (!globalThis.indexedDB || typeof globalThis.indexedDB.databases !== "function")
      return false;
    try {
      const databases = await globalThis.indexedDB.databases();
      if (!(databases || []).some(item => item?.name === "sport_venue_params_db"))
        return false;
    }
    catch {
      return false;
    }
    return new Promise((resolve) => {
      const request = globalThis.indexedDB.open("sport_venue_params_db");
      request.onerror = () => resolve(false);
      request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("shared_params")) {
          db.close();
          resolve(false);
          return;
        }
        const tx = db.transaction("shared_params", "readonly");
        const getAll = tx.objectStore("shared_params").getAll();
        getAll.onerror = () => resolve(false);
        getAll.onsuccess = () => resolve((getAll.result || []).some(rememberVenueParams));
        tx.oncomplete = () => db.close();
        tx.onabort = () => db.close();
      };
    });
  }

  const merchantPage = /\/home\/sports\/OBSPORT(?:\/|$)/i.test(location.pathname)
    || new URL(location.href).searchParams.get("api_id") === "53";
  if (merchantPage && typeof globalThis.setInterval === "function") {
    let attempts = 0;
    const timer = globalThis.setInterval(() => {
      attempts += 1;
      void scanVenueParamsDb().then((found) => {
        if (found || attempts >= 120)
          globalThis.clearInterval(timer);
      });
    }, 1_000);
    void scanVenueParamsDb();
  }

  function scanExisting() {
    try {
      for (const entry of performance.getEntriesByType("resource") || [])
        remember(entry?.name);
    }
    catch {
      /* ignore */
    }
  }

  scanExisting();
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries())
        remember(entry?.name);
    });
    observer.observe({ type: "resource", buffered: true });
  }
  catch {
    /* 老 Chromium 不支持 buffered resource observer 时，主 content 的轮询仍会扫描 performance。 */
  }
})();
