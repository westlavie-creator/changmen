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
})();
