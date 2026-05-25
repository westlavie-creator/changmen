"use strict";

try {
  importScripts("core.js");
} catch (error) {
  // Chrome exposes importScripts in the extension service worker.
}

const Core = self.ObCollectorCore || {};

const DEFAULT_CONFIG = {
  enabled: false,
  patterns: [],
  maxRecords: 100000,
  maxUpdates: 30000,
  startedAt: null
};

const EMPTY_STATE = {
  entry: null,
  matches: {},
  markets: {},
  oddsToMarket: {},
  currentOdds: {},
  timers: {},
  realtimeUpdates: [],
  requests: [],
  websockets: [],
  records: []
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

async function getState() {
  const data = await chrome.storage.local.get(["obState"]);
  return Object.assign({}, EMPTY_STATE, data.obState || {});
}

async function setState(state) {
  await chrome.storage.local.set({ obState: state });
}

function originPattern(url) {
  const u = new URL(url);
  return "^" + u.origin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(/|$)";
}

async function currentTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

function urlMatches(url, config) {
  if (!config.enabled) return false;
  if (!config.patterns || config.patterns.length === 0) return false;
  return config.patterns.some(pattern => {
    try { return new RegExp(pattern).test(url || ""); } catch { return false; }
  });
}

function pushLimited(array, item, limit) {
  array.push(item);
  const overflow = Math.max(0, array.length - limit);
  if (overflow > 0) array.splice(0, overflow);
}

function upsertMatch(state, match) {
  state.matches[match.matchId] = Object.assign({}, state.matches[match.matchId] || {}, match);
}

function upsertMarket(state, market) {
  const key = `${market.matchId}:${market.marketId}:${market.stageId}`;
  state.markets[key] = Object.assign({}, state.markets[key] || {}, market);
  (market.odds || []).forEach(odd => {
    state.oddsToMarket[odd.oddsId] = {
      matchId: market.matchId,
      marketId: market.marketId,
      stageId: market.stageId,
      side: odd.side,
      name: odd.name
    };
    state.currentOdds[odd.oddsId] = Object.assign({}, state.currentOdds[odd.oddsId] || {}, {
      provider: "OB",
      matchId: market.matchId,
      marketId: market.marketId,
      stageId: market.stageId,
      oddsId: odd.oddsId,
      name: odd.name,
      side: odd.side,
      odd: odd.odd,
      locked: market.locked,
      updatedAt: Date.now(),
      raw: odd.raw
    });
  });
}

function applyRealtimeUpdate(state, update) {
  if (!update || !update.topic) return;
  if (update.type === "market.oddsUpdate") {
    Core.applyOddsUpdate && Core.applyOddsUpdate(state, update);
    Object.keys(state.currentOdds).forEach(oddsId => {
      const map = state.oddsToMarket[oddsId];
      if (map && state.currentOdds[oddsId]) {
        state.currentOdds[oddsId] = Object.assign({}, map, state.currentOdds[oddsId]);
      }
    });
  } else if (update.type === "market.statusUpdate") {
    Core.applyMarketLockUpdate && Core.applyMarketLockUpdate(state, update, true);
  } else if (update.type === "market.suspended") {
    Core.applyMarketLockUpdate && Core.applyMarketLockUpdate(state, update, item => item.suspended === 1);
  } else if (/^odd\./.test(update.type)) {
    const payload = Array.isArray(update.payload) ? update.payload : [];
    payload.forEach(item => {
      const oddsId = String(item.id || item.odds_id || "");
      if (!oddsId) return;
      const existing = state.currentOdds[oddsId] || {};
      state.currentOdds[oddsId] = Object.assign({}, existing, {
        locked: item.status !== undefined ? item.status !== 6 : existing.locked,
        visible: item.visible,
        suspended: item.suspended,
        updatedAt: update.receivedAt || Date.now(),
        rawLastUpdate: item
      });
    });
  }
}

function summarize(state) {
  const updateTypes = {};
  const requestTypes = {};
  const wsUrls = {};
  state.realtimeUpdates.forEach(update => {
    updateTypes[update.type || update.topic || "unknown"] = (updateTypes[update.type || update.topic || "unknown"] || 0) + 1;
  });
  state.requests.forEach(req => {
    requestTypes[req.type] = (requestTypes[req.type] || 0) + 1;
  });
  state.websockets.forEach(ws => {
    if (ws.url) wsUrls[ws.url] = (wsUrls[ws.url] || 0) + 1;
  });
  return {
    matches: Object.keys(state.matches).length,
    markets: Object.keys(state.markets).length,
    currentOdds: Object.keys(state.currentOdds).length,
    realtimeUpdates: state.realtimeUpdates.length,
    requests: state.requests.length,
    websockets: state.websockets.length,
    updateTypes,
    requestTypes,
    wsUrls
  };
}

async function appendRecord(record, sender) {
  const config = await getConfig();
  const pageUrl = record.pageUrl || record.frameUrl || sender?.tab?.url || "";
  if (!urlMatches(pageUrl, config)) return { stored: false, reason: "disabled-or-url-not-matched" };

  const state = await getState();
  const storedRecord = Object.assign({}, record, {
    storedAt: new Date().toISOString(),
    tabId: sender?.tab?.id,
    senderUrl: sender?.url
  });
  pushLimited(state.records, storedRecord, config.maxRecords);

  switch (record.type) {
    case "ob.entry":
      state.entry = record.data;
      break;
    case "ob.http.gameIndex":
      (record.data.matches || []).forEach(match => upsertMatch(state, match));
      pushLimited(state.requests, {
        type: record.type,
        url: record.data.url,
        method: record.data.method,
        t: record.t,
        matches: (record.data.matches || []).length,
        request: record.data.requestBody,
        response: record.data.response
      }, config.maxRecords);
      break;
    case "ob.http.gameView":
      (record.data.markets || []).forEach(market => upsertMarket(state, market));
      pushLimited(state.requests, {
        type: record.type,
        url: record.data.url,
        method: record.data.method,
        t: record.t,
        matchId: record.data.matchId,
        stageId: record.data.stageId,
        markets: (record.data.markets || []).length,
        request: record.data.requestBody,
        response: record.data.response
      }, config.maxRecords);
      break;
    case "ob.http.gameTimer":
      state.timers[record.data.url || String(record.t)] = record.data.timers;
      pushLimited(state.requests, {
        type: record.type,
        url: record.data.url,
        method: record.data.method,
        t: record.t,
        response: record.data.response
      }, config.maxRecords);
      break;
    case "ob.http.balance":
    case "ob.http.orderList":
    case "ob.http.bet":
      pushLimited(state.requests, {
        type: record.type,
        url: record.data.url,
        method: record.data.method,
        t: record.t,
        request: record.data.requestBody,
        response: record.data.response
      }, config.maxRecords);
      break;
    case "ob.ws.create":
    case "ob.ws.open":
    case "ob.ws.close":
    case "ob.ws.error":
    case "ob.ws.text":
      pushLimited(state.websockets, Object.assign({ type: record.type, t: record.t }, record.data), config.maxRecords);
      break;
    case "ob.ws.mqtt":
      pushLimited(state.websockets, {
        type: record.type,
        direction: record.data.direction,
        url: record.data.url,
        t: record.t,
        packetType: record.data.mqtt?.packetType,
        topic: record.data.mqtt?.topic,
        topics: record.data.mqtt?.topics
      }, config.maxRecords);
      if (record.data.update) {
        pushLimited(state.realtimeUpdates, record.data.update, config.maxUpdates);
        applyRealtimeUpdate(state, record.data.update);
      }
      break;
  }

  await setState(state);
  return { stored: true, summary: summarize(state) };
}

async function exportReport() {
  const config = await getConfig();
  const state = await getState();
  const report = {
    source: "ob_data_collector_extension",
    version: "1.0.0",
    exportedAt: new Date().toISOString(),
    warning: "Local-only OB capture. Report may contain raw tokens, request bodies, storage-derived values, and platform responses.",
    config,
    summary: summarize(state),
    page: state.entry,
    matches: Object.values(state.matches),
    markets: Object.values(state.markets),
    oddsToMarket: state.oddsToMarket,
    currentOdds: state.currentOdds,
    timers: state.timers,
    realtimeUpdates: state.realtimeUpdates,
    requests: state.requests,
    websockets: state.websockets,
    records: state.records
  };
  const json = JSON.stringify(report, null, 2);
  const url = "data:application/json;charset=utf-8," + encodeURIComponent(json);
  const filename = `ob-data-report-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  await chrome.downloads.download({ url, filename, saveAs: true });
  return { filename, summary: report.summary };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (!message || !message.type) return { ok: false, error: "missing-message-type" };

    if (message.type === "ob-collector-record") {
      return Object.assign({ ok: true }, await appendRecord(message.record, sender));
    }

    if (message.type === "ob-collector-status") {
      const config = await getConfig();
      const state = await getState();
      const tab = await currentTab().catch(() => null);
      return {
        ok: true,
        config,
        currentTabUrl: tab?.url,
        currentOriginPattern: tab?.url ? originPattern(tab.url) : null,
        summary: summarize(state)
      };
    }

    if (message.type === "ob-collector-start-current-origin") {
      const tab = await currentTab();
      const pattern = originPattern(tab.url);
      const config = await setConfig({
        enabled: true,
        patterns: Array.from(new Set([...(await getConfig()).patterns, pattern])),
        startedAt: new Date().toISOString()
      });
      return { ok: true, config, pattern };
    }

    if (message.type === "ob-collector-start-all") {
      const config = await setConfig({
        enabled: true,
        patterns: [".*"],
        startedAt: new Date().toISOString()
      });
      return { ok: true, config };
    }

    if (message.type === "ob-collector-stop") {
      return { ok: true, config: await setConfig({ enabled: false }) };
    }

    if (message.type === "ob-collector-clear") {
      await setState(JSON.parse(JSON.stringify(EMPTY_STATE)));
      return { ok: true };
    }

    if (message.type === "ob-collector-export") {
      return Object.assign({ ok: true }, await exportReport());
    }

    return { ok: false, error: "unknown-message-type" };
  })().then(sendResponse).catch(error => {
    sendResponse({ ok: false, error: String(error && error.message || error) });
  });
  return true;
});
