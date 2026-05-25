#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SOURCE = path.join(ROOT, "index.js");
const OUT_DIR = path.join(ROOT, "analysis");
const SLICES_DIR = path.join(OUT_DIR, "slices");

const SIGNALS = [
  "Client_",
  "API_",
  "/esport/",
  "/esport/ws/",
  "api.a8.to",
  "47.115.75.57",
  "chrome.runtime",
  "sendMessage",
  "getPlatform",
  "updatePlatform",
  "saveMatch",
  "saveBets",
  "saveOrder",
  "checkBet",
  "placeBet",
  "fo()",
  "new Jn",
  "wss://",
  "socket.io",
  "WebSocket",
  "mqtt",
  "OB",
  "RAY",
  "TF",
  "SABA",
  "IMT",
  "XBet",
  "Stake",
];

const DOMAINS = [
  {
    id: "00-bootstrap",
    title: "应用启动与插件检测",
    anchors: ["gB=kL", "YQe=async", "插件检测中", "Yn.init"],
  },
  {
    id: "01-plugin-bridge",
    title: "Chrome 插件通信桥",
    anchors: ["chrome.runtime", "sendMessage", "getStore", "setStore"],
  },
  {
    id: "02-local-api-client",
    title: "A8 API 客户端与本地可替换接口",
    anchors: ["Client_Login", "Client_GetMatchs", "Client_GetCollectPlatform", "Client_SaveOrder"],
  },
  {
    id: "03-odds-cache",
    title: "实时赔率缓存 fo / Jn",
    anchors: ["fo()", "new Jn", "updateBetLock", "updateOddsLock"],
  },
  {
    id: "10-ob",
    title: "OB 平台逻辑",
    anchors: ["const IMe=Xt.OB", "uY=\"https://djtop-capi", "game/view", "game/index"],
  },
  {
    id: "11-ray",
    title: "RAY 平台逻辑",
    anchors: ["Xt.RAY", "365raylinks", "cfsocket", "order_number"],
  },
  {
    id: "12-tf",
    title: "TF 平台逻辑",
    anchors: ["Xt.TF", "api-v4", "auth_token", "/esport/ws/TF"],
  },
  {
    id: "13-saba",
    title: "SABA 平台逻辑",
    anchors: ["Xt.SABA", "ESports/43/ALL", "bettype:[20,9001]", "Moneyline"],
  },
  {
    id: "14-imt",
    title: "IMT 平台逻辑",
    anchors: ["Xt.IMT", "GetAllLiveEvents", "getAllLiveEventsDelta", "BetTypes:[283]"],
  },
  {
    id: "15-xbet-stake",
    title: "XBet / Stake 聚合推送",
    anchors: ["Xt.XBet", "XBet:Score", "Stake", "ph["],
  },
  {
    id: "20-betting",
    title: "下单 / 订单 / 余额相关逻辑",
    anchors: ["Client_SaveOrder", "checkBet", "order_number", "balance", "投注"],
  },
];

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function posToLineStarts(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i += 1) {
    if (text.charCodeAt(i) === 10) starts.push(i + 1);
  }
  return starts;
}

function lineOf(starts, pos) {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (starts[mid] <= pos) lo = mid + 1;
    else hi = mid - 1;
  }
  return hi + 1;
}

function escapeMd(text) {
  return String(text).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function snippet(text, pos, radius = 180) {
  const start = Math.max(0, pos - radius);
  const end = Math.min(text.length, pos + radius);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}

function findAll(text, needle) {
  const out = [];
  let from = 0;
  while (true) {
    const idx = text.indexOf(needle, from);
    if (idx === -1) break;
    out.push(idx);
    from = idx + Math.max(needle.length, 1);
  }
  return out;
}

function findRegexAll(text, regex) {
  const out = [];
  let m;
  regex.lastIndex = 0;
  while ((m = regex.exec(text))) {
    out.push({ index: m.index, text: m[0] });
    if (m[0].length === 0) regex.lastIndex += 1;
  }
  return out;
}

function beautifyJs(input) {
  let out = "";
  let indent = 0;
  let state = "code";
  let quote = "";
  let escape = false;
  let lastNonWs = "";
  const unit = "  ";

  function trimRight() {
    out = out.replace(/[ \t]+$/g, "");
  }

  function newline(extra = 0) {
    trimRight();
    if (!out.endsWith("\n")) out += "\n";
    out += unit.repeat(Math.max(0, indent + extra));
  }

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    const next = input[i + 1];

    if (state === "string") {
      out += ch;
      if (escape) {
        escape = false;
      } else if (ch === "\\") {
        escape = true;
      } else if (ch === quote) {
        state = "code";
        quote = "";
      }
      continue;
    }

    if (state === "line-comment") {
      out += ch;
      if (ch === "\n") {
        state = "code";
        out += unit.repeat(indent);
      }
      continue;
    }

    if (state === "block-comment") {
      out += ch;
      if (ch === "*" && next === "/") {
        out += next;
        i += 1;
        state = "code";
        newline();
      }
      continue;
    }

    if (ch === "\"" || ch === "'" || ch === "`") {
      state = "string";
      quote = ch;
      out += ch;
      lastNonWs = ch;
      continue;
    }
    if (ch === "/" && next === "/") {
      state = "line-comment";
      out += ch + next;
      i += 1;
      continue;
    }
    if (ch === "/" && next === "*") {
      state = "block-comment";
      newline();
      out += ch + next;
      i += 1;
      continue;
    }

    if (ch === "{") {
      out += ch;
      indent += 1;
      newline();
      lastNonWs = ch;
      continue;
    }
    if (ch === "}") {
      indent -= 1;
      newline();
      out += ch;
      if (next && next !== ";" && next !== "," && next !== ")" && next !== "]") newline();
      lastNonWs = ch;
      continue;
    }
    if (ch === ";") {
      out += ch;
      newline();
      lastNonWs = ch;
      continue;
    }
    if (ch === ",") {
      out += ch;
      if (lastNonWs !== "," && next !== "}") newline();
      lastNonWs = ch;
      continue;
    }
    if (ch === "\n" || ch === "\r") continue;
    if (/\s/.test(ch)) {
      if (!out.endsWith(" ") && !out.endsWith("\n")) out += " ";
      continue;
    }
    out += ch;
    lastNonWs = ch;
  }

  return out.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
}

function makeSignalIndex(raw, pretty) {
  const starts = posToLineStarts(pretty);
  const rows = [];
  for (const signal of SIGNALS) {
    const positions = findAll(pretty, signal);
    for (const pos of positions.slice(0, 80)) {
      rows.push({
        signal,
        line: lineOf(starts, pos),
        snippet: snippet(pretty, pos),
      });
    }
  }

  const urls = findRegexAll(raw, /https?:\/\/[^"'`\s)\\]+|wss?:\/\/[^"'`\s)\\]+/g)
    .map((x) => x.text)
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .sort();

  const apiActions = findRegexAll(raw, /\b(?:Client|API)_[A-Za-z0-9_]+/g)
    .map((x) => x.text)
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .sort();

  const platformConstants = findRegexAll(raw, /Xt\.[A-Za-z0-9_]+/g)
    .map((x) => x.text)
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .sort();

  return { rows, urls, apiActions, platformConstants };
}

function writeDomainSlices(pretty) {
  const starts = posToLineStarts(pretty);
  const index = [];
  for (const domain of DOMAINS) {
    const hits = [];
    for (const anchor of domain.anchors) {
      for (const pos of findAll(pretty, anchor).slice(0, 12)) {
        hits.push({ anchor, pos, line: lineOf(starts, pos) });
      }
    }
    hits.sort((a, b) => a.pos - b.pos);
    const unique = [];
    for (const hit of hits) {
      if (!unique.some((x) => Math.abs(x.pos - hit.pos) < 600)) unique.push(hit);
    }

    const chunks = unique.slice(0, 8).map((hit, n) => {
      const start = Math.max(0, hit.pos - 9000);
      const end = Math.min(pretty.length, hit.pos + 18000);
      return [
        `// ---- ${domain.title} / anchor ${n + 1}: ${hit.anchor} / approx line ${hit.line} ----`,
        pretty.slice(start, end),
      ].join("\n");
    });

    const file = path.join(SLICES_DIR, `${domain.id}.js`);
    fs.writeFileSync(file, chunks.join("\n\n"), "utf8");
    index.push({ ...domain, hits: unique.map((h) => ({ anchor: h.anchor, line: h.line })) });
  }
  return index;
}

function writeMarkdown({ raw, pretty, signals, domainIndex }) {
  const lines = [];
  lines.push("# A8js/index.js 逆向分析索引");
  lines.push("");
  lines.push("## 文件概况");
  lines.push("");
  lines.push(`- 源文件：\`A8js/index.js\``);
  lines.push(`- 源文件大小：${(Buffer.byteLength(raw) / 1024 / 1024).toFixed(2)} MB`);
  lines.push(`- 可读化文件：\`A8js/analysis/index.pretty.js\``);
  lines.push(`- 业务切片目录：\`A8js/analysis/slices/\``);
  lines.push("- 判断：Vite/Vue 打包后的 ESM 产物，无 sourcemap，不能还原真实源码名，但可以还原业务流程。");
  lines.push("");
  lines.push("## 高价值入口");
  lines.push("");
  lines.push("| 领域 | 切片 | 命中锚点 |");
  lines.push("| --- | --- | --- |");
  for (const d of domainIndex) {
    const hitText = d.hits.length
      ? d.hits.map((h) => `\`${h.anchor}\`@${h.line}`).join("<br>")
      : "未命中";
    lines.push(`| ${escapeMd(d.title)} | \`slices/${d.id}.js\` | ${hitText} |`);
  }
  lines.push("");
  lines.push("## API 动作");
  lines.push("");
  for (const name of signals.apiActions) lines.push(`- \`${name}\``);
  lines.push("");
  lines.push("## 平台常量");
  lines.push("");
  for (const name of signals.platformConstants) lines.push(`- \`${name}\``);
  lines.push("");
  lines.push("## URL / WebSocket 线索");
  lines.push("");
  for (const url of signals.urls) lines.push(`- \`${url}\``);
  lines.push("");
  lines.push("## 关键词索引");
  lines.push("");
  lines.push("| 关键词 | 可读化行号 | 周边片段 |");
  lines.push("| --- | ---: | --- |");
  for (const row of signals.rows.slice(0, 900)) {
    lines.push(`| \`${escapeMd(row.signal)}\` | ${row.line} | ${escapeMd(row.snippet)} |`);
  }
  lines.push("");
  lines.push("## 推荐阅读顺序");
  lines.push("");
  lines.push("1. 先看 `slices/00-bootstrap.js`，确认应用启动、插件检测和 Vue mount。");
  lines.push("2. 再看 `slices/01-plugin-bridge.js` 与 `slices/02-local-api-client.js`，确认浏览器插件和 A8 API 契约。");
  lines.push("3. 然后看 `slices/03-odds-cache.js`，理解 `fo` 与 `Jn` 如何缓存赔率和锁盘。");
  lines.push("4. 按平台阅读 `10-ob`、`11-ray`、`12-tf`、`13-saba`、`14-imt`、`15-xbet-stake`。");
  lines.push("5. 最后看 `20-betting.js`，对照本项目的 `shared/bet_engine.js` 和各平台下单适配。");
  return lines.join("\n");
}

function main() {
  if (!fs.existsSync(SOURCE)) throw new Error(`source not found: ${SOURCE}`);
  ensureDir(OUT_DIR);
  ensureDir(SLICES_DIR);

  const raw = fs.readFileSync(SOURCE, "utf8");
  const pretty = beautifyJs(raw);
  fs.writeFileSync(path.join(OUT_DIR, "index.pretty.js"), pretty, "utf8");

  const signals = makeSignalIndex(raw, pretty);
  fs.writeFileSync(path.join(OUT_DIR, "signals.json"), JSON.stringify(signals, null, 2), "utf8");

  const domainIndex = writeDomainSlices(pretty);
  fs.writeFileSync(path.join(OUT_DIR, "domains.json"), JSON.stringify(domainIndex, null, 2), "utf8");

  const md = writeMarkdown({ raw, pretty, signals, domainIndex });
  fs.writeFileSync(path.join(OUT_DIR, "README.md"), md, "utf8");

  console.log(`Wrote ${path.join(OUT_DIR, "index.pretty.js")}`);
  console.log(`Wrote ${path.join(OUT_DIR, "README.md")}`);
}

main();
