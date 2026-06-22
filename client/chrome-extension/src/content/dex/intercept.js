/**
 * DexSport fetch 拦截器 — 注入页面上下文，捕获 JWT 和 address_info hash。
 * 通过 document.documentElement.dataset 传递给 content script。
 */

const INTERCEPT_SCRIPT = `
(function() {
  if (window.__dexInterceptInstalled) return;
  window.__dexInterceptInstalled = true;

  var root = document.documentElement;
  var origFetch = window.fetch;

  window.fetch = function(input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var headers = (init && init.headers) || {};

    // 捕获 Authorization: Bearer <token>
    var auth = headers.Authorization || headers.authorization || '';
    if (!auth && headers instanceof Headers) {
      auth = headers.get('Authorization') || headers.get('authorization') || '';
    }
    if (auth && auth.startsWith('Bearer ') && !auth.includes('Signature ')) {
      root.dataset.dexAccessToken = auth.slice(7);
    }

    return origFetch.apply(this, arguments).then(function(response) {
      // 捕获 /v3/address_info 响应中的 hash
      if (url.includes('/v3/address_info') || url.includes('/address_info')) {
        response.clone().json().then(function(data) {
          if (data && data.hash) {
            root.dataset.dexHash = data.hash;
          }
          if (data && data.nickname) {
            root.dataset.dexNickname = data.nickname;
          }
        }).catch(function() {});
      }
      return response;
    });
  };
})();
`;

export function injectDexInterceptor() {
  try {
    const script = document.createElement("script");
    script.textContent = INTERCEPT_SCRIPT;
    (document.head || document.documentElement).appendChild(script);
    script.remove();
  } catch (err) {
    console.warn("[Dex] intercept inject failed", err);
  }
}
