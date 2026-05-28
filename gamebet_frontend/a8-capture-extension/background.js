"use strict";

importScripts("domains.js");

const ALARM_NAME = "a8-capture-finish";
const DEFAULT_CONFIG = {
  enabled: false,
  mode: "idle",
  patterns: [],
  maxRecords: 80000,
  startedAt: null,
  endsAt: null,
  durationMs: 30 * 60 * 1000,
  captureExtensionRequests: false,
  targetTabId: null
};

const A8_PAGE_PATTERNS = [
  "^https://api\\.a8\\.to(/|$)",
  "^https://.*\\.a8\\.to(/|$)"
];

async function getConfig() {
  const data = await chrome.storage.local.get(["config"]);
  return Object.assign({}, DEFAULT_CONFIG, data.config || {});
}

async function setConfig(patch) {
  const config = Object.assign(await getConfig(), patch);
  await chrome.storage.local.set({ config });
  return config;
}

async function getRecords() {
  const data = await chrome.storage.local.get(["records"]);
  return Array.isArray(data.records) ? data.records : [];
}

async function setRecords(records) {
  await chrome.storage.local.set({ records });
}

function urlMatches(url, config) {
  if (!config.enabled) return false;
  if (!config.patterns || config.patterns.length === 0) return false;
  return config.patterns.some((pattern) => {
    try {
      return new RegExp(pattern).test(url || "");
    } catch {
      return false;
    }
  });
}

function inc(map, key) {
  const k = key || "";
  map[k] = (map[k] || 0) + 1;
}

function top(map, limit = 50) {
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));
}

function summarize(records) {
  const counters = {};
  const hosts = {};
  const domainBuckets = {};
  for (const record of records) {
    counters[record.type] = (counters[record.type] || 0) + 1;
    if (record.domainBucket) inc(domainBuckets, record.domainBucket);
    const url = record.data?.url || record.data?.name || record.pageUrl || record.frameUrl;
    if (url) {
      try {
        const host = new URL(url).host;
        hosts[host] = (hosts[host] || 0) + 1;
      } catch {}
    }
  }
  return { counters, hosts, domainBuckets, recordCount: records.length };
}

function decodeSocketIoSample(sample) {
  if (typeof sample !== "string" || !sample.startsWith("42")) return null;
  try {
    const arr = JSON.parse(sample.slice(2));
    const result = { event: arr[0], argsLength: Math.max(0, arr.length - 1) };
    if (arr[0] === "chat message" && typeof arr[1] === "string") {
      const msg = JSON.parse(arr[1]);
      result.channel = msg.channel;
      result.messageKeys =
        msg.message && typeof msg.message === "object" ? Object.keys(msg.message) : [];
    }
    return result;
  } catch {
    return null;
  }
}

function parseFormBody(text) {
  if (typeof text !== "string" || !text.includes("=")) return null;
  const out = {};
  try {
    const params = new URLSearchParams(text);
    params.forEach((value, key) => {
      if (/^(matchs|bets|timer|data|payload)$/i.test(key)) {
        try {
          out[key] = JSON.parse(value);
        } catch {
          out[key] = value.length > 800 ? value.slice(0, 800) + "...[truncated]" : value;
        }
      } else if (/^(token|authorization|cookie|password|secret)$/i.test(key)) {
        out[key] = `[redacted len=${value.length}]`;
      } else {
        out[key] = value.length > 300 ? value.slice(0, 300) + "...[truncated]" : value;
      }
    });
    return out;
  } catch {
    return null;
  }
}

function extractRequestBody(record) {
  const data = record.data || {};
  const body = data.requestBody;
  if (body == null) return null;
  if (typeof body === "string") return parseFormBody(body) || body;
  if (typeof body === "object") {
    if (body.json) return body.json;
    const keys = Object.keys(body);
    if (keys.length === 1 && typeof body[keys[0]] === "string") {
      const parsed = parseFormBody(body[keys[0]]);
      if (parsed) return parsed;
    }
    return body;
  }
  return body;
}

function collectStorageKeys(records) {
  const keys = {};
  for (const record of records) {
    if (!record.type || !record.type.startsWith("storage.")) continue;
    const items = record.data?.items;
    if (Array.isArray(items)) {
      for (const item of items) inc(keys, `${record.type}:${item.key}`);
    } else if (record.data?.key) {
      inc(keys, `${record.type}:${record.data.key}`);
    }
  }
  return top(keys, 200);
}

function analyze(records) {
  const httpEndpoints = {};
  const wsUrls = {};
  const wsChannels = {};
  const wsEvents = {};
  const chromeMessages = {};
  const postMessages = {};
  const errors = {};
  const byHost = {};

  for (const record of records) {
    const data = record.data || {};
    const url = data.url || data.name || "";
    if (url) {
      try {
        inc(byHost, new URL(url).host);
      } catch {}
    }

    if (
      record.type === "fetch" ||
      record.type === "xhr" ||
      record.type === "fetch.error" ||
      record.type === "webRequest"
    ) {
      inc(httpEndpoints, `${data.method || ""} ${url}`);
    }

    if (record.type && record.type.startsWith("ws.")) {
      inc(wsUrls, url);
      const decoded = data.data?.decoded;
      if (decoded?.event) inc(wsEvents, decoded.event);
      if (decoded?.channel) inc(wsChannels, decoded.channel);

      const sample = data.data?.sample;
      const fallback = decodeSocketIoSample(typeof sample === "string" ? sample : "");
      if (fallback?.event) inc(wsEvents, fallback.event);
      if (fallback?.channel) inc(wsChannels, fallback.channel);
    }

    if (record.type && record.type.startsWith("chrome.runtime")) {
      const args = data.args || [];
      const first = Array.isArray(args) ? args[0] : undefined;
      const second = Array.isArray(args) ? args[1] : undefined;
      const msg = typeof first === "string" ? second : first;
      const msgType =
        msg && typeof msg === "object"
          ? msg.type || msg.action || msg.method || "(object)"
          : typeof msg;
      inc(chromeMessages, `${record.type}:${msgType || ""}`);
    }

    if (record.type && record.type.startsWith("window.postMessage")) {
      const msg = data.message;
      const msgType =
        msg && typeof msg === "object"
          ? msg.source || msg.type || msg.action || "(object)"
          : typeof msg;
      inc(postMessages, `${record.type}:${msgType || ""}`);
    }

    if (record.type && /error/i.test(record.type)) {
      inc(errors, record.type);
    }
  }

  return {
    byHost: top(byHost, 50),
    topHttpEndpoints: top(httpEndpoints, 120),
    topWebSocketUrls: top(wsUrls, 50),
    socketIoChannels: top(wsChannels, 50),
    socketIoEvents: top(wsEvents, 50),
    chromeRuntimeMessages: top(chromeMessages, 100),
    windowPostMessages: top(postMessages, 100),
    storageKeys: collectStorageKeys(records),
    errors: top(errors, 50),
    byDomain: DomainCapture.analyzeByDomain(records, { extractRequestBody })
  };
}

const tabUrlCache = new Map();

async function getTabUrl(tabId) {
  if (tabId == null || tabId < 0) return null;
  const cached = tabUrlCache.get(tabId);
  if (cached && Date.now() - cached.at < 15000) return cached.url;
  try {
    const tab = await chrome.tabs.get(tabId);
    tabUrlCache.set(tabId, { url: tab.url, at: Date.now() });
    return tab.url;
  } catch {
    return null;
  }
}

async function shouldCaptureForTab(tabId, config) {
  if (!config.enabled) return false;
  if (config.mode === "a8-30min" || config.patterns.includes(".*")) return true;
  const tabUrl = await getTabUrl(tabId);
  if (tabUrl && urlMatches(tabUrl, config)) return true;
  if (config.captureExtensionRequests && (tabId == null || tabId < 0)) return true;
  return false;
}

async function appendRecord(record, sender) {
  const config = await getConfig();
  const pageUrl = record.pageUrl || record.frameUrl || sender?.tab?.url || "";
  const tabId = sender?.tab?.id ?? record.tabId;

  let allowed = false;
  if (config.mode === "a8-30min" || config.patterns.includes(".*")) {
    allowed = true;
  } else if (pageUrl && urlMatches(pageUrl, config)) {
    allowed = true;
  } else if (tabId != null && (await shouldCaptureForTab(tabId, config))) {
    allowed = true;
  } else if (config.captureExtensionRequests && record.type === "webRequest") {
    allowed = true;
  }

  if (!allowed) return { stored: false, reason: "disabled-or-url-not-matched" };

  const enriched = DomainCapture.enrichRecord(record);
  if (config.mode === "a8-30min" && !DomainCapture.shouldStoreRecord(enriched)) {
    return { stored: false, reason: "filtered-noise-or-non-target-domain" };
  }

  const records = await getRecords();
  records.push(
    Object.assign({}, enriched, {
      storedAt: new Date().toISOString(),
      tabId: tabId ?? record.tabId,
      senderUrl: sender?.url
    })
  );

  const overflow = Math.max(0, records.length - config.maxRecords);
  if (overflow > 0) records.splice(0, overflow);
  await setRecords(records);
  return { stored: true, count: records.length };
}

function requestBodyToText(details) {
  if (!details.requestBody) return undefined;
  try {
    if (details.requestBody.formData) {
      const parts = [];
      for (const [key, values] of Object.entries(details.requestBody.formData)) {
        for (const value of values) {
          parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
        }
      }
      return parts.join("&");
    }
    if (details.requestBody.raw && details.requestBody.raw.length) {
      const chunks = details.requestBody.raw
        .map((part) => {
          if (part.bytes) return new TextDecoder().decode(part.bytes);
          if (part.file) return `[file:${part.file}]`;
          return "";
        })
        .filter(Boolean);
      return chunks.join("");
    }
  } catch {}
  return undefined;
}

async function onWebRequest(details) {
  const config = await getConfig();
  if (!config.enabled) return;

  // 页面内 fetch/xhr/ws 已由 hook.js 采集；此处只补插件 background 代发（tabId < 0）
  const fromExtensionBg =
    details.tabId < 0 || String(details.initiator || "").startsWith("chrome-extension://");
  if (!fromExtensionBg) return;

  const tabUrl = await getTabUrl(details.tabId);
  let allowed = false;
  if (config.mode === "a8-30min" || config.patterns.includes(".*")) {
    allowed = true;
  } else if (tabUrl && urlMatches(tabUrl, config)) {
    allowed = true;
  } else if (config.captureExtensionRequests) {
    allowed = true;
  }
  if (!allowed) return;

  const bodyText = requestBodyToText(details);
  await appendRecord(
    {
      type: "webRequest",
      t: Date.now(),
      tabId: details.tabId,
      pageUrl: tabUrl || undefined,
      data: {
        requestId: details.requestId,
        method: details.method,
        url: details.url,
        type: details.type,
        initiator: details.initiator,
        requestBody: bodyText,
        parsedBody: bodyText ? parseFormBody(bodyText) : undefined,
        fromExtension: details.tabId < 0
      }
    },
    null
  );
}

chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    onWebRequest(details).catch(() => {});
  },
  { urls: ["<all_urls>"] },
  ["requestBody"]
);

async function currentTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

function originPattern(url) {
  const u = new URL(url);
  return "^" + u.origin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(/|$)";
}

async function exportReport() {
  const config = await getConfig();
  const records = await getRecords();
  const report = {
    tool: "a8_traffic_capture_extension",
    version: "1.1.0",
    capturePolicy: "A8 域（api.a8.to、47.115.75.57 等）+ 运行时发现的全部平台域；CDN/浏览器 噪声不入库",
    warning:
      "本报告在本地生成，可能包含 token、请求体、存储内容等敏感信息。分享前请自行脱敏审查。",
    exportedAt: new Date().toISOString(),
    config,
    domainConfig: {
      a8Hosts: Array.from(DomainCapture.A8_HOST_EXACT),
      a8Suffixes: DomainCapture.A8_HOST_SUFFIXES,
      platformSeedHints: DomainCapture.PLATFORM_SEED_HINTS
    },
    summary: summarize(records),
    analysis: analyze(records),
    records
  };
  const json = JSON.stringify(report, null, 2);
  const url = "data:application/json;charset=utf-8," + encodeURIComponent(json);
  const filename = `a8-capture-report-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  await chrome.downloads.download({ url, filename, saveAs: true });
  return { filename, count: records.length };
}

async function finishScheduledScan(reason) {
  const config = await getConfig();
  if (!config.enabled && config.mode !== "a8-30min") return { ok: false, reason: "not-running" };

  await setConfig({ enabled: false, mode: "idle", endsAt: new Date().toISOString() });
  await chrome.alarms.clear(ALARM_NAME);

  let exportResult = null;
  try {
    exportResult = await exportReport();
  } catch (error) {
    exportResult = { error: String(error && error.message || error) };
  }

  try {
    await chrome.notifications.create({
      type: "basic",
      iconUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z/C/HwAFgwJ/l3+5yQAAAABJRU5ErkJggg==",
      title: "A8 采集已完成",
      message: `原因: ${reason}。记录 ${exportResult?.count ?? "?"} 条，已触发 JSON 导出。`
    });
  } catch {}

  return { ok: true, reason, exportResult };
}

async function startA830Min() {
  await setRecords([]);
  const startedAt = new Date().toISOString();
  const endsAt = new Date(Date.now() + DEFAULT_CONFIG.durationMs).toISOString();
  const tab = await currentTab().catch(() => null);

  const config = await setConfig({
    enabled: true,
    mode: "a8-30min",
    patterns: [...A8_PAGE_PATTERNS, ".*"],
    captureExtensionRequests: true,
    startedAt,
    endsAt,
    durationMs: DEFAULT_CONFIG.durationMs,
    targetTabId: tab?.id ?? null
  });

  await chrome.alarms.clear(ALARM_NAME);
  await chrome.alarms.create(ALARM_NAME, { delayInMinutes: 30 });

  return { ok: true, config, hint: "请刷新 A8 控制台页面（F5），并保持登录状态约 30 分钟。" };
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== ALARM_NAME) return;
  finishScheduledScan("30分钟定时结束").catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (!message || !message.type) return { ok: false, error: "missing-message-type" };

    if (message.type === "arch-scan-record") {
      return appendRecord(message.record, sender);
    }

    if (message.type === "arch-scan-status") {
      const config = await getConfig();
      const records = await getRecords();
      const tab = await currentTab().catch(() => null);
      const remainingMs = config.endsAt ? Math.max(0, Date.parse(config.endsAt) - Date.now()) : 0;
      return {
        ok: true,
        config,
        currentTabUrl: tab?.url,
        currentOriginPattern: tab?.url ? originPattern(tab.url) : null,
        summary: summarize(records),
        remainingMs
      };
    }

    if (message.type === "arch-scan-start-a8-30min") {
      return startA830Min();
    }

    if (message.type === "arch-scan-start-current-origin") {
      const tab = await currentTab();
      const pattern = originPattern(tab.url);
      const config = await setConfig({
        enabled: true,
        mode: "origin",
        patterns: Array.from(new Set([...(await getConfig()).patterns, pattern])),
        captureExtensionRequests: true,
        startedAt: new Date().toISOString(),
        endsAt: null
      });
      return { ok: true, config, pattern };
    }

    if (message.type === "arch-scan-start-all") {
      const config = await setConfig({
        enabled: true,
        mode: "all",
        patterns: [".*"],
        captureExtensionRequests: true,
        startedAt: new Date().toISOString(),
        endsAt: null
      });
      return { ok: true, config };
    }

    if (message.type === "arch-scan-stop") {
      await chrome.alarms.clear(ALARM_NAME);
      const config = await setConfig({ enabled: false, mode: "idle", endsAt: new Date().toISOString() });
      return { ok: true, config };
    }

    if (message.type === "arch-scan-finish-now") {
      return finishScheduledScan("手动结束并导出");
    }

    if (message.type === "arch-scan-clear") {
      await setRecords([]);
      return { ok: true };
    }

    if (message.type === "arch-scan-export") {
      return Object.assign({ ok: true }, await exportReport());
    }

    return { ok: false, error: "unknown-message-type" };
  })()
    .then(sendResponse)
    .catch((error) => {
      sendResponse({ ok: false, error: String(error && error.message || error) });
    });
  return true;
});
