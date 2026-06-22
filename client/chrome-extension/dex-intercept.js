/**
 * DexSport 网络拦截器 — 通过 manifest world:MAIN 注入页面上下文，绕过 CSP。
 * 捕获 axios (XHR) 的 Authorization Bearer token 和 address_info 响应。
 */
(function () {
  if (window.__dexInterceptInstalled) return;
  window.__dexInterceptInstalled = true;

  var root = document.documentElement;

  function captureAuth(auth) {
    if (auth && auth.indexOf("Bearer ") === 0 && auth.indexOf("Signature ") === -1) {
      root.dataset.dexAccessToken = auth.slice(7);
    }
  }

  function captureAddressInfo(text) {
    try {
      var data = JSON.parse(text);
      if (data && data.hash) root.dataset.dexHash = data.hash;
      if (data && data.nickname) root.dataset.dexNickname = data.nickname;
    } catch (e) {}
  }

  var origOpen = XMLHttpRequest.prototype.open;
  var origSetHeader = XMLHttpRequest.prototype.setRequestHeader;
  var origSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url) {
    this._dexUrl = url;
    return origOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
    if (name.toLowerCase() === "authorization") {
      captureAuth(value);
    }
    return origSetHeader.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function () {
    var xhr = this;
    var url = xhr._dexUrl || "";
    xhr.addEventListener("load", function () {
      try {
        if (url.indexOf("address_info") !== -1) {
          captureAddressInfo(xhr.responseText);
        }
        if (url.indexOf("/auth/") !== -1 || url.indexOf("/login") !== -1 || url.indexOf("/verify-login") !== -1) {
          var data = JSON.parse(xhr.responseText);
          if (data && data.access_token) captureAuth("Bearer " + data.access_token);
        }
      } catch (e) {}
    });
    return origSend.apply(this, arguments);
  };

  var origFetch = window.fetch;
  window.fetch = function (input, init) {
    var url = typeof input === "string" ? input : (input && input.url) || "";
    var headers = (init && init.headers) || {};
    var auth = headers.Authorization || headers.authorization || "";
    if (!auth && headers instanceof Headers) {
      auth = headers.get("Authorization") || "";
    }
    captureAuth(auth);

    return origFetch.apply(this, arguments).then(function (response) {
      if (url.indexOf("address_info") !== -1 || url.indexOf("/auth/") !== -1 || url.indexOf("/login") !== -1) {
        response
          .clone()
          .json()
          .then(function (data) {
            if (data && data.hash) root.dataset.dexHash = data.hash;
            if (data && data.nickname) root.dataset.dexNickname = data.nickname;
            if (data && data.access_token) captureAuth("Bearer " + data.access_token);
          })
          .catch(function () {});
      }
      return response;
    });
  };

  console.log("[Dex] network interceptor installed (MAIN world)");
})();
