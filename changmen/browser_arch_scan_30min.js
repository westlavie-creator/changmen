/*
  Browser Architecture Scanner - 30 minute local capture

  How to use:
  1. Open the target website in Chrome after you are logged in.
  2. Open DevTools Console.
  3. Paste this entire file and press Enter.
  4. Keep the page open for 30 minutes. Refresh once after starting if you want
     to catch startup WebSocket/fetch calls.
  5. The script downloads a JSON report automatically. You can also run:
       window.__ARCH_SCAN__.download()
       window.__ARCH_SCAN__.stop()

  Safety:
  - The script does not send data to any server.
  - Sensitive values are redacted or fingerprinted locally.
  - It records request shape, URLs, headers names, response schema, WebSocket
    message schema, storage key names, and small redacted samples.
*/
(function () {
  "use strict";

  if (window.__ARCH_SCAN__ && window.__ARCH_SCAN__.active) {
    console.warn("[arch-scan] scanner is already running");
    return;
  }

  var CONFIG = {
    durationMs: 30 * 60 * 1000,
    resourcePollMs: 10000,
    storagePollMs: 5 * 60 * 1000,
    maxRecords: 12000,
    maxTextSample: 4000,
    maxResponseBytes: 120000,
    reportPrefix: "arch-scan-report"
  };

  var SENSITIVE_KEY = /(token|authorization|auth|cookie|session|sess|password|passwd|pwd|secret|key|jwt|bearer|access|refresh|credential|csrf|xsrf|lockdown)/i;
  var SENSITIVE_VALUE = /(bearer\s+[a-z0-9._-]+|eyJ[a-zA-Z0-9._-]+|session=[^;&\s]+|token["'=:\s]+[a-z0-9._-]+)/i;
  var state = {
    active: true,
    startedAt: new Date().toISOString(),
    startedAtMs: Date.now(),
    location: sanitizeUrl(String(location.href)),
    userAgent: navigator.userAgent,
    records: [],
    counters: Object.create(null),
    seenResources: Object.create(null),
    timers: [],
    originals: {}
  };

  function count(type) {
    state.counters[type] = (state.counters[type] || 0) + 1;
  }

  function add(type, data) {
    if (!state.active) return;
    count(type);
    if (state.records.length >= CONFIG.maxRecords) {
      state.counters.dropped = (state.counters.dropped || 0) + 1;
      return;
    }
    state.records.push({
      t: Date.now() - state.startedAtMs,
      type: type,
      data: sanitize(data)
    });
  }

  function hashString(input) {
    var str = String(input == null ? "" : input);
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
    }
    return ("00000000" + (h >>> 0).toString(16)).slice(-8);
  }

  function redactValue(value, reason) {
    var str = String(value == null ? "" : value);
    return "[REDACTED:" + (reason || "sensitive") + ":len=" + str.length + ":hash=" + hashString(str) + "]";
  }

  function truncate(str, max) {
    str = String(str == null ? "" : str);
    max = max || CONFIG.maxTextSample;
    if (str.length <= max) return str;
    return str.slice(0, max) + "...[TRUNCATED len=" + str.length + "]";
  }

  function sanitizeUrl(raw) {
    try {
      var u = new URL(String(raw), location.href);
      var params = [];
      u.searchParams.forEach(function (value, key) {
        if (SENSITIVE_KEY.test(key) || SENSITIVE_VALUE.test(value)) {
          params.push(encodeURIComponent(key) + "=" + encodeURIComponent(redactValue(value, key)));
        } else {
          params.push(encodeURIComponent(key) + "=" + encodeURIComponent(truncate(value, 160)));
        }
      });
      u.search = params.length ? "?" + params.join("&") : "";
      return u.toString();
    } catch (e) {
      return truncate(String(raw), 1000);
    }
  }

  function headersToObject(headers) {
    var out = {};
    if (!headers) return out;
    try {
      if (headers instanceof Headers) {
        headers.forEach(function (value, key) { out[key] = value; });
      } else if (Array.isArray(headers)) {
        headers.forEach(function (pair) {
          if (pair && pair.length >= 2) out[pair[0]] = pair[1];
        });
      } else if (typeof headers === "object") {
        Object.keys(headers).forEach(function (key) { out[key] = headers[key]; });
      }
    } catch (e) {
      out.__error = String(e && e.message || e);
    }
    return sanitizeHeaders(out);
  }

  function sanitizeHeaders(headers) {
    var out = {};
    Object.keys(headers || {}).forEach(function (key) {
      var value = headers[key];
      out[key] = SENSITIVE_KEY.test(key) || SENSITIVE_VALUE.test(String(value))
        ? redactValue(value, key)
        : truncate(String(value), 500);
    });
    return out;
  }

  function safeJsonParse(text) {
    if (typeof text !== "string") return null;
    var s = text.trim();
    if (!s || !/^[\[{]/.test(s)) return null;
    try { return JSON.parse(s); } catch (e) { return null; }
  }

  function shape(value, depth) {
    depth = depth || 0;
    if (depth > 4) return "[MaxDepth]";
    if (value === null) return "null";
    if (Array.isArray(value)) {
      return {
        type: "array",
        length: value.length,
        sample: value.length ? shape(value[0], depth + 1) : undefined
      };
    }
    if (typeof value === "object") {
      var obj = {};
      Object.keys(value).slice(0, 80).forEach(function (key) {
        obj[key] = SENSITIVE_KEY.test(key) ? "[SensitiveField]" : shape(value[key], depth + 1);
      });
      return obj;
    }
    return typeof value;
  }

  function sanitize(value, parentKey, depth) {
    depth = depth || 0;
    if (depth > 6) return "[MaxDepth]";
    if (value === null || value === undefined) return value;
    if (typeof value === "string") {
      if (SENSITIVE_KEY.test(parentKey || "") || SENSITIVE_VALUE.test(value)) {
        return redactValue(value, parentKey || "value");
      }
      var parsed = safeJsonParse(value);
      if (parsed) return { json: sanitize(parsed, parentKey, depth + 1), rawLength: value.length };
      return truncate(value);
    }
    if (typeof value === "number" || typeof value === "boolean") return value;
    if (value instanceof Error) return { name: value.name, message: value.message, stack: truncate(value.stack || "", 1500) };
    if (Array.isArray(value)) return value.slice(0, 100).map(function (item) { return sanitize(item, parentKey, depth + 1); });
    if (typeof value === "object") {
      var out = {};
      Object.keys(value).slice(0, 120).forEach(function (key) {
        if (SENSITIVE_KEY.test(key)) out[key] = redactValue(value[key], key);
        else out[key] = sanitize(value[key], key, depth + 1);
      });
      return out;
    }
    return String(value);
  }

  function bodySample(body) {
    if (body === undefined || body === null) return undefined;
    if (typeof body === "string") return sanitize(body);
    if (body instanceof URLSearchParams) return sanitize(body.toString());
    if (body instanceof FormData) {
      var form = {};
      try {
        body.forEach(function (value, key) {
          form[key] = value instanceof File ? { fileName: value.name, size: value.size, type: value.type } : String(value);
        });
      } catch (e) {
        form.__error = String(e && e.message || e);
      }
      return sanitize(form);
    }
    if (body instanceof Blob) return { blob: true, size: body.size, type: body.type };
    if (body instanceof ArrayBuffer) return { arrayBuffer: true, byteLength: body.byteLength };
    return { type: Object.prototype.toString.call(body), string: sanitize(String(body)) };
  }

  function readResponseSample(response) {
    try {
      var headers = headersToObject(response.headers);
      var contentType = String(response.headers && response.headers.get("content-type") || "");
      var contentLength = Number(response.headers && response.headers.get("content-length") || 0);
      if (contentLength > CONFIG.maxResponseBytes) {
        return Promise.resolve({ skipped: "large-response", contentLength: contentLength, contentType: contentType, headers: headers });
      }
      if (!/(json|text|javascript|xml|html|plain|form)/i.test(contentType)) {
        return Promise.resolve({ skipped: "non-text-response", contentType: contentType, headers: headers });
      }
      return response.clone().text().then(function (text) {
        return {
          contentType: contentType,
          contentLength: contentLength || text.length,
          headers: headers,
          body: sanitize(truncate(text, CONFIG.maxTextSample)),
          schema: safeJsonParse(text) ? shape(safeJsonParse(text)) : undefined
        };
      }).catch(function (e) {
        return { error: String(e && e.message || e), contentType: contentType, headers: headers };
      });
    } catch (e) {
      return Promise.resolve({ error: String(e && e.message || e) });
    }
  }

  function installFetchHook() {
    if (!window.fetch) return;
    state.originals.fetch = window.fetch;
    window.fetch = function patchedFetch(input, init) {
      var started = performance.now();
      var url = "";
      var method = "GET";
      var headers = {};
      var requestBody;
      try {
        url = typeof input === "string" ? input : input && input.url;
        method = (init && init.method) || (input && input.method) || "GET";
        headers = Object.assign({}, headersToObject(input && input.headers), headersToObject(init && init.headers));
        requestBody = init && init.body !== undefined ? bodySample(init.body) : undefined;
      } catch (e) {
        add("fetch.inspect.error", { error: e });
      }
      return state.originals.fetch.apply(this, arguments).then(function (response) {
        readResponseSample(response).then(function (sample) {
          add("fetch", {
            method: method,
            url: sanitizeUrl(url),
            status: response.status,
            ok: response.ok,
            durationMs: Math.round(performance.now() - started),
            requestHeaders: headers,
            requestBody: requestBody,
            response: sample
          });
        });
        return response;
      }).catch(function (error) {
        add("fetch.error", {
          method: method,
          url: sanitizeUrl(url),
          durationMs: Math.round(performance.now() - started),
          requestHeaders: headers,
          requestBody: requestBody,
          error: error
        });
        throw error;
      });
    };
  }

  function installXhrHook() {
    if (!window.XMLHttpRequest) return;
    var OriginalXHR = window.XMLHttpRequest;
    state.originals.XMLHttpRequest = OriginalXHR;
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
              responseBody = sanitize(truncate(text, CONFIG.maxTextSample));
              var parsed = safeJsonParse(text);
              responseSchema = parsed ? shape(parsed) : undefined;
            }
          } catch (e) {
            responseBody = "[unavailable:" + String(e && e.message || e) + "]";
          }
          add("xhr", {
            method: meta.method,
            url: sanitizeUrl(meta.url),
            status: xhr.status,
            durationMs: Math.round(performance.now() - (meta.started || performance.now())),
            requestHeaders: sanitizeHeaders(meta.requestHeaders),
            requestBody: meta.requestBody,
            responseHeaders: sanitizeHeaders(parseRawHeaders(xhr.getAllResponseHeaders && xhr.getAllResponseHeaders())),
            responseBody: responseBody,
            responseSchema: responseSchema
          });
        });
        return originalSend.apply(xhr, arguments);
      };

      return xhr;
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

  function installWebSocketHook() {
    if (!window.WebSocket) return;
    var OriginalWebSocket = window.WebSocket;
    state.originals.WebSocket = OriginalWebSocket;
    window.WebSocket = function PatchedWebSocket(url, protocols) {
      var ws = protocols === undefined ? new OriginalWebSocket(url) : new OriginalWebSocket(url, protocols);
      var id = "ws-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
      add("ws.create", { id: id, url: sanitizeUrl(url), protocols: protocols });

      ws.addEventListener("open", function () { add("ws.open", { id: id, url: sanitizeUrl(url) }); });
      ws.addEventListener("close", function (event) { add("ws.close", { id: id, code: event.code, reason: event.reason, wasClean: event.wasClean }); });
      ws.addEventListener("error", function () { add("ws.error", { id: id, url: sanitizeUrl(url) }); });
      ws.addEventListener("message", function (event) {
        add("ws.message.in", {
          id: id,
          url: sanitizeUrl(url),
          data: wsDataSample(event.data)
        });
      });

      var originalSend = ws.send;
      ws.send = function (data) {
        add("ws.message.out", {
          id: id,
          url: sanitizeUrl(url),
          data: wsDataSample(data)
        });
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

  function wsDataSample(data) {
    if (typeof data === "string") {
      var parsed = safeJsonParse(data);
      return {
        kind: "text",
        length: data.length,
        sample: sanitize(truncate(data, CONFIG.maxTextSample)),
        schema: parsed ? shape(parsed) : undefined
      };
    }
    if (data instanceof Blob) return { kind: "blob", size: data.size, type: data.type };
    if (data instanceof ArrayBuffer) return { kind: "arrayBuffer", byteLength: data.byteLength };
    return { kind: Object.prototype.toString.call(data), sample: sanitize(String(data)) };
  }

  function captureStorage() {
    function scanStorage(name, store) {
      var items = [];
      try {
        for (var i = 0; i < store.length; i++) {
          var key = store.key(i);
          var value = store.getItem(key);
          var parsed = safeJsonParse(value);
          items.push({
            key: key,
            sensitiveKey: SENSITIVE_KEY.test(key),
            valueLength: String(value || "").length,
            valueHash: hashString(value || ""),
            valuePreview: SENSITIVE_KEY.test(key) ? "[REDACTED_BY_KEY]" : sanitize(truncate(value || "", 500)),
            jsonSchema: parsed ? shape(parsed) : undefined
          });
        }
      } catch (e) {
        items.push({ error: String(e && e.message || e) });
      }
      add("storage." + name, { items: items });
    }
    scanStorage("local", localStorage);
    scanStorage("session", sessionStorage);
  }

  function captureResources() {
    try {
      performance.getEntriesByType("resource").forEach(function (entry) {
        var key = entry.name + "|" + entry.startTime;
        if (state.seenResources[key]) return;
        state.seenResources[key] = true;
        add("resource", {
          name: sanitizeUrl(entry.name),
          initiatorType: entry.initiatorType,
          durationMs: Math.round(entry.duration),
          transferSize: entry.transferSize,
          encodedBodySize: entry.encodedBodySize,
          decodedBodySize: entry.decodedBodySize
        });
      });
    } catch (e) {
      add("resource.error", { error: e });
    }
  }

  function summarize() {
    var byHost = Object.create(null);
    var byType = Object.assign({}, state.counters);
    state.records.forEach(function (record) {
      var url = record.data && record.data.url || record.data && record.data.name;
      if (url) {
        try {
          var host = new URL(url).host;
          byHost[host] = (byHost[host] || 0) + 1;
        } catch (e) {}
      }
    });
    return {
      startedAt: state.startedAt,
      endedAt: new Date().toISOString(),
      durationMs: Date.now() - state.startedAtMs,
      page: state.location,
      userAgent: state.userAgent,
      counters: byType,
      hosts: byHost,
      recordCount: state.records.length
    };
  }

  function buildReport() {
    return {
      tool: "browser_arch_scan_30min",
      warning: "Sensitive values are redacted/fingerprinted locally. Do not share unredacted browser data.",
      summary: summarize(),
      records: state.records
    };
  }

  function download() {
    var report = buildReport();
    var json = JSON.stringify(report, null, 2);
    var blob = new Blob([json], { type: "application/json" });
    var a = document.createElement("a");
    var stamp = new Date().toISOString().replace(/[:.]/g, "-");
    a.href = URL.createObjectURL(blob);
    a.download = CONFIG.reportPrefix + "-" + location.hostname + "-" + stamp + ".json";
    document.documentElement.appendChild(a);
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 1000);
    console.log("[arch-scan] report downloaded:", a.download, "records:", state.records.length);
  }

  function stop() {
    if (!state.active) return;
    state.active = false;
    state.timers.forEach(clearInterval);
    state.timers = [];
    add("scanner.stop", { reason: "manual-or-timeout" });
    console.log("[arch-scan] stopped. records:", state.records.length);
  }

  function install() {
    installFetchHook();
    installXhrHook();
    installWebSocketHook();
    captureStorage();
    captureResources();
    state.timers.push(setInterval(captureResources, CONFIG.resourcePollMs));
    state.timers.push(setInterval(captureStorage, CONFIG.storagePollMs));
    state.timers.push(setInterval(function () {
      console.log("[arch-scan] running", Math.round((Date.now() - state.startedAtMs) / 1000) + "s", "records", state.records.length, "counters", state.counters);
    }, 60000));
    setTimeout(function () {
      stop();
      download();
    }, CONFIG.durationMs);
    add("scanner.start", {
      durationMs: CONFIG.durationMs,
      href: sanitizeUrl(location.href),
      note: "Refresh the page after starting to capture startup requests and WebSockets."
    });
    console.log("[arch-scan] started for 30 minutes. API: window.__ARCH_SCAN__.download(), stop(), report()");
  }

  window.__ARCH_SCAN__ = {
    active: true,
    state: state,
    report: buildReport,
    download: download,
    stop: stop,
    sanitize: sanitize,
    version: "1.0.0"
  };

  install();
})();
