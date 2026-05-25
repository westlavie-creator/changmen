(function () {
  "use strict";

  if (window.__OB_DATA_COLLECTOR_HOOKED__) return;
  window.__OB_DATA_COLLECTOR_HOOKED__ = true;

  var SOURCE = "OB_DATA_COLLECTOR_PAGE";
  var Core = window.ObCollectorCore;
  var MAX_TEXT = 50000;

  function emit(type, data) {
    window.postMessage({
      source: SOURCE,
      record: {
        type: type,
        t: Date.now(),
        pageUrl: location.href,
        data: data
      }
    }, "*");
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
    try { return JSON.parse(s); } catch (error) { return null; }
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
        out[key] = shape(value[key], depth + 1);
      });
      return out;
    }
    return typeof value;
  }

  function stackTrace() {
    try {
      return truncate((new Error("ob-collector-stack").stack || "").split("\n").slice(2, 12).join("\n"), 2400);
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
    } catch (error) {
      out.__error = String(error && error.message || error);
    }
    return out;
  }

  function bodySample(body) {
    if (body == null) return undefined;
    if (typeof body === "string") return truncate(body);
    if (body instanceof URLSearchParams) return body.toString();
    if (body instanceof FormData) {
      var form = {};
      body.forEach(function (value, key) {
        form[key] = value instanceof File ? { fileName: value.name, size: value.size, type: value.type } : String(value);
      });
      return form;
    }
    if (body instanceof Blob) return { blob: true, size: body.size, type: body.type };
    if (body instanceof ArrayBuffer) return { arrayBuffer: true, byteLength: body.byteLength };
    return { type: Object.prototype.toString.call(body), text: truncate(String(body)) };
  }

  function responseInfo(response, text) {
    var parsed = safeJsonParse(text);
    return {
      status: response.status,
      ok: response.ok,
      headers: headersToObject(response.headers),
      body: truncate(text),
      json: parsed,
      schema: parsed ? shape(parsed) : undefined
    };
  }

  function parseUrl(raw) {
    try { return new URL(String(raw), location.href); } catch (error) { return null; }
  }

  function classifyHttp(url) {
    if (!url) return null;
    if (/\/game\/index\b/.test(url.pathname)) return "ob.http.gameIndex";
    if (/\/game\/view\b/.test(url.pathname)) return "ob.http.gameView";
    if (/\/game\/getTimer\b/.test(url.pathname)) return "ob.http.gameTimer";
    if (/\/game\/balance\b/.test(url.pathname)) return "ob.http.balance";
    if (/\/game\/orderList\b/.test(url.pathname)) return "ob.http.orderList";
    if (/\/game\/bet\b/.test(url.pathname)) return "ob.http.bet";
    return null;
  }

  function emitHttpRecord(kind, meta, response) {
    var url = parseUrl(meta.url);
    var data = {
      method: meta.method,
      url: url ? url.toString() : meta.url,
      requestHeaders: meta.requestHeaders,
      requestBody: meta.requestBody,
      response: response,
      stack: meta.stack
    };

    if (Core && response && response.json) {
      try {
        if (kind === "ob.http.gameIndex") {
          data.matches = Core.normalizeGameIndex(response.json);
        } else if (kind === "ob.http.gameView" && url) {
          data.matchId = url.searchParams.get("match_id") || "";
          data.stageId = url.searchParams.get("stage_id") || "";
          data.markets = Core.normalizeGameView(data.matchId, data.stageId, response.json);
        } else if (kind === "ob.http.gameTimer") {
          data.timers = response.json && response.json.data ? response.json.data : response.json;
        }
      } catch (error) {
        data.normalizeError = String(error && error.message || error);
      }
    }
    emit(kind, data);
  }

  function installFetch() {
    if (!window.fetch) return;
    var originalFetch = window.fetch;
    window.fetch = function patchedFetch(input, init) {
      var started = performance.now();
      var meta = {
        method: (init && init.method) || (input && input.method) || "GET",
        url: typeof input === "string" ? input : input && input.url,
        requestHeaders: Object.assign({}, headersToObject(input && input.headers), headersToObject(init && init.headers)),
        requestBody: init && init.body !== undefined ? bodySample(init.body) : undefined,
        stack: stackTrace()
      };
      return originalFetch.apply(this, arguments).then(function (response) {
        var url = parseUrl(meta.url);
        var kind = classifyHttp(url);
        if (!kind) return response;
        response.clone().text().then(function (text) {
          var info = responseInfo(response, text);
          info.durationMs = Math.round(performance.now() - started);
          emitHttpRecord(kind, meta, info);
        }).catch(function (error) {
          emit("ob.http.response.error", { url: meta.url, error: String(error && error.message || error), stack: meta.stack });
        });
        return response;
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
        meta.stack = stackTrace();
        xhr.addEventListener("loadend", function () {
          var url = parseUrl(meta.url);
          var kind = classifyHttp(url);
          if (!kind) return;
          var text = "";
          try {
            text = xhr.responseType === "" || xhr.responseType === "text" ? xhr.responseText : "";
          } catch (error) {
            text = "";
          }
          var parsed = safeJsonParse(text);
          emitHttpRecord(kind, meta, {
            status: xhr.status,
            headers: parseRawHeaders(xhr.getAllResponseHeaders && xhr.getAllResponseHeaders()),
            body: truncate(text),
            json: parsed,
            schema: parsed ? shape(parsed) : undefined,
            durationMs: Math.round(performance.now() - (meta.started || performance.now()))
          });
        });
        return originalSend.apply(xhr, arguments);
      };
      return xhr;
    };
  }

  function bytesFromArrayBuffer(buffer) {
    return new Uint8Array(buffer);
  }

  function decodeUtf8(bytes) {
    try {
      return new TextDecoder().decode(bytes);
    } catch (error) {
      var out = "";
      for (var i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
      return out;
    }
  }

  function readMqttLength(bytes, offset) {
    var multiplier = 1;
    var value = 0;
    var pos = offset;
    var encoded;
    do {
      encoded = bytes[pos++];
      value += (encoded & 127) * multiplier;
      multiplier *= 128;
    } while ((encoded & 128) !== 0 && pos < bytes.length);
    return { value: value, offset: pos };
  }

  function decodeMqttPacket(buffer) {
    var bytes = bytesFromArrayBuffer(buffer);
    if (!bytes.length) return { packetType: "empty" };
    var first = bytes[0];
    var typeCode = first >> 4;
    var remaining = readMqttLength(bytes, 1);
    var pos = remaining.offset;
    var names = {
      1: "CONNECT",
      2: "CONNACK",
      3: "PUBLISH",
      8: "SUBSCRIBE",
      9: "SUBACK",
      12: "PINGREQ",
      13: "PINGRESP",
      14: "DISCONNECT"
    };
    var info = {
      packetType: names[typeCode] || String(typeCode),
      packetTypeCode: typeCode,
      byteLength: bytes.length
    };
    if (typeCode === 3 && pos + 2 <= bytes.length) {
      var topicLength = (bytes[pos] << 8) + bytes[pos + 1];
      pos += 2;
      var topic = decodeUtf8(bytes.slice(pos, pos + topicLength));
      pos += topicLength;
      var qos = (first & 6) >> 1;
      if (qos > 0) pos += 2;
      var payloadBytes = bytes.slice(pos);
      var payloadText = decodeUtf8(payloadBytes);
      info.topic = topic;
      info.qos = qos;
      info.payloadText = truncate(payloadText);
      info.payloadJson = safeJsonParse(payloadText);
      info.payloadSchema = info.payloadJson ? shape(info.payloadJson) : undefined;
      if (Core) info.topicInfo = Core.parseMqttTopic(topic);
    } else if (typeCode === 8) {
      pos += 2;
      var topics = [];
      while (pos + 2 <= bytes.length) {
        var len = (bytes[pos] << 8) + bytes[pos + 1];
        pos += 2;
        var subTopic = decodeUtf8(bytes.slice(pos, pos + len));
        pos += len;
        var qosByte = bytes[pos++];
        topics.push({ topic: subTopic, qos: qosByte });
      }
      info.topics = topics;
    }
    return info;
  }

  function emitMqttMessage(direction, url, decoded) {
    var topicInfo = decoded && decoded.topicInfo;
    var record = {
      direction: direction,
      url: url,
      mqtt: decoded,
      topicInfo: topicInfo,
      receivedAt: Date.now()
    };
    if (topicInfo && decoded.payloadJson) {
      record.update = {
        topic: topicInfo.topic,
        type: topicInfo.type,
        matchId: topicInfo.matchId,
        payload: decoded.payloadJson,
        receivedAt: record.receivedAt
      };
    }
    emit("ob.ws.mqtt", record);
  }

  function handleWsData(direction, url, data) {
    if (typeof data === "string") {
      emit("ob.ws.text", {
        direction: direction,
        url: url,
        length: data.length,
        text: truncate(data),
        json: safeJsonParse(data),
        schema: shape(safeJsonParse(data))
      });
      return;
    }
    if (data instanceof ArrayBuffer) {
      var decoded = decodeMqttPacket(data);
      emitMqttMessage(direction, url, decoded);
      return;
    }
    if (data instanceof Blob) {
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var decoded = decodeMqttPacket(reader.result);
          emitMqttMessage(direction, url, decoded);
        } catch (error) {
          emit("ob.ws.blob.error", { direction: direction, url: url, error: String(error && error.message || error) });
        }
      };
      reader.readAsArrayBuffer(data);
      return;
    }
    emit("ob.ws.unknown", { direction: direction, url: url, kind: Object.prototype.toString.call(data), text: truncate(String(data)) });
  }

  function installWebSocket() {
    if (!window.WebSocket) return;
    var OriginalWebSocket = window.WebSocket;
    window.WebSocket = function PatchedWebSocket(url, protocols) {
      var ws = protocols === undefined ? new OriginalWebSocket(url) : new OriginalWebSocket(url, protocols);
      var id = "ws-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
      var wsUrl = String(url || "");
      emit("ob.ws.create", { id: id, url: wsUrl, protocols: protocols, stack: stackTrace() });
      ws.addEventListener("open", function () { emit("ob.ws.open", { id: id, url: wsUrl }); });
      ws.addEventListener("close", function (event) { emit("ob.ws.close", { id: id, url: wsUrl, code: event.code, reason: event.reason, wasClean: event.wasClean }); });
      ws.addEventListener("error", function () { emit("ob.ws.error", { id: id, url: wsUrl }); });
      ws.addEventListener("message", function (event) { handleWsData("in", wsUrl, event.data); });
      var originalSend = ws.send;
      ws.send = function (data) {
        handleWsData("out", wsUrl, data);
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

  function captureEntry() {
    if (!Core) return;
    try {
      var entry = Core.parseObEntryUrl(location.href);
      if (entry.token || entry.addr && Object.keys(entry.addr).length) {
        emit("ob.entry", entry);
      }
    } catch (error) {
      emit("ob.entry.error", { error: String(error && error.message || error), href: location.href });
    }
  }

  installFetch();
  installXhr();
  installWebSocket();
  captureEntry();
  emit("ob.collector.hooked", { href: location.href, userAgent: navigator.userAgent });
})();
