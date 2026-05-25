"use strict";

const store = require("./store.js");
const { getActivePlatformGameIds } = require("../shared/game_catalog.js");
const { getRayA8CollectCredentials } = require("../shared/ray_a8_collect.js");
const { login } = require("../platforms/ob/ob_session.js");

function syncObFromSession(session) {
  if (!session?.gateway || !session?.token) return false;
  store.setPlatform("OB", {
    gateway: session.gateway,
    token: session.token,
    betName: store.getPlatform("OB")?.betName || ".*",
    games: getActivePlatformGameIds("OB").map(String),
  });
  return true;
}

async function syncObLogin() {
  const session = await login();
  syncObFromSession(session);
  return session;
}

function syncRayFromA8() {
  const a8 = getRayA8CollectCredentials();
  store.setPlatform("RAY", {
    gateway: a8.gateway,
    token: a8.token,
    betName: a8.betName,
    games: a8.games.map(String),
  });
  return true;
}

function syncRayFromEnv() {
  if (process.env.RAY_COLLECT_USE_ENV !== "1") return false;
  const raw = process.env.RAY_TOKEN || process.env.RAY_WS_TOKEN || "";
  if (!raw) return false;
  const token = raw.startsWith("Bearer ") ? raw : `Bearer ${raw}`;
  store.setPlatform("RAY", {
    gateway: process.env.RAY_GATEWAY || "https://cfinfo.365raylinks.com",
    token,
    betName: "^获胜者$",
    games: getActivePlatformGameIds("RAY").map(String),
  });
  return true;
}

function syncRayFromSession(_session) {
  // RAY 采集固定 A8 写死凭证；feed 登录 session 不写入 platforms.json
  return syncRayFromA8();
}

function syncPbFromEnv() {
  const gateway = process.env.PB_GATEWAY;
  const token = process.env.PB_TOKEN;
  if (!gateway || !token) return false;
  store.setPlatform("PB", {
    gateway,
    token,
    betName: ".*",
    games: getActivePlatformGameIds("PB").map(String),
    cookie: process.env.PB_COOKIE || "",
    referer: process.env.PB_REFERER || gateway,
    userAgent: process.env.PB_USER_AGENT || "",
  });
  return true;
}

function syncPbFromSession(session) {
  if (!session?.gateway || !session?.token) return false;
  store.setPlatform("PB", {
    gateway: session.gateway,
    token: typeof session.token === "string" ? session.token : JSON.stringify(session.token),
    betName: store.getPlatform("PB")?.betName || ".*",
    games: (session.gameSlugs || getActivePlatformGameIds("PB")).map(String),
    cookie: session.cookie || "",
    referer: session.referer || session.gateway,
    userAgent: session.userAgent || "",
  });
  return true;
}

function syncTfFromEnv() {
  const gateway = process.env.TF_GATEWAY;
  const token = process.env.TF_TOKEN;
  if (!gateway || !token) return false;
  store.setPlatform("TF", {
    gateway,
    token,
    betName: process.env.TF_BET_NAME || "^获胜者$",
    games: getActivePlatformGameIds("TF").map(String),
  });
  return true;
}

function syncTfFromSession(session) {
  if (!session?.gateway || !session?.token) return false;
  store.setPlatform("TF", {
    gateway: session.gateway,
    token: session.token,
    betName: session.betName || store.getPlatform("TF")?.betName || "^获胜者$",
    games: (session.gameIds || getActivePlatformGameIds("TF")).map(String),
  });
  return true;
}

function syncIaFromEnv() {
  const gateway = process.env.IA_GATEWAY;
  const token = process.env.IA_TOKEN;
  if (!gateway || !token) return false;
  store.setPlatform("IA", {
    gateway,
    token,
    betName:
      process.env.IA_BET_NAME ||
      store.getPlatform("IA")?.betName ||
      "([全场].+获胜$)|([地图\\d].+获胜者$)",
    games: getActivePlatformGameIds("IA").map(String),
  });
  return true;
}

function syncIaFromSession(session) {
  if (!session?.gateway || !session?.token) return false;
  store.setPlatform("IA", {
    gateway: session.gateway,
    token: session.token,
    betName:
      session.betName ||
      store.getPlatform("IA")?.betName ||
      "([全场].+获胜$)|([地图\\d].+获胜者$)",
    games: (session.gameIds || getActivePlatformGameIds("IA")).map(String),
  });
  return true;
}

function syncImtFromEnv() {
  const gateway = process.env.IMT_GATEWAY;
  const token = process.env.IMT_TOKEN;
  if (!gateway || !token) return false;
  const sportIds = process.env.IMT_SPORT_IDS
    ? process.env.IMT_SPORT_IDS.split(/[,;\s]+/).filter(Boolean)
    : [...new Set(getActivePlatformGameIds("IMT"))];
  store.setPlatform("IMT", {
    gateway,
    token,
    referer: process.env.IMT_REFERER || gateway,
    userAgent: process.env.IMT_USER_AGENT || "",
    xSc: process.env.IMT_X_SC || "",
    sportIds: sportIds.length ? sportIds : ["43"],
  });
  return true;
}

function syncImtFromSession(session) {
  if (!session?.gateway || !session?.token) return false;
  store.setPlatform("IMT", {
    gateway: session.gateway,
    token: session.token,
    referer: session.referer || session.gateway,
    userAgent: session.userAgent || "",
    xSc: session.xSc || "",
    sportIds: (session.sportIds || getActivePlatformGameIds("IMT")).map(String),
  });
  return true;
}

function syncImFromEnv() {
  store.setPlatform("IM", {
    gateway: process.env.A8_WS_URL || "https://47.115.75.57",
    token: process.env.A8_SOCKET_TOKEN || "",
    betName: ".*",
    games: getActivePlatformGameIds("IM").map(String),
  });
  return true;
}

function syncXbetFromEnv() {
  store.setPlatform("XBet", {
    gateway: process.env.A8_WS_URL || "https://47.115.75.57",
    token: process.env.A8_SOCKET_TOKEN || "",
    betName: ".*",
    games: getActivePlatformGameIds("XBet").map(String),
  });
  return true;
}

function syncStakeFromEnv() {
  const accessToken = process.env.STAKE_ACCESS_TOKEN || process.env.STAKE_TOKEN;
  if (!accessToken) return false;
  store.setPlatform("Stake", {
    gateway: process.env.STAKE_API_URL || "https://stake.com",
    accessToken,
    sports: process.env.STAKE_SPORTS
      ? process.env.STAKE_SPORTS.split(/[,;\s]+/).filter(Boolean)
      : ["dota-2", "counter-strike", "league-of-legends", "kings-of-glory", "valorant"],
  });
  return true;
}

function syncStakeFromSession(session) {
  if (!session?.accessToken) return false;
  store.setPlatform("Stake", {
    gateway: session.apiUrl || session.gateway,
    accessToken: session.accessToken,
    sports: session.sports || [],
  });
  return true;
}

function syncSabaFromEnv() {
  const gateway = process.env.SABA_GATEWAY;
  const token = process.env.SABA_TOKEN;
  if (!gateway || !token) return false;
  store.setPlatform("SABA", {
    gateway,
    token,
    games: getActivePlatformGameIds("SABA").map(String),
  });
  return true;
}

function syncSabaFromSession(session) {
  if (!session?.gateway || !session?.token) return false;
  store.setPlatform("SABA", {
    gateway: session.gateway,
    token: session.token,
    games: (session.gameIds || getActivePlatformGameIds("SABA")).map(String),
  });
  return true;
}

function syncHgFromEnv() {
  const gateway = process.env.HG_GATEWAY;
  const token = process.env.HG_TOKEN;
  if (!gateway || !token) return false;
  store.setPlatform("HG", {
    gateway,
    token: typeof token === "string" ? token : JSON.stringify(token),
  });
  return true;
}

function syncHgFromSession(session) {
  if (!session?.gateway || !session?.token) return false;
  store.setPlatform("HG", {
    gateway: session.gateway,
    token: JSON.stringify(session.token),
  });
  return true;
}

async function ensurePlatformCredentials(hub) {
  store.ensureSeed();
  let obSynced = false;
  const obFeed = hub?.platforms?.find((p) => p.id === "OB")?.instance;
  if (obFeed?.session?.gateway) {
    obSynced = syncObFromSession(obFeed.session);
  }
  if (!obSynced) {
    try {
      await syncObLogin();
      obSynced = true;
    } catch (err) {
      console.warn("[platform-sync] OB login failed:", err.message);
    }
  }

  let raySynced = syncRayFromA8();
  if (!raySynced) {
    const rayFeed = hub?.platforms?.find((p) => p.id === "RAY")?.instance;
    if (rayFeed?.session?.gateway) {
      raySynced = syncRayFromSession(rayFeed.session);
    }
  }
  if (!raySynced) {
    raySynced = syncRayFromEnv();
  }

  let pbSynced = false;
  const pbFeed = hub?.platforms?.find((p) => p.id === "PB")?.instance;
  if (pbFeed?.session?.gateway) {
    pbSynced = syncPbFromSession(pbFeed.session);
  }
  if (!pbSynced) {
    try {
      const { tryLoadSession } = require("../platforms/pb/pb_session.js");
      const session = tryLoadSession();
      if (session) pbSynced = syncPbFromSession(session);
    } catch (err) {
      console.warn("[platform-sync] PB platforms.json load failed:", err.message);
    }
  }
  if (!pbSynced) {
    pbSynced = syncPbFromEnv();
  }

  let tfSynced = false;
  const tfFeed = hub?.platforms?.find((p) => p.id === "TF")?.instance;
  if (tfFeed?.session?.gateway) {
    tfSynced = syncTfFromSession(tfFeed.session);
  }
  if (!tfSynced) {
    tfSynced = syncTfFromEnv();
  }

  let iaSynced = false;
  const iaFeed = hub?.platforms?.find((p) => p.id === "IA")?.instance;
  if (iaFeed?.session?.gateway) {
    iaSynced = syncIaFromSession(iaFeed.session);
  }
  if (!iaSynced) {
    iaSynced = syncIaFromEnv();
  }

  let imtSynced = false;
  const imtFeed = hub?.platforms?.find((p) => p.id === "IMT")?.instance;
  if (imtFeed?.session?.gateway) {
    imtSynced = syncImtFromSession(imtFeed.session);
  }
  if (!imtSynced) {
    imtSynced = syncImtFromEnv();
  }

  const imSynced = syncImFromEnv();
  const xbetSynced = syncXbetFromEnv();
  const stakeSynced = syncStakeFromEnv();
  const sabaSynced = syncSabaFromEnv();
  const hgSynced = syncHgFromEnv();

  return {
    obSynced,
    raySynced,
    pbSynced,
    tfSynced,
    iaSynced,
    imtSynced,
    imSynced,
    xbetSynced,
    stakeSynced,
    sabaSynced,
    hgSynced,
  };
}

module.exports = {
  syncObFromSession,
  syncObLogin,
  syncRayFromA8,
  syncRayFromEnv,
  syncRayFromSession,
  syncPbFromEnv,
  syncPbFromSession,
  syncTfFromEnv,
  syncTfFromSession,
  syncIaFromEnv,
  syncIaFromSession,
  syncImtFromEnv,
  syncImtFromSession,
  syncImFromEnv,
  syncXbetFromEnv,
  syncStakeFromEnv,
  syncStakeFromSession,
  syncSabaFromEnv,
  syncSabaFromSession,
  syncHgFromEnv,
  syncHgFromSession,
  ensurePlatformCredentials,
};
