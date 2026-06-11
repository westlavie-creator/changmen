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

  window.getSiteToken = function getSiteToken() {
    try {
      return localStorage.getItem("app:token") || "";
    } catch {
      return "";
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

  if (!window.isLocalMatcherDev() && !window.getSiteToken()) {
    window.redirectToSiteLogin();
  }
})();
