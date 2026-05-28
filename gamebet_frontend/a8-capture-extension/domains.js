"use strict";

/** A8 业务域 / 中继（固定列表） */
const A8_HOST_EXACT = new Set([
  "api.a8.to",
  "47.115.75.57"
]);

const A8_HOST_SUFFIXES = ["a8.to"];

/**
 * 已知平台种子（账号 gateway 可能变化；运行时仍会动态发现新 host）
 * 仅用于报告里标注 provider 线索，不用于过滤。
 */
const PLATFORM_SEED_HINTS = {
  "dtpapialiba31.shuoxingds.com": "OB",
  "shuoxingds.com": "OB?",
  "cfinfo.365raylinks.com": "RAY",
  "365raylinks.com": "RAY",
  "rsokff9.auremi88.com": "PB",
  "auremi88.com": "PB?",
  "ilustre-analytics.org": "IA?"
};

/** 采集时可忽略的常见浏览器/CDN 噪声（不写入 records） */
const NOISE_HOST_SUFFIXES = [
  "google.com",
  "googleapis.com",
  "gstatic.com",
  "googleusercontent.com",
  "chrome.com",
  "chromium.org",
  "microsoft.com",
  "live.com",
  "office.com",
  "mozilla.org",
  "firefox.com",
  "apple.com",
  "icloud.com",
  "doubleclick.net",
  "googletagmanager.com",
  "google-analytics.com"
];

const NOISE_HOST_EXACT = new Set(["localhost", "127.0.0.1"]);

function normalizeHost(host) {
  return String(host || "")
    .toLowerCase()
    .replace(/:\d+$/, "");
}

function isA8Host(host) {
  const h = normalizeHost(host);
  if (!h) return false;
  if (A8_HOST_EXACT.has(h)) return true;
  return A8_HOST_SUFFIXES.some((suffix) => h === suffix || h.endsWith("." + suffix));
}

function isNoiseHost(host) {
  const h = normalizeHost(host);
  if (!h) return false;
  if (NOISE_HOST_EXACT.has(h)) return true;
  return NOISE_HOST_SUFFIXES.some((suffix) => h === suffix || h.endsWith("." + suffix));
}

function classifyHost(host) {
  const h = normalizeHost(host);
  if (!h) return { bucket: "unknown", host: h, providerHint: null };
  if (isA8Host(h)) return { bucket: "a8", host: h, providerHint: "A8" };
  if (isNoiseHost(h)) return { bucket: "noise", host: h, providerHint: null };
  const providerHint =
    PLATFORM_SEED_HINTS[h] ||
    Object.entries(PLATFORM_SEED_HINTS).find(([seed]) => h === seed || h.endsWith("." + seed))?.[1] ||
    null;
  return { bucket: "platform", host: h, providerHint };
}

function extractHostFromUrl(url) {
  if (!url || typeof url !== "string") return null;
  try {
    if (url.startsWith("chrome-extension://")) return "chrome-extension";
    return normalizeHost(new URL(url).hostname);
  } catch {
    return null;
  }
}

function recordTargetHost(record) {
  const data = record.data || {};
  const url = data.url || data.name || "";
  const host = extractHostFromUrl(url);
  if (host) return host;
  if (record.pageUrl) return extractHostFromUrl(record.pageUrl);
  return null;
}

function shouldStoreRecord(record) {
  const type = record.type || "";
  if (type.startsWith("storage.") || type.startsWith("chrome.runtime") || type.startsWith("scanner.")) {
    return true;
  }
  if (type.startsWith("window.postMessage")) return true;
  if (type === "inject.error" || type === "resources.snapshot") return true;

  const host = recordTargetHost(record);
  if (!host || host === "chrome-extension") {
    return type.startsWith("ws.") || type === "webRequest";
  }
  const { bucket } = classifyHost(host);
  return bucket === "a8" || bucket === "platform";
}

function enrichRecord(record) {
  const host = recordTargetHost(record);
  const domain = classifyHost(host);
  let endpoint = null;
  const url = record.data?.url || record.data?.name;
  if (url) {
    try {
      const u = new URL(url);
      endpoint = `${record.data?.method || "GET"} ${u.pathname}`;
    } catch {}
  }
  return Object.assign({}, record, {
    domainBucket: domain.bucket,
    domainHost: domain.host,
    providerHint: domain.providerHint,
    endpoint
  });
}

function inc(map, key) {
  map[key || ""] = (map[key || ""] || 0) + 1;
}

function top(map, limit = 50) {
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));
}

function isNetworkRecord(record) {
  const t = record.type || "";
  return (
    t === "fetch" ||
    t === "xhr" ||
    t === "fetch.error" ||
    t === "webRequest" ||
    t.startsWith("ws.")
  );
}

function analyzeByDomain(records, helpers) {
  const buckets = {
    a8: { hosts: {}, endpoints: {}, wsEvents: {}, wsChannels: {}, total: 0 },
    platform: { hosts: {}, endpoints: {}, wsEvents: {}, wsChannels: {}, total: 0 }
  };
  const discoveredPlatformHosts = {};
  const a8HostsSeen = {};
  const samples = { a8: [], platform: [] };

  for (const record of records) {
    if (!isNetworkRecord(record)) continue;

    const bucket = record.domainBucket;
    if (bucket !== "a8" && bucket !== "platform") continue;

    const b = buckets[bucket];
    b.total += 1;

    const host = record.domainHost || recordTargetHost(record) || "(unknown)";
    inc(b.hosts, host);
    if (bucket === "a8") inc(a8HostsSeen, host);
    if (bucket === "platform") inc(discoveredPlatformHosts, host);

    if (record.endpoint) inc(b.endpoints, record.endpoint);

    if (record.type && record.type.startsWith("ws.")) {
      const decoded = record.data?.data?.decoded;
      if (decoded?.event) inc(b.wsEvents, decoded.event);
      if (decoded?.channel) inc(b.wsChannels, decoded.channel);
    }

    if (helpers && (record.type === "fetch" || record.type === "xhr" || record.type === "webRequest")) {
      const sample = {
        t: record.t,
        storedAt: record.storedAt,
        type: record.type,
        method: record.data?.method,
        url: record.data?.url,
        host,
        endpoint: record.endpoint,
        status: record.data?.status,
        parsedBody: helpers.extractRequestBody(record),
        fromExtension: record.data?.fromExtension
      };
      const list = samples[bucket];
      if (list.length >= 100) list.shift();
      list.push(sample);
    }
  }

  const platformHostList = top(discoveredPlatformHosts, 200).map((item) => ({
    host: item.name,
    count: item.count,
    providerHint:
      PLATFORM_SEED_HINTS[item.name] ||
      Object.entries(PLATFORM_SEED_HINTS).find(
        ([seed]) => item.name === seed || item.name.endsWith("." + seed)
      )?.[1] ||
      "discovered"
  }));

  return {
    policy: "A8 固定域 + 运行时发现的全部平台域（非 A8、非 CDN 噪声）",
    a8HostsConfigured: Array.from(A8_HOST_EXACT),
    a8HostsSeen: top(a8HostsSeen, 20),
    platformHostsDiscovered: platformHostList,
    a8: {
      totalNetworkRecords: buckets.a8.total,
      hosts: top(buckets.a8.hosts, 30),
      endpoints: top(buckets.a8.endpoints, 120),
      wsEvents: top(buckets.a8.wsEvents, 30),
      wsChannels: top(buckets.a8.wsChannels, 30),
      samples: samples.a8
    },
    platform: {
      totalNetworkRecords: buckets.platform.total,
      hosts: top(buckets.platform.hosts, 200),
      endpoints: top(buckets.platform.endpoints, 200),
      wsEvents: top(buckets.platform.wsEvents, 30),
      wsChannels: top(buckets.platform.wsChannels, 30),
      samples: samples.platform
    }
  };
}

var DomainCapture = {
  A8_HOST_EXACT,
  A8_HOST_SUFFIXES,
  PLATFORM_SEED_HINTS,
  classifyHost,
  extractHostFromUrl,
  recordTargetHost,
  shouldStoreRecord,
  enrichRecord,
  analyzeByDomain
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = DomainCapture;
}
