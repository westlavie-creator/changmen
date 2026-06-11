(function () {
  const path = window.location.pathname;
  const base = path === "/matcher" || path.startsWith("/matcher/") ? "/matcher" : "";
  window.MATCHER_BASE = base;
  window.MATCHER_API = base + "/api";
  window.matcherUrl = function matcherUrl(rel) {
    if (!rel) return base || "/";
    if (!rel.startsWith("/")) rel = "/" + rel;
    return base + rel;
  };
  window.matcherApi = function matcherApi(path) {
    if (!path) return window.MATCHER_API;
    if (!path.startsWith("/")) path = "/" + path;
    return window.MATCHER_API + path;
  };

  function readTokenCookie() {
    const m = document.cookie.match(/(?:^|; )app_token=([^;]*)/);
    return m ? decodeURIComponent(m[1]) : "";
  }

  window.getSiteToken = function getSiteToken() {
    try {
      return localStorage.getItem("app:token") || readTokenCookie() || "";
    } catch {
      return readTokenCookie();
    }
  };

  window.isLocalMatcherDev = function isLocalMatcherDev() {
    const h = location.hostname;
    return h === "localhost" || h === "127.0.0.1";
  };

  window.matcherAuthHeaders = function matcherAuthHeaders() {
    const token = window.getSiteToken();
    return token ? { token } : {};
  };

  window.redirectToSiteLogin = function redirectToSiteLogin() {
    const dest = "/login?redirect=" + encodeURIComponent(location.pathname + location.search);
    location.replace(dest);
  };

  // 与主页同源时 localStorage 已有 token；跨端口（5174 登录、3456 matcher）靠 cookie 共享
  const token = window.getSiteToken();
  if (token && !readTokenCookie()) {
    document.cookie =
      "app_token=" + encodeURIComponent(token) + "; path=/; max-age=" + 60 * 60 * 24 * 7 + "; SameSite=Lax";
  }

  if (!window.isLocalMatcherDev() && !window.getSiteToken()) {
    window.redirectToSiteLogin();
  }
})();
