(function () {
  "use strict";

  if (window.__LOCAL_ARCH_SCAN_HOOKED__) return;
  window.__LOCAL_ARCH_SCAN_HOOKED__ = true;

  var SOURCE = "LOCAL_ARCH_SCAN_PAGE";
  var MAX_TEXT = 4000;
  var MAX_BODY = 120000;
  var FULL_LOCAL_CAPTURE = true;
  var SENSITIVE_KEY = /(token|authorization|auth|cookie|session|sess|password|passwd|pwd|secret|jwt|bearer|access|refresh|credential|csrf|xsrf|lockdown)/i;
  var SENSITIVE_VALUE = /(bearer\s+[a-z0-9._-]+|eyJ[a-zA-Z0-9._-]+|session=[^;&\s]+|token["'=:\s]+[a-z0-9._-]+)/i;

  function hashString(input) {
    var str = String(input == null ? "" : input);
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
    }
    return ("00000000" + (h >>> 0).toString(16)).slice(-8);
  }

  function redact(value, reason) {
    var str = String(value == null ? "" : value);
    return "[REDACTED:" + (reason || "sensitive") + ":len=" + str.length + ":hash=" + hashString(str) + "]";
  }

  function shouldRedact(key, value) {
    if (FULL_LOCAL_CAPTURE) return false;
    return SENSITIVE_KEY.test(key || "") || SENSITIVE_VALUE.test(String(value == null ? "" : value));
  }

  function truncate(value, max) {
    var str = String(value == null ? "" : value);
    max = max || MAX_TEXT;
    return str.length > max ? str.slice(0, max) + "...[TRUNCATED len=" + str.length + "]" : str;
  }

  function safeJsonParse(text) {
    if (typeof text !== "string") return null;
    var s = text.trim();
    if (!/^[\[{]/.test(s)) return null;
    try { return JSON.parse(s); } catch (e) { return null; }
  }

  function shape(value, depth) {
    depth = depth || 0;
    if (depth > 4) return "[MaxDepth]";
    if (value === null) return "null";
    if (Array.isArray(value)) {
      return { type: "array", length: value.length, sample: value.length ? shape(value[0], depth + 1) : undefined };
    }
    if (typeof value === "object") {
      var out = {};
      Object.keys(value).slice(0, 80).forEach(function (key) {
        out[key] = shouldRedact(key, value[key]) ? "[SensitiveField]" : shape(value[key], depth + 1);
      });
      return out;
    }
    return typeof value;
  }

  function sanitize(value, parentKey, depth) {
    depth = depth || 0;
    if (depth > 6) return "[MaxDepth]";
    if (value == null) return value;
    if (typeof value === "string") {
      if (shouldRedact(parentKey || "", value)) return redact(value, parentKey || "value");
      var parsed = safeJsonParse(value);
      if (parsed) return { rawLength: value.length, json: sanitize(parsed, parentKey, depth + 1), schema: shape(parsed) };
      return truncate(value);
    }
    if (typeof value === "number" || typeof value === "boolean") return value;
    if (value instanceof Error) return { name: value.name, message: value.message, stack: truncate(value.stack || "", 1200) };
    if (Array.isArray(value)) return value.slice(0, 100).map(function (item) { return sanitize(item, parentKey, depth + 1); });
    if (typeof value === "object") {
      var out = {};
      Object.keys(value).slice(0, 120).forEach(function (key) {
        out[key] = shouldRedact(key, value[key]) ? redact(value[key], key) : sanitize(value[key], key, depth + 1);
      });
      return out;
    }
    return String(value);
  }

  function sanitizeUrl(raw) {
    try {
      var url = new URL(String(raw), location.href);
      var params = [];
      url.searchParams.forEach(function (value, key) {
        params.push(encodeURIComponent(key) + "=" + encodeURIComponent(
          shouldRedact(key, value) ? redact(value, key) : truncate(value, 300)
        ));
      });
      url.search = params.length ? "?" + params.join("&") : "";
      return url.toString();
    } catch (e) {
      return truncate(String(raw), 1000);
    }
  }

  function emit(type, data) {
    window.postMessage({
      source: SOURCE,
      record: {
        type: type,
        t: Date.now(),
        pageUrl: sanitizeUrl(location.href),
        data: sanitize(data)
      }
    }, "*");
  }

  function stackTrace() {
    try {
      var stack = new Error("arch-scan-stack").stack || "";
      return truncate(stack.split("\n").slice(2, 12).join("\n"), 2400);
    } catch (error) {
      return String(error && error.message || error);
    }
  }

  function headersToObject(headers) {
    var out = {};
    try {
      if (headers instanceof Headers) headers.forEach(function (value, key) { out[key] = value; });
      else if (Array.isArray(headers)) headers.forEach(function (pair) { if (pair && pair.length >= 2) out[pair[0]] = pair[1]; });
      else if (headers && typeof headers === "object") Object.keys(headers).forEach(function (key) { out[key] = headers[key]; });
    } catch (e) {
      out.__error = String(e && e.message || e);
    }
    return sanitize(out);
  }

  function bodySample(body) {
    if (body == null) return undefined;
    if (typeof body === "string") return sanitize(body);
    if (body instanceof URLSearchParams) return sanitize(body.toString());
    if (body instanceof FormData) {
      var form = {};
      body.forEach(function (value, key) {
        form[key] = value instanceof File ? { fileName: value.name, size: value.size, type: value.type } : String(value);
      });
      return sanitize(form);
    }
    if (body instanceof Blob) return { blob: true, size: body.size, type: body.type };
    if (body instanceof ArrayBuffer) return { arrayBuffer: true, byteLength: body.byteLength };
    return { type: Object.prototype.toString.call(body), text: sanitize(String(body)) };
  }

  function responseSample(response) {
    try {
      var contentType = String(response.headers && response.headers.get("content-type") || "");
      var contentLength = Number(response.headers && response.headers.get("content-length") || 0);
      var info = {
        contentType: contentType,
        contentLength: contentLength,
        headers: headersToObject(response.headers)
      };
      if (contentLength > MAX_BODY) {
        info.skipped = "large-response";
        return Promise.resolve(info);
      }
      if (!/(json|text|javascript|xml|html|plain|form)/i.test(contentType)) {
        info.skipped = "non-text-response";
        return Promise.resolve(info);
      }
      return response.clone().text().then(function (text) {
        var parsed = safeJsonParse(text);
        info.contentLength = contentLength || text.length;
        info.body = sanitize(truncate(text));
        info.schema = parsed ? shape(parsed) : undefined;
        return info;
      }).catch(function (error) {
        info.error = String(error && error.message || error);
        return info;
      });
    } catch (error) {
      return Promise.resolve({ error: String(error && error.message || error) });
    }
  }

  function installFetch() {
    if (!window.fetch) return;
    var originalFetch = window.fetch;
    window.fetch = function patchedFetch(input, init) {
      var started = performance.now();
      var callStack = stackTrace();
      var url = "";
      var method = "GET";
      var requestHeaders = {};
      var requestBody;
      try {
        url = typeof input === "string" ? input : input && input.url;
        method = (init && init.method) || (input && input.method) || "GET";
        requestHeaders = Object.assign({}, headersToObject(input && input.headers), headersToObject(init && init.headers));
        requestBody = init && init.body !== undefined ? bodySample(init.body) : undefined;
      } catch (error) {
        emit("fetch.inspect.error", { error: error });
      }
      return originalFetch.apply(this, arguments).then(function (response) {
        responseSample(response).then(function (sample) {
          emit("fetch", {
            method: method,
            url: sanitizeUrl(url),
            status: response.status,
            ok: response.ok,
            durationMs: Math.round(performance.now() - started),
            requestHeaders: requestHeaders,
            requestBody: requestBody,
            response: sample,
            stack: callStack
          });
        });
        return response;
      }).catch(function (error) {
        emit("fetch.error", {
          method: method,
          url: sanitizeUrl(url),
          durationMs: Math.round(performance.now() - started),
          requestHeaders: requestHeaders,
          requestBody: requestBody,
          error: error,
          stack: callStack
        });
        throw error;
      });
    };
  }

  function parseRawHeaders(raw) {
    var out = {};
    String(raw || "").trim().split(/\r?\n/).forEach(function (line) {
      var idx = line.indexOf(":");
      if (idx > 0) out[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    });
    return out;
  }

  function installXhr() {
    if (!window.XMLHttpRequest) return;
    var OriginalXHR = window.XMLHttpRequest;
    window.XMLHttpRequest = function PatchedXMLHttpRequest() {
      var xhr = new OriginalXHR();
      var meta = { method: "GET", url: "", requestHeaders: {} };
      var originalOpen = xhr.open;
      var originalSend = xhr.send;
      var originalSetRequestHeader = xhr.setRequestHeader;
      xhr.open = function (method, url) {
        meta.method = method || "GET";
        meta.url = String(url || "");
        meta.started = performance.now();
        return originalOpen.apply(xhr, arguments);
      };
      xhr.setRequestHeader = function (key, value) {
        meta.requestHeaders[key] = value;
        return originalSetRequestHeader.apply(xhr, arguments);
      };
      xhr.send = function (body) {
        meta.requestBody = bodySample(body);
        xhr.addEventListener("loadend", function () {
          var responseBody;
          var responseSchema;
          try {
            var text = xhr.responseType === "" || xhr.responseType === "text" ? xhr.responseText : "";
            if (text) {
              responseBody = sanitize(truncate(text));
              var parsed = safeJsonParse(text);
              responseSchema = parsed ? shape(parsed) : undefined;
            }
          } catch (error) {
            responseBody = "[unavailable:" + String(error && error.message || error) + "]";
          }
          emit("xhr", {
            method: meta.method,
            url: sanitizeUrl(meta.url),
            status: xhr.status,
            durationMs: Math.round(performance.now() - (meta.started || performance.now())),
            requestHeaders: sanitize(meta.requestHeaders),
            requestBody: meta.requestBody,
            responseHeaders: sanitize(parseRawHeaders(xhr.getAllResponseHeaders && xhr.getAllResponseHeaders())),
            responseBody: responseBody,
            responseSchema: responseSchema,
            stack: meta.stack
          });
        });
        meta.stack = stackTrace();
        return originalSend.apply(xhr, arguments);
      };
      return xhr;
    };
  }

  function decodeSocketIoText(text) {
    var str = String(text || "");
    var info = { protocol: "unknown" };
    var match = /^(\d+)(.*)$/.exec(str);
    if (!match) return info;
    info.engineType = match[1].charAt(0);
    info.payload = match[2] || "";
    if (str.charAt(0) === "4" && str.charAt(1) === "2") {
      info.protocol = "socket.io";
      try {
        var eventPayload = JSON.parse(str.slice(2));
        info.event = eventPayload[0];
        info.args = sanitize(eventPayload.slice(1));
        info.schema = shape(eventPayload);
        if (eventPayload[0] === "chat message" && typeof eventPayload[1] === "string") {
          var chat = safeJsonParse(eventPayload[1]);
          if (chat) {
            info.channel = chat.channel;
            info.message = sanitize(chat.message);
            info.messageSchema = shape(chat.message);
          }
        }
      } catch (error) {
        info.error = String(error && error.message || error);
      }
    } else if (/^#\d+/.test(str)) {
      info.protocol = "socketcluster";
      info.kind = "heartbeat-or-control";
    }
    return info;
  }

  function wsSample(data) {
    if (typeof data === "string") {
      var parsed = safeJsonParse(data);
      return {
        kind: "text",
        length: data.length,
        sample: sanitize(truncate(data)),
        schema: parsed ? shape(parsed) : undefined,
        decoded: decodeSocketIoText(data)
      };
    }
    if (data instanceof Blob) return { kind: "blob", size: data.size, type: data.type };
    if (data instanceof ArrayBuffer) return { kind: "arrayBuffer", byteLength: data.byteLength };
    return { kind: Object.prototype.toString.call(data), sample: sanitize(data), schema: shape(data) };
  }

  function installWebSocket() {
    if (!window.WebSocket) return;
    var OriginalWebSocket = window.WebSocket;
    window.WebSocket = function PatchedWebSocket(url, protocols) {
      var ws = protocols === undefined ? new OriginalWebSocket(url) : new OriginalWebSocket(url, protocols);
      var id = "ws-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
      emit("ws.create", { id: id, url: sanitizeUrl(url), protocols: protocols, stack: stackTrace() });
      ws.addEventListener("open", function () { emit("ws.open", { id: id, url: sanitizeUrl(url) }); });
      ws.addEventListener("close", function (event) { emit("ws.close", { id: id, code: event.code, reason: event.reason, wasClean: event.wasClean }); });
      ws.addEventListener("error", function () { emit("ws.error", { id: id, url: sanitizeUrl(url) }); });
      ws.addEventListener("message", function (event) { emit("ws.message.in", { id: id, url: sanitizeUrl(url), data: wsSample(event.data) }); });
      var originalSend = ws.send;
      ws.send = function (data) {
        emit("ws.message.out", { id: id, url: sanitizeUrl(url), data: wsSample(data) });
        return originalSend.apply(ws, arguments);
      };
      return ws;
    };
    window.WebSocket.prototype = OriginalWebSocket.prototype;
    window.WebSocket.CONNECTING = OriginalWebSocket.CONNECTING;
    window.WebSocket.OPEN = OriginalWebSocket.OPEN;
    window.WebSocket.CLOSING = OriginalWebSocket.CLOSING;
    window.WebSocket.CLOSED = OriginalWebSocket.CLOSED;
  }

  function captureStorage() {
    function scan(name, store) {
      var items = [];
      try {
        for (var i = 0; i < store.length; i++) {
          var key = store.key(i);
          var value = store.getItem(key);
          var parsed = safeJsonParse(value);
        items.push({
            key: key,
            sensitiveKey: shouldRedact(key, value),
            valueLength: String(value || "").length,
            valueHash: hashString(value || ""),
            valuePreview: shouldRedact(key, value) ? "[REDACTED_BY_KEY]" : sanitize(truncate(value || "", 2000)),
            jsonSchema: parsed ? shape(parsed) : undefined
          });
        }
      } catch (error) {
        items.push({ error: String(error && error.message || error) });
      }
      emit("storage." + name, { items: items });
    }
    scan("local", localStorage);
    scan("session", sessionStorage);
  }

  function captureResources() {
    try {
      var items = performance.getEntriesByType("resource").slice(-250).map(function (entry) {
        return {
          name: sanitizeUrl(entry.name),
          initiatorType: entry.initiatorType,
          durationMs: Math.round(entry.duration),
          transferSize: entry.transferSize,
          encodedBodySize: entry.encodedBodySize,
          decodedBodySize: entry.decodedBodySize
        };
      });
      emit("resources.snapshot", { items: items });
    } catch (error) {
      emit("resources.error", { error: error });
    }
  }

  function installChromeRuntimeHooks() {
    try {
      if (!window.chrome || !chrome.runtime) return;
      if (chrome.runtime.sendMessage && !chrome.runtime.sendMessage.__archScanPatched) {
        var originalSendMessage = chrome.runtime.sendMessage.bind(chrome.runtime);
        var patchedSendMessage = function () {
          var args = Array.prototype.slice.call(arguments);
          var callbackIndex = args.findIndex(function (arg) { return typeof arg === "function"; });
          var recordArgs = callbackIndex >= 0 ? args.slice(0, callbackIndex) : args;
          emit("chrome.runtime.sendMessage", {
            args: sanitize(recordArgs),
            stack: stackTrace()
          });
          if (callbackIndex >= 0) {
            var originalCallback = args[callbackIndex];
            args[callbackIndex] = function () {
              emit("chrome.runtime.sendMessage.response", {
                args: sanitize(recordArgs),
                response: sanitize(Array.prototype.slice.call(arguments))
              });
              return originalCallback.apply(this, arguments);
            };
          }
          return originalSendMessage.apply(chrome.runtime, args);
        };
        patchedSendMessage.__archScanPatched = true;
        chrome.runtime.sendMessage = patchedSendMessage;
      }
      if (chrome.runtime.connect && !chrome.runtime.connect.__archScanPatched) {
        var originalConnect = chrome.runtime.connect.bind(chrome.runtime);
        var patchedConnect = function () {
          var args = Array.prototype.slice.call(arguments);
          emit("chrome.runtime.connect", { args: sanitize(args), stack: stackTrace() });
          var port = originalConnect.apply(chrome.runtime, args);
          if (port && port.postMessage) {
            var originalPortPost = port.postMessage.bind(port);
            port.postMessage = function (message) {
              emit("chrome.runtime.port.postMessage", {
                name: port.name,
                message: sanitize(message),
                stack: stackTrace()
              });
              return originalPortPost.apply(port, arguments);
            };
          }
          if (port && port.onMessage && port.onMessage.addListener) {
            port.onMessage.addListener(function (message) {
              emit("chrome.runtime.port.message", {
                name: port.name,
                message: sanitize(message)
              });
            });
          }
          return port;
        };
        patchedConnect.__archScanPatched = true;
        chrome.runtime.connect = patchedConnect;
      }
    } catch (error) {
      emit("chrome.runtime.hook.error", { error: error });
    }
  }

  function installPostMessageHook() {
    try {
      if (!window.postMessage || window.postMessage.__archScanPatched) return;
      var originalPostMessage = window.postMessage.bind(window);
      var patchedPostMessage = function (message, targetOrigin, transfer) {
        if (!message || message.source !== SOURCE) {
          emit("window.postMessage.out", {
            targetOrigin: targetOrigin,
            message: sanitize(message),
            schema: shape(message),
            stack: stackTrace()
          });
        }
        return originalPostMessage.apply(window, arguments);
      };
      patchedPostMessage.__archScanPatched = true;
      window.postMessage = patchedPostMessage;
    } catch (error) {
      emit("window.postMessage.hook.error", { error: error });
    }
  }

  function installStorageHooks() {
    try {
      if (!window.Storage || Storage.prototype.setItem.__archScanPatched) return;
      var originalSetItem = Storage.prototype.setItem;
      var originalRemoveItem = Storage.prototype.removeItem;
      var originalClear = Storage.prototype.clear;
      Storage.prototype.setItem = function (key, value) {
        emit("storage.setItem", {
          storage: this === localStorage ? "local" : this === sessionStorage ? "session" : "unknown",
          key: key,
          valueLength: String(value == null ? "" : value).length,
          valueHash: hashString(value),
          valuePreview: sanitize(truncate(value, 2000)),
          schema: shape(safeJsonParse(value))
        });
        return originalSetItem.apply(this, arguments);
      };
      Storage.prototype.setItem.__archScanPatched = true;
      Storage.prototype.removeItem = function (key) {
        emit("storage.removeItem", {
          storage: this === localStorage ? "local" : this === sessionStorage ? "session" : "unknown",
          key: key
        });
        return originalRemoveItem.apply(this, arguments);
      };
      Storage.prototype.clear = function () {
        emit("storage.clear", {
          storage: this === localStorage ? "local" : this === sessionStorage ? "session" : "unknown"
        });
        return originalClear.apply(this, arguments);
      };
    } catch (error) {
      emit("storage.hook.error", { error: error });
    }
  }

  installFetch();
  installXhr();
  installWebSocket();
  installChromeRuntimeHooks();
  installPostMessageHook();
  installStorageHooks();
  emit("scanner.page-hooked", {
    href: sanitizeUrl(location.href),
    userAgent: navigator.userAgent,
    fullLocalCapture: FULL_LOCAL_CAPTURE
  });
  setTimeout(captureStorage, 1500);
  setTimeout(captureResources, 3000);
  setInterval(captureStorage, 5 * 60 * 1000);
  setInterval(captureResources, 60 * 1000);
})();
