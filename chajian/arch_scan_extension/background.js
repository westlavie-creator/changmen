"use strict";

const DEFAULT_CONFIG = {
  enabled: false,
  patterns: [],
  maxRecords: 50000,
  startedAt: null
};

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
  return config.patterns.some(pattern => {
    try {
      return new RegExp(pattern).test(url || "");
    } catch {
      return false;
    }
  });
}

function summarize(records) {
  const counters = {};
  const hosts = {};
  for (const record of records) {
    counters[record.type] = (counters[record.type] || 0) + 1;
    const url = record.data?.url || record.data?.name || record.pageUrl || record.frameUrl;
    if (url) {
      try {
        const host = new URL(url).host;
        hosts[host] = (hosts[host] || 0) + 1;
      } catch {}
    }
  }
  return { counters, hosts, recordCount: records.length };
}

function inc(map, key) {
  const k = key || "";
  map[k] = (map[k] || 0) + 1;
}

function top(map, limit = 50) {
  return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, limit);
}

function decodeSocketIoSample(sample) {
  if (typeof sample !== "string" || !sample.startsWith("42")) return null;
  try {
    const arr = JSON.parse(sample.slice(2));
    const result = { event: arr[0], argsLength: Math.max(0, arr.length - 1) };
    if (arr[0] === "chat message" && typeof arr[1] === "string") {
      const msg = JSON.parse(arr[1]);
      result.channel = msg.channel;
      result.messageKeys = msg.message && typeof msg.message === "object" ? Object.keys(msg.message) : [];
    }
    return result;
  } catch {
    return null;
  }
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
      try { inc(byHost, new URL(url).host); } catch {}
    }

    if (record.type === "fetch" || record.type === "xhr" || record.type === "fetch.error") {
      inc(httpEndpoints, `${data.method || ""} ${url}`);
    }

    if (record.type && record.type.startsWith("ws.")) {
      inc(wsUrls, url);
      const decoded = data.data?.decoded;
      if (decoded?.event) inc(wsEvents, decoded.event);
      if (decoded?.channel) inc(wsChannels, decoded.channel);

      const sample = data.data?.sample;
      const fallback = decodeSocketIoSample(sample);
      if (fallback?.event) inc(wsEvents, fallback.event);
      if (fallback?.channel) inc(wsChannels, fallback.channel);
    }

    if (record.type && record.type.startsWith("chrome.runtime")) {
      const args = data.args || [];
      const first = Array.isArray(args) ? args[0] : undefined;
      const second = Array.isArray(args) ? args[1] : undefined;
      const msg = typeof first === "string" ? second : first;
      const msgType = msg && typeof msg === "object" ? msg.type || msg.action || msg.method || "(object)" : typeof msg;
      inc(chromeMessages, `${record.type}:${msgType || ""}`);
    }

    if (record.type && record.type.startsWith("window.postMessage")) {
      const msg = data.message;
      const msgType = msg && typeof msg === "object" ? msg.source || msg.type || msg.action || "(object)" : typeof msg;
      inc(postMessages, `${record.type}:${msgType || ""}`);
    }

    if (record.type && /error/i.test(record.type)) {
      inc(errors, record.type);
    }
  }

  return {
    byHost: top(byHost, 50),
    topHttpEndpoints: top(httpEndpoints, 100),
    topWebSocketUrls: top(wsUrls, 50),
    socketIoChannels: top(wsChannels, 50),
    socketIoEvents: top(wsEvents, 50),
    chromeRuntimeMessages: top(chromeMessages, 100),
    windowPostMessages: top(postMessages, 100),
    storageKeys: collectStorageKeys(records),
    errors: top(errors, 50)
  };
}

async function appendRecord(record, sender) {
  const config = await getConfig();
  const pageUrl = record.pageUrl || record.frameUrl || sender?.tab?.url || "";
  if (!urlMatches(pageUrl, config)) return { stored: false, reason: "disabled-or-url-not-matched" };

  const records = await getRecords();
  records.push(Object.assign({}, record, {
    storedAt: new Date().toISOString(),
    tabId: sender?.tab?.id,
    senderUrl: sender?.url
  }));

  const overflow = Math.max(0, records.length - config.maxRecords);
  if (overflow > 0) records.splice(0, overflow);
  await setRecords(records);
  return { stored: true, count: records.length };
}

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
    tool: "local_arch_scan_extension",
    warning: "Local-only capture. This report may include raw request data and browser storage values. Review before sharing.",
    exportedAt: new Date().toISOString(),
    config,
    summary: summarize(records),
    analysis: analyze(records),
    records
  };
  const json = JSON.stringify(report, null, 2);
  const url = "data:application/json;charset=utf-8," + encodeURIComponent(json);
  const filename = `arch-scan-report-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  await chrome.downloads.download({ url, filename, saveAs: true });
  return { filename, count: records.length };
}

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
      return {
        ok: true,
        config,
        currentTabUrl: tab?.url,
        currentOriginPattern: tab?.url ? originPattern(tab.url) : null,
        summary: summarize(records)
      };
    }

    if (message.type === "arch-scan-start-current-origin") {
      const tab = await currentTab();
      const pattern = originPattern(tab.url);
      const config = await setConfig({
        enabled: true,
        patterns: Array.from(new Set([...(await getConfig()).patterns, pattern])),
        startedAt: new Date().toISOString()
      });
      return { ok: true, config, pattern };
    }

    if (message.type === "arch-scan-start-all") {
      const config = await setConfig({
        enabled: true,
        patterns: [".*"],
        startedAt: new Date().toISOString()
      });
      return { ok: true, config };
    }

    if (message.type === "arch-scan-stop") {
      const config = await setConfig({ enabled: false });
      return { ok: true, config };
    }

    if (message.type === "arch-scan-clear") {
      await setRecords([]);
      return { ok: true };
    }

    if (message.type === "arch-scan-export") {
      return Object.assign({ ok: true }, await exportReport());
    }

    return { ok: false, error: "unknown-message-type" };
  })().then(sendResponse).catch(error => {
    sendResponse({ ok: false, error: String(error && error.message || error) });
  });
  return true;
});
