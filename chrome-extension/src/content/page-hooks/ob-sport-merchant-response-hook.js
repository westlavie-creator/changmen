/**
 * [changmen 扩展] MAIN world：观察商户内嵌 OBSPORT 的 launchV6/getUserInfo 响应。
 * launchV6.data.html 是真实 OB 进馆 URL，可同时得到 token 与直连 gateway。
 */
(function installObSportMerchantResponseHook() {
  const SOURCE = "changmen-ob-sport-merchant-hook";
  const TOKEN_RE = /^[0-9a-f]{16,}$/i;
  let pageUrl;
  try {
    pageUrl = new URL(location.href);
  }
  catch {
    return;
  }
  const onObSportPage = /\/home\/sports\/OBSPORT(?:\/|$)/i.test(pageUrl.pathname)
    || String(pageUrl.searchParams.get("enName") || "").toUpperCase() === "OBSPORT"
    || pageUrl.searchParams.get("api_id") === "53";
  if (!onObSportPage || globalThis.__CHANGMEN_OB_SPORT_MERCHANT_HOOK__)
    return;
  globalThis.__CHANGMEN_OB_SPORT_MERCHANT_HOOK__ = true;

  function isSportToken(value) {
    const token = String(value || "").trim();
    return TOKEN_RE.test(token) && !/^\d+$/.test(token);
  }

  function requestUrl(value) {
    try {
      if (typeof value === "string")
        return new URL(value, location.href);
      if (value?.url)
        return new URL(String(value.url), location.href);
    }
    catch {
      /* ignore */
    }
    return null;
  }

  function postCredential(payload) {
    if (!isSportToken(payload?.token))
      return;
    window.postMessage({ source: SOURCE, kind: "credential", ...payload }, "*");
  }

  function findLaunchCredential(value, depth = 0, seen = new Set()) {
    if (depth > 6 || value == null)
      return null;
    if (typeof value === "string") {
      const text = value.trim();
      if (!text)
        return null;
      try {
        const url = new URL(text);
        const token = String(url.searchParams.get("token") || "").trim();
        if (isSportToken(token))
          return { token, gateway: url.origin, launchHref: url.href };
      }
      catch {
        if ((text.startsWith("{") || text.startsWith("[")) && text.length < 2_000_000) {
          try {
            return findLaunchCredential(JSON.parse(text), depth + 1, seen);
          }
          catch {
            return null;
          }
        }
      }
      return null;
    }
    if (typeof value !== "object" || seen.has(value))
      return null;
    seen.add(value);
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = findLaunchCredential(item, depth + 1, seen);
        if (found)
          return found;
      }
      return null;
    }
    const preferred = [value.html, value.loginUrl, value.url, value.data];
    for (const item of preferred) {
      const found = findLaunchCredential(item, depth + 1, seen);
      if (found)
        return found;
    }
    for (const item of Object.values(value)) {
      const found = findLaunchCredential(item, depth + 1, seen);
      if (found)
        return found;
    }
    return null;
  }

  function parseBody(text) {
    const raw = String(text || "").trim();
    if (!raw)
      return null;
    try {
      return JSON.parse(raw);
    }
    catch {
      return raw;
    }
  }

  function inspectResponse(url, body) {
    if (!url)
      return;
    if (/\/game\/api\/v1\/venue\/launchV6\/?$/i.test(url.pathname)) {
      const found = findLaunchCredential(body);
      if (found)
        postCredential(found);
      return;
    }
    if (!/^\/yewu12\/api\/user\/getUserInfo\/?$/i.test(url.pathname))
      return;
    const token = String(url.searchParams.get("token") || "").trim();
    const row = body && typeof body === "object" ? body : {};
    const data = row.data && typeof row.data === "object" ? row.data : row;
    const sessionId = String(data.userId || data.uid || data.sessionId || "").trim();
    postCredential({ token, sessionId, uid: sessionId });
  }

  const originalFetch = globalThis.fetch;
  if (typeof originalFetch === "function") {
    globalThis.fetch = async function changmenObSportMerchantFetch(input, init) {
      const url = requestUrl(input);
      const response = await originalFetch.call(this, input, init);
      if (url && (/\/game\/api\/v1\/venue\/launchV6\/?$/i.test(url.pathname)
        || /^\/yewu12\/api\/user\/getUserInfo\/?$/i.test(url.pathname))) {
        void response.clone().text()
          .then(text => inspectResponse(url, parseBody(text)))
          .catch(() => {});
      }
      return response;
    };
  }

  const Xhr = globalThis.XMLHttpRequest;
  if (Xhr?.prototype) {
    const originalOpen = Xhr.prototype.open;
    Xhr.prototype.open = function changmenObSportMerchantOpen(method, url, ...rest) {
      const parsed = requestUrl(url);
      if (parsed && (/\/game\/api\/v1\/venue\/launchV6\/?$/i.test(parsed.pathname)
        || /^\/yewu12\/api\/user\/getUserInfo\/?$/i.test(parsed.pathname))) {
        this.addEventListener("load", () => {
          const body = this.responseType === "json" ? this.response : parseBody(this.responseText);
          inspectResponse(parsed, body);
        }, { once: true });
      }
      return originalOpen.call(this, method, url, ...rest);
    };
  }
})();
