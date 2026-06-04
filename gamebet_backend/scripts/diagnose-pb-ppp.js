"use strict";

const fs = require("fs");
const path = require("path");
const { refreshAccountBalance } = require("../core/account/account_service.js");
const { accountToSession } = require("../core/account/balance_provider.js");
const { fetchBalance: fetchPbBalance } = require("../platforms/pb/pb_session.js");

const kvPath = path.join(__dirname, "../data/esport/user_kv.json");
const kv = JSON.parse(fs.readFileSync(kvPath, "utf8"));
const list = JSON.parse(kv.ACCOUNT);
const row = list.find((a) => a.accountId === 2);

function tokenOuterKeys(token) {
  if (token == null || token === "") return [];
  if (typeof token === "object") return Object.keys(token);
  const s = String(token).trim();
  if (!s.startsWith("{")) return ["<non-json-string>"];
  try {
    return Object.keys(JSON.parse(s));
  } catch {
    return ["<invalid-json>"];
  }
}

function pickBalanceLike(raw) {
  if (!raw || typeof raw !== "object") return raw;
  const keys = [
    "betCredit",
    "success",
    "currency",
    "balance",
    "credit",
    "availableBalance",
    "cashBalance",
    "message",
    "error",
    "code",
    "status",
  ];
  const out = { _responseKeys: Object.keys(raw) };
  for (const k of keys) {
    if (k in raw) out[k] = raw[k];
  }
  return out;
}

async function main() {
  if (!row) {
    console.log(JSON.stringify({ error: "accountId 2 not found" }, null, 2));
    process.exit(1);
  }

  const accountMeta = {
    accountId: row.accountId,
    playerName: row.playerName,
    provider: row.provider,
    gateway: row.gateway,
    multiply: row.multiply,
    referer: row.referer,
    cookieLength: (row.cookie || "").length,
    tokenOuterKeys: tokenOuterKeys(row.token),
  };
  console.log("=== ACCOUNT (accountId 2) ===");
  console.log(JSON.stringify(accountMeta, null, 2));

  const refresh = await refreshAccountBalance(row);
  const diag = {
    refreshResult: {
      balance: refresh.balance ?? null,
      error: refresh.error ?? null,
      enrichedGateway: refresh.account?.gateway,
      enrichedHasToken: !!(refresh.account && refresh.account.token),
    },
  };

  if (
    String(row.provider).toUpperCase() === "PB" &&
    refresh.balance &&
    !refresh.error
  ) {
    const session = accountToSession(refresh.account || row);
    if (session) {
      try {
        const pb = await fetchPbBalance(session);
        diag.pbRaw = pickBalanceLike(pb.raw);
        diag.pbMapped = { balance: pb.balance, currency: pb.currency };
      } catch (e) {
        diag.pbRawFetchError = e.message || String(e);
      }
    }
  } else if (String(row.provider).toUpperCase() === "PB" && refresh.error) {
    const session = accountToSession(row);
    if (session) {
      try {
        const pb = await fetchPbBalance(session);
        diag.pbRawOnErrorPath = pickBalanceLike(pb.raw);
      } catch (e) {
        diag.pbDirectError = e.message || String(e);
      }
    }
  }

  console.log("=== BALANCE REFRESH ===");
  console.log(JSON.stringify(diag, null, 2));
}

main().catch((e) => {
  console.error(e.stack || e.message);
  process.exit(1);
});
