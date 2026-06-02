"use strict";

const path = require("path");
const { A8_INDEX_SOURCES } = require("../platforms/ob/ob_feed.js");

/** ObFeed 构造参数；`OB_FEED_MODE=a8` 时对齐 UMe（单源 index + 1500ms stage） */
function buildObFeedOptions() {
  const base = { indexIntervalMs: 30000 };
  const mode = String(process.env.OB_FEED_MODE || "").trim().toLowerCase();
  if (mode === "a8") {
    return {
      ...base,
      feedMode: "a8",
      indexSources: A8_INDEX_SOURCES,
      stageDelayMs: 1500,
    };
  }
  return base;
}

/**
 * A8 vendor 全平台注册表 — 采集模式与本地 Feed 接入状态。
 * 全 11 平台 Feed 均已接入；各平台通过 ENABLE_{ID}=1 启用。
 */
const PLATFORMS = [
  {
    id: "OB",
    label: "OB",
    labelZh: "OB",
    collectionMode: "http_mqtt",
    collectionDesc: "HTTP 快照（game/index、view）+ MQTT 增量",
    implementation: "done",
    feed: { module: "../platforms/ob/ob_feed.js", export: "ObFeed" },
    envEnable: "ENABLE_OB",
    defaultEnabled: true,
    feedOptions: buildObFeedOptions(),
    streamMeta: { key: "mqtt", protocol: "MQTT" },
    pagePath: "/platforms/ob/",
  },
  {
    id: "RAY",
    label: "RAY",
    labelZh: "RAY",
    collectionMode: "http_ws",
    collectionDesc: "HTTP 快照（match/odds）+ 专用 WebSocket",
    implementation: "done",
    feed: { module: "../platforms/ray/ray_feed.js", export: "RayFeed" },
    envEnable: "ENABLE_RAY",
    defaultEnabled: true,
    feedOptions: { syncIntervalMs: 30000 },
    streamMeta: { key: "ws", protocol: "WS" },
    pagePath: "/platforms/ray/",
  },
  {
    id: "PB",
    label: "PB",
    labelZh: "平博",
    collectionMode: "http_poll",
    collectionDesc: "高频 HTTP 轮询 euro/odds（约 5s），插件 token",
    implementation: "done",
    feed: { module: "../platforms/pb/pb_feed.js", export: "PbFeed" },
    envEnable: "ENABLE_PB",
    defaultEnabled: false,
    feedOptions: { syncIntervalMs: Number(process.env.PB_SYNC_MS || 5000) },
    streamMeta: null,
    pagePath: "/platforms/pb/",
  },
  {
    id: "TF",
    label: "TF",
    labelZh: "TF",
    collectionMode: "http_ws",
    collectionDesc: "HTTP events 快照 + /esport/ws/TF 隧道",
    implementation: "done",
    feed: { module: "../platforms/tf/tf_feed.js", export: "TfFeed" },
    envEnable: "ENABLE_TF",
    defaultEnabled: false,
    feedOptions: { syncIntervalMs: Number(process.env.TF_SYNC_MS || 30000) },
    streamMeta: { key: "ws", protocol: "WS" },
    pagePath: "/platforms/tf/",
  },
  {
    id: "IA",
    label: "IA",
    labelZh: "IA",
    collectionMode: "http_ws",
    collectionDesc: "插件 HTTP（ilustre-analytics）+ IA WebSocket 房间",
    implementation: "done",
    feed: { module: "../platforms/ia/ia_feed.js", export: "IaFeed" },
    envEnable: "ENABLE_IA",
    defaultEnabled: false,
    feedOptions: { syncIntervalMs: Number(process.env.IA_SYNC_MS || 30000) },
    streamMeta: { key: "ws", protocol: "Socket.IO" },
    pagePath: "/platforms/ia/",
  },
  {
    id: "IM",
    label: "IM",
    labelZh: "IM",
    collectionMode: "aggregator_ws",
    collectionDesc: "A8 公共 Socket.IO 频道 IM（聚合推送）",
    implementation: "done",
    feed: { module: "../platforms/im/im_feed.js", export: "ImFeed" },
    envEnable: "ENABLE_IM",
    defaultEnabled: false,
    feedOptions: { platformId: "IM" },
    streamMeta: { key: "ws", protocol: "Socket.IO" },
    pagePath: "/platforms/im/",
  },
  {
    id: "SABA",
    label: "SABA",
    labelZh: "沙巴",
    collectionMode: "parse_ws",
    collectionDesc: "页面解析 gateway/token + 自有 WebSocket",
    implementation: "done",
    feed: { module: "../platforms/saba/saba_feed.js", export: "SabaFeed" },
    envEnable: "ENABLE_SABA",
    defaultEnabled: false,
    feedOptions: { checkinIntervalMs: Number(process.env.SABA_CHECKIN_MS || 3000) },
    streamMeta: { key: "ws", protocol: "Socket.IO" },
    pagePath: "/platforms/saba/",
  },
  {
    id: "XBet",
    label: "XBet",
    labelZh: "XBet",
    collectionMode: "aggregator_ws",
    collectionDesc: "A8 公共 Socket.IO XBet / XBet:Score",
    implementation: "done",
    feed: { module: "../platforms/xbet/xbet_feed.js", export: "XbetFeed" },
    envEnable: "ENABLE_XBET",
    defaultEnabled: false,
    feedOptions: { platformId: "XBet" },
    streamMeta: { key: "ws", protocol: "Socket.IO" },
    pagePath: "/platforms/xbet/",
  },
  {
    id: "IMT",
    label: "IMT",
    labelZh: "IMT",
    collectionMode: "http_poll",
    collectionDesc: "全量 GetAllLiveEvents（60s）+ delta（1s）HTTP 轮询",
    implementation: "done",
    feed: { module: "../platforms/imt/imt_feed.js", export: "ImtFeed" },
    envEnable: "ENABLE_IMT",
    defaultEnabled: false,
    feedOptions: {
      fullIntervalMs: Number(process.env.IMT_FULL_MS || 60000),
      deltaIntervalMs: Number(process.env.IMT_DELTA_MS || 1000),
    },
    streamMeta: null,
    pagePath: "/platforms/imt/",
  },
  {
    id: "HG",
    label: "HG",
    labelZh: "皇冠",
    collectionMode: "plugin_http",
    collectionDesc: "transform.php 账户/订单，非标准赔率流",
    implementation: "done",
    feed: { module: "../platforms/hg/hg_feed.js", export: "HgFeed" },
    envEnable: "ENABLE_HG",
    defaultEnabled: false,
    feedOptions: { pollIntervalMs: Number(process.env.HG_POLL_MS || 30000) },
    streamMeta: null,
    pagePath: "/platforms/hg/",
  },
  {
    id: "Stake",
    label: "Stake",
    labelZh: "Stake",
    collectionMode: "plugin_graphql_ws",
    collectionDesc: "插件 GraphQL + 插件 WS → A8 Stake 频道",
    implementation: "done",
    feed: { module: "../platforms/stake/stake_feed.js", export: "StakeFeed" },
    envEnable: "ENABLE_STAKE",
    defaultEnabled: false,
    feedOptions: { syncIntervalMs: Number(process.env.STAKE_SYNC_MS || 60000) },
    streamMeta: { key: "ws", protocol: "Socket.IO" },
    pagePath: "/platforms/stake/",
  },
];

function isPlatformEnabled(meta) {
  const env = process.env[meta.envEnable];
  if (env === "0") return false;
  if (env === "1") return true;
  return Boolean(meta.defaultEnabled);
}

function loadFeedClass(meta) {
  if (meta.feed?.module) {
    const abs = path.join(__dirname, meta.feed.module);
    const mod = require(abs);
    const Feed = mod[meta.feed.export];
    if (!Feed) throw new Error(`Feed export missing: ${meta.id} ${meta.feed.export}`);
    return Feed;
  }
  const { StubFeed } = require("./stub_feed.js");
  return StubFeed;
}

function buildFeedHubEntries() {
  return PLATFORMS.map((meta) => {
    const Feed = loadFeedClass(meta);
    const options = { ...(meta.feedOptions || {}) };
    if (!meta.feed) {
      options.platformId = meta.id;
      options.collectionMode = meta.collectionMode;
      options.collectionDesc = meta.collectionDesc;
      options.implementation = meta.implementation;
    }
    return {
      id: meta.id,
      label: meta.label,
      Feed,
      options,
      enabled: isPlatformEnabled(meta),
    };
  });
}

function listPlatforms() {
  return PLATFORMS.map((p) => ({
    id: p.id,
    label: p.label,
    labelZh: p.labelZh,
    collectionMode: p.collectionMode,
    collectionDesc: p.collectionDesc,
    implementation: p.implementation,
    envEnable: p.envEnable,
    defaultEnabled: p.defaultEnabled,
    enabled: isPlatformEnabled(p),
    streamMeta: p.streamMeta,
    pagePath: p.pagePath,
  }));
}

function getPlatform(id) {
  const key = String(id || "").toUpperCase();
  if (key === "XBET") return PLATFORMS.find((p) => p.id === "XBet") || null;
  return PLATFORMS.find((p) => p.id.toUpperCase() === key) || null;
}

module.exports = {
  PLATFORMS,
  listPlatforms,
  getPlatform,
  isPlatformEnabled,
  buildFeedHubEntries,
};
