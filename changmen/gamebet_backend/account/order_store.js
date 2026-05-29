"use strict";

const store = require("../esport-api/store.js");

const FILE = "orders";

function toDateKey(ts) {
  const d = new Date(Number(ts) || Date.now());
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function mapStatus(raw) {
  const s = String(raw || "").toLowerCase();
  if (s === "win") return "Win";
  if (s === "lose") return "Lose";
  if (s === "reject") return "Reject";
  if (s === "return") return "Return";
  if (s === "pending") return "Pending";
  return "None";
}

function parseNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function linkFromOrder(orderId, createAt) {
  const id = String(orderId || createAt || "");
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return hash || Number(createAt) || Date.now();
}

function mapPlayerOrder(row, playerId) {
  const createAt = parseNum(row.createAt, Date.now());
  const orderId = row.orderId || `${playerId}-${createAt}`;
  return {
    OrderID: orderId,
    Link: linkFromOrder(orderId, createAt),
    Type: row.provider || row.Type || "",
    Match: row.match || row.Match || "",
    Bet: row.bet || row.Bet || "",
    Item: row.item || row.Item || "",
    Odds: parseNum(row.odds, 0),
    BetMoney: parseNum(row.betMoney, 0),
    Money: parseNum(row.money, 0),
    Status: mapStatus(row.status || row.Status),
    CreateAt: createAt,
    PlayerID: Number(playerId) || 0,
    Player: {
      Platform: row.provider || "",
      UserName: "",
      Status: mapStatus(row.status || row.Status),
    },
  };
}

function readLinkedRows() {
  const all = store.readJson(FILE, { rows: [], binds: [] });
  return Array.isArray(all.rows) ? all.rows : [];
}

function listByPlayer(playerId) {
  ensureSeed();
  const pid = Number(playerId) || 0;
  const out = readLinkedRows().filter((row) => Number(row.PlayerID) === pid);
  const playerOrders = store.readJson("player_orders", {});
  const bucket = playerOrders[String(playerId)];
  for (const order of bucket?.orders || []) {
    const mapped = mapPlayerOrder(order, playerId);
    const exists = out.some(
      (r) => String(r.OrderID) === String(mapped.OrderID) && r.PlayerID === mapped.PlayerID,
    );
    if (!exists) out.push(mapped);
  }
  return out.sort((a, b) => (b.CreateAt || 0) - (a.CreateAt || 0));
}

function listByDate(dateStr) {
  const target = dateStr || toDateKey(Date.now());
  const rows = [...readLinkedRows()];
  const playerOrders = store.readJson("player_orders", {});

  for (const [playerId, bucket] of Object.entries(playerOrders)) {
    for (const order of bucket?.orders || []) {
      const mapped = mapPlayerOrder(order, playerId);
      if (toDateKey(mapped.CreateAt) !== target) continue;
      const exists = rows.some(
        (r) => String(r.OrderID) === String(mapped.OrderID) && r.PlayerID === mapped.PlayerID,
      );
      if (!exists) rows.push(mapped);
    }
  }

  return rows.sort((a, b) => (b.Link || 0) - (a.Link || 0) || (b.CreateAt || 0) - (a.CreateAt || 0));
}

function saveOrderBind(orders) {
  const all = store.readJson(FILE, { rows: [], binds: [] });
  const binds = Array.isArray(all.binds) ? all.binds : [];
  for (const row of orders || []) {
    binds.push({
      linkId: row.linkId ?? row.LinkID,
      provider: row.provider ?? row.Provider,
      orderId: row.orderId ?? row.OrderID,
      at: Date.now(),
    });
  }
  all.binds = binds;
  store.writeJson(FILE, all);
  return true;
}

function ensureSeed() {
  if (store.readJson(FILE, null) == null) {
    store.writeJson(FILE, { rows: [], binds: [] });
  }
}

module.exports = {
  FILE,
  ensureSeed,
  listByPlayer,
  listByDate,
  saveOrderBind,
  toDateKey,
};
