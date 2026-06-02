"use strict";

const { supabase } = require("../db/client.js");

function toDateKey(ts) {
  const d = new Date(Number(ts) || Date.now());
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function mapStatus(raw) {
  const s = String(raw || "").toLowerCase();
  if (s === "win")     return "Win";
  if (s === "lose")    return "Lose";
  if (s === "reject")  return "Reject";
  if (s === "return")  return "Return";
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
    OrderID: r.order_id,
    Link:     r.link || linkFromOrder(r.order_id, r.create_at),
    Type:     r.provider || "",
    Match:    r.match   || "",
    Bet:      r.bet     || "",
    Item:     r.item    || "",
    Odds:     r.odds    || 0,
    BetMoney: r.bet_money || 0,
    Money:    r.money   || 0,
    Status:   r.status  || "None",
    CreateAt: r.create_at || 0,
    PlayerID: Number(r.player_id) || 0,
    Player: {
      Platform: r.provider || "",
      UserName: "",
      Status:   r.status   || "None",
    },
  };
}

/** 按日期列出订单（userId 隔离，service_role 查询） */
async function listByDate(date, userId) {
  if (!supabase || !userId) return [];
  const target = date || toDateKey(Date.now());
  const dayStart = new Date(target).getTime();
  const dayEnd   = dayStart + 86400000;
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("user_id", String(userId))
    .gte("create_at", dayStart)
    .lt("create_at", dayEnd)
    .order("create_at", { ascending: false });
  if (error) { console.warn("[orders]", error.message); return []; }
  return (data || []).map(rowToOrder);
}

/** 按 playerId 列出订单 */
async function listByPlayer(playerId, userId) {
  if (!supabase || !userId) return [];
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("user_id", String(userId))
    .eq("player_id", Number(playerId))
    .order("create_at", { ascending: false });
  if (error) { console.warn("[orders]", error.message); return []; }
  return (data || []).map(rowToOrder);
}

/** 保存订单（upsert by user_id + order_id + player_id） */
async function saveOrder(playerId, orders, userId) {
  if (!supabase || !userId || !Array.isArray(orders)) return false;
  const rows = orders.map((o) => {
    const createAt = parseNum(o.createAt, Date.now());
    const orderId  = o.orderId || `${playerId}-${createAt}`;
    return {
      user_id:   String(userId),
      player_id: Number(playerId),
      order_id:  String(orderId),
      link:      linkFromOrder(orderId, createAt),
      provider:  o.provider || o.Type || "",
      match:     o.match    || o.Match || "",
      bet:       o.bet      || o.Bet   || "",
      item:      o.item     || o.Item  || "",
      odds:      parseNum(o.odds,     0),
      bet_money: parseNum(o.betMoney || o.BetMoney, 0),
      money:     parseNum(o.money    || o.Money,    0),
      status:    mapStatus(o.status  || o.Status),
      create_at: createAt,
      raw:       o,
    };
  });
  const { error } = await supabase
    .from("orders")
    .upsert(rows, { onConflict: "user_id,order_id,player_id", ignoreDuplicates: false });
  if (error) { console.warn("[orders] save:", error.message); return false; }
  return true;
}

/** 订单绑定（link 字段更新） */
async function saveOrderBind(orders, userId) {
  if (!supabase || !userId || !Array.isArray(orders)) return false;
  for (const row of orders) {
    const orderId  = row.orderId  ?? row.OrderID;
    const playerId = row.playerId ?? row.PlayerID;
    const linkId   = row.linkId   ?? row.LinkID;
    if (!orderId) continue;
    await supabase
      .from("orders")
      .update({ link: Number(linkId) || 0 })
      .eq("user_id",  String(userId))
      .eq("order_id", String(orderId))
      .eq("player_id", Number(playerId));
  }
  return true;
}

function ensureSeed() {}  // 保留接口兼容，无需操作

module.exports = {
  toDateKey,
  ensureSeed,
  listByDate,
  listByPlayer,
  saveOrder,
  saveOrderBind,
};
