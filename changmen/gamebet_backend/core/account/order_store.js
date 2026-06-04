"use strict";

const sb = require("../db/supabase.js");

function toDateKey(ts) {
  const d = new Date(Number(ts) || Date.now());
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function mapStatus(raw) {
  const s = String(raw || "").toLowerCase();
  if (s === "win")    return "Win";
  if (s === "lose")   return "Lose";
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

function rowToOrder(r) {
  return {
    OrderID:  r.order_id,
    Link:     r.link || linkFromOrder(r.order_id, r.create_at),
    Type:     r.provider  || "",
    Match:    r.match     || "",
    Bet:      r.bet       || "",
    Item:     r.item      || "",
    Odds:     r.odds      || 0,
    BetMoney: r.bet_money || 0,
    Money:    r.money     || 0,
    Status:   r.status    || "None",
    CreateAt: r.create_at || 0,
    PlayerID: Number(r.player_id) || 0,
    Player: {
      Platform: r.provider || "",
      UserName: "",
      Status:   r.status   || "None",
    },
  };
}

async function listByDate(date, userId) {
  const target = date || toDateKey(Date.now());
  const rows = await sb.fetchOrdersByDate(target, userId);
  return rows.map(rowToOrder);
}

async function listByPlayer(playerId, userId) {
  const rows = await sb.fetchOrdersByPlayer(playerId, userId);
  return rows.map(rowToOrder);
}

async function saveOrder(playerId, orders, userId) {
  if (!userId || !Array.isArray(orders)) return false;
  const rows = orders.map((o) => {
    const createAt = parseNum(o.createAt, Date.now());
    const orderId  = o.orderId || `${playerId}-${createAt}`;
    return {
      user_id:   String(userId),
      player_id: Number(playerId),
      order_id:  String(orderId),
      link:      linkFromOrder(orderId, createAt),
      provider:  o.provider || o.Type  || "",
      match:     o.match    || o.Match || "",
      bet:       o.bet      || o.Bet   || "",
      item:      o.item     || o.Item  || "",
      odds:      parseNum(o.odds,                    0),
      bet_money: parseNum(o.betMoney || o.BetMoney,  0),
      money:     parseNum(o.money    || o.Money,     0),
      status:    mapStatus(o.status  || o.Status),
      create_at: createAt,
      raw:       o,
    };
  });
  return sb.upsertOrders(rows);
}

async function saveOrderBind(orders, userId) {
  if (!userId || !Array.isArray(orders)) return false;
  for (const row of orders) {
    const orderId  = row.orderId  ?? row.OrderID;
    const playerId = row.playerId ?? row.PlayerID;
    const linkId   = row.linkId   ?? row.LinkID;
    if (!orderId) continue;
    await sb.updateOrderBind(orderId, playerId, userId, linkId);
  }
  return true;
}

function ensureSeed() {}

module.exports = {
  toDateKey,
  ensureSeed,
  listByDate,
  listByPlayer,
  saveOrder,
  saveOrderBind,
};
