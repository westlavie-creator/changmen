#!/usr/bin/env node
"use strict";

/**
 * 将 Chrome DevTools 导出的 HAR 转为与采集插件类似的 byDomain 摘要。
 *
 * 用法:
 *   node har-to-summary.js path/to/export.har
 *   node har-to-summary.js export.har --out summary.json
 *   node har-to-summary.js export.har --samples 50
 *
 * 说明:
 * - HAR 仅含该标签页 Network 面板可见的请求，不含配套插件 background 代发 HTTP。
 * - WebSocket 帧依赖 Chrome 导出是否包含 _webSocketMessages。
 */

const fs = require("fs");
const path = require("path");
const DomainCapture = require("./domains.js");

function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = { harPath: null, out: null, samples: 80, pretty: true };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--out" || a === "-o") {
      opts.out = args[++i];
    } else if (a === "--samples") {
      opts.samples = Math.max(0, Number(args[++i]) || 80);
    } else if (a === "--compact") {
      opts.pretty = false;
    } else if (a === "--help" || a === "-h") {
      opts.help = true;
    } else if (!a.startsWith("-") && !opts.harPath) {
      opts.harPath = a;
    }
  }
  return opts;
}

function printHelp() {
  console.log(`用法: node har-to-summary.js <file.har> [--out summary.json] [--samples 80]

将 HAR 按 A8 域 / 平台域汇总，输出结构与插件 analysis.byDomain 对齐。`);
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

function requestBodyFromHar(request) {
  const post = request?.postData;
  if (!post) return null;
  if (post.text) return parseFormBody(post.text) || post.text.slice(0, 4000);
  if (Array.isArray(post.params)) {
    const out = {};
    for (const p of post.params) {
      if (!p?.name) continue;
      if (/^(matchs|bets|timer)$/i.test(p.name)) {
        try {
          out[p.name] = JSON.parse(p.value || "");
        } catch {
          out[p.name] = p.value;
        }
      } else if (/^(token|authorization)$/i.test(p.name)) {
        out[p.name] = `[redacted]`;
      } else {
        out[p.name] = p.value;
      }
    }
    return out;
  }
  return null;
}

function responsePreview(response) {
  const text = response?.content?.text;
  if (!text) return null;
  const mime = response?.content?.mimeType || "";
  if (!/(json|text|javascript|xml|html|plain|form)/i.test(mime) && text.length > 500) {
    return `[binary or large ${mime} len=${text.length}]`;
  }
  return text.length > 1500 ? text.slice(0, 1500) + "...[truncated]" : text;
}

function decodeSocketIoText(text) {
  const str = String(text || "");
  if (!str.startsWith("42")) return null;
  try {
    const eventPayload = JSON.parse(str.slice(2));
    const info = { event: eventPayload[0] };
    if (eventPayload[0] === "chat message" && typeof eventPayload[1] === "string") {
      const chat = JSON.parse(eventPayload[1]);
      info.channel = chat.channel;
      info.messageKeys =
        chat.message && typeof chat.message === "object" ? Object.keys(chat.message) : [];
    }
    return info;
  } catch {
    return null;
  }
}

function harEntryToRecord(entry) {
  const url = entry.request?.url || "";
  const host = DomainCapture.extractHostFromUrl(url);
  const domain = DomainCapture.classifyHost(host);
  let endpoint = null;
  try {
    const u = new URL(url);
    endpoint = `${entry.request?.method || "GET"} ${u.pathname}`;
  } catch {}

  return {
    type: "har.http",
    startedDateTime: entry.startedDateTime,
    timeMs: entry.time,
    domainBucket: domain.bucket,
    domainHost: domain.host,
    providerHint: domain.providerHint,
    endpoint,
    data: {
      method: entry.request?.method,
      url,
      status: entry.response?.status,
      requestBody: requestBodyFromHar(entry.request),
      responsePreview: responsePreview(entry.response),
      mimeType: entry.response?.content?.mimeType
    }
  };
}

function harWebSocketToRecords(entry) {
  const url = entry.request?.url || "";
  const host = DomainCapture.extractHostFromUrl(url);
  const domain = DomainCapture.classifyHost(host);
  const messages = entry._webSocketMessages;
  if (!Array.isArray(messages) || messages.length === 0) return [];

  return messages.map((msg) => {
    const decoded = typeof msg.data === "string" ? decodeSocketIoText(msg.data) : null;
    return {
      type: msg.type === "send" ? "har.ws.out" : "har.ws.in",
      startedDateTime: entry.startedDateTime,
      domainBucket: domain.bucket,
      domainHost: domain.host,
      providerHint: domain.providerHint,
      data: {
        url,
        data: {
          kind: "text",
          length: String(msg.data || "").length,
          sample:
            String(msg.data || "").length > 2000
              ? String(msg.data).slice(0, 2000) + "...[truncated]"
              : msg.data,
          decoded
        }
      }
    };
  });
}

function buildSummary(records, opts) {
  const filtered = records.filter((r) => {
    if (r.domainBucket === "a8" || r.domainBucket === "platform") return true;
    return r.type.startsWith("har.ws");
  });

  const byDomain = DomainCapture.analyzeByDomain(
    filtered.map((r) => ({
      type:
        r.type === "har.http"
          ? "xhr"
          : r.type === "har.ws.in"
            ? "ws.message.in"
            : r.type === "har.ws.out"
              ? "ws.message.out"
              : r.type,
      t: 0,
      domainBucket: r.domainBucket,
      domainHost: r.domainHost,
      providerHint: r.providerHint,
      endpoint: r.endpoint,
      data: r.data
    })),
    {
      extractRequestBody: (record) => record.data?.requestBody ?? null
    }
  );

  const noiseSkipped = records.filter((r) => r.domainBucket === "noise").length;
  const httpCount = records.filter((r) => r.type === "har.http").length;
  const wsCount = records.filter((r) => r.type.startsWith("har.ws")).length;

  const trimSamples = (bucket) => {
    if (!bucket?.samples || opts.samples <= 0) {
      if (bucket) bucket.samples = [];
      return;
    }
    if (bucket.samples.length > opts.samples) {
      bucket.samples = bucket.samples.slice(-opts.samples);
    }
  };
  trimSamples(byDomain.a8);
  trimSamples(byDomain.platform);

  return {
    tool: "har-to-summary",
    version: "1.0.0",
    source: "chrome-devtools-har",
    warning:
      "HAR 不含配套插件 background 代发的平台 HTTP。若 platform 为空但插件报告有数据，属正常现象。",
    limitations: [
      "仅包含导出 HAR 时该标签页 Network 可见请求",
      "不含 chrome.runtime / 其他扩展 background 代发",
      "WebSocket 依赖 HAR 是否含 _webSocketMessages"
    ],
    generatedAt: new Date().toISOString(),
    stats: {
      harEntriesTotal: records.length,
      httpEntries: httpCount,
      webSocketMessages: wsCount,
      noiseSkipped,
      keptForAnalysis: filtered.length
    },
    byDomain
  };
}

function loadHar(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const har = JSON.parse(raw);
  const entries = har?.log?.entries;
  if (!Array.isArray(entries)) {
    throw new Error("无效 HAR：缺少 log.entries");
  }
  return { har, entries };
}

function main() {
  const opts = parseArgs(process.argv);
  if (opts.help || !opts.harPath) {
    printHelp();
    process.exit(opts.help ? 0 : 1);
  }

  const harPath = path.resolve(opts.harPath);
  if (!fs.existsSync(harPath)) {
    console.error("文件不存在:", harPath);
    process.exit(1);
  }

  const { har, entries } = loadHar(harPath);
  const records = [];

  for (const entry of entries) {
    const rec = harEntryToRecord(entry);
    if (DomainCapture.shouldStoreRecord({
      type: rec.type,
      data: rec.data,
      domainBucket: rec.domainBucket
    })) {
      records.push(rec);
    } else if (rec.domainBucket === "noise") {
      records.push(rec);
    }

    for (const wsRec of harWebSocketToRecords(entry)) {
      if (wsRec.domainBucket === "a8" || wsRec.domainBucket === "platform") {
        records.push(wsRec);
      }
    }
  }

  const summary = buildSummary(records, opts);
  summary.harMeta = {
    file: path.basename(harPath),
    creator: har?.log?.creator,
    browser: har?.log?.browser,
    pages: (har?.log?.pages || []).map((p) => ({
      title: p.title,
      startedDateTime: p.startedDateTime
    }))
  };

  const json = opts.pretty ? JSON.stringify(summary, null, 2) : JSON.stringify(summary);

  if (opts.out) {
    fs.writeFileSync(path.resolve(opts.out), json, "utf8");
    console.error(`已写入: ${path.resolve(opts.out)}`);
    console.error(
      `HTTP ${summary.stats.httpEntries}, WS 消息 ${summary.stats.webSocketMessages}, ` +
        `A8 ${summary.byDomain.a8.totalNetworkRecords}, 平台 ${summary.byDomain.platform.totalNetworkRecords}`
    );
  } else {
    console.log(json);
  }
}

main();
