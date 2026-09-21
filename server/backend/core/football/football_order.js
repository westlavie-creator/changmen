/**
 * 足球订单 DTO。OB 足球独立于电竞 orders；非 OB 足球可由统一 orders 映射为本 DTO。
 */

const STATUSES = new Set(["None", "Pending", "Win", "Lose", "Reject", "Return"]);

function asRecord(raw) {
  if (raw && typeof raw === "object" && !Array.isArray(raw))
    return raw;
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
        return parsed;
    }
    catch { /* ignore */ }
  }
  return null;
}

function str(v) {
  return String(v ?? "").trim();
}

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function optPlayerId(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

function truthy(v) {
  return v === true || v === 1 || v === "1" || v === "true";
}

function orderStatus(v) {
  const raw = str(v);
  if (!raw)
    return "None";
  const named = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
  if (STATUSES.has(named))
    return named;
  if (STATUSES.has(raw))
    return raw;
  return "None";
}

/**
 * @param {unknown} raw
 * @returns {object | null}
 */
export function parseFootballOrderInput(raw) {
  const row = asRecord(raw);
  if (!row)
    return null;
  const clientId = str(row.clientId || row.id);
  if (!clientId)
    return null;
  const now = Date.now();
  const placedAt = num(row.placedAt ?? row.at, now);
  return {
    clientId,
    venue: str(row.venue) || "OB",
    venueOrderId: str(row.venueOrderId || row.orderId),
    playerId: optPlayerId(row.playerId),
    home: str(row.home),
    away: str(row.away),
    sideLabel: str(row.sideLabel),
    marketLabel: str(row.marketLabel),
    odds: num(row.odds),
    stake: num(row.stake),
    oid: str(row.oid),
    obMid: str(row.obMid),
    auto: truthy(row.auto),
    accountName: str(row.accountName),
    status: orderStatus(row.status),
    profit: num(row.profit),
    placedAt: placedAt > 0 ? placedAt : now,
  };
}

/**
 * 仅按场馆单号回写结算。无 clientId。
 * @param {unknown} raw
 * @returns {object | null}
 */
export function parseFootballOrderStatusPatch(raw) {
  const row = asRecord(raw);
  if (!row)
    return null;
  const venueOrderId = str(row.venueOrderId || row.orderId);
  if (!venueOrderId)
    return null;
  const status = orderStatus(row.status);
  if (status === "None" && !Object.prototype.hasOwnProperty.call(row, "status"))
    return null;
  return {
    venue: str(row.venue) || "OB",
    venueOrderId,
    status,
    profit: num(row.profit),
  };
}

/**
 * @param {object | null} row db 行
 */
export function publicFootballOrder(row) {
  if (!row)
    return null;
  return {
    rdsId: Number(row.id) || 0,
    id: str(row.client_id),
    orderId: str(row.venue_order_id),
    at: num(row.placed_at),
    home: str(row.home),
    away: str(row.away),
    sideLabel: str(row.side_label),
    marketLabel: str(row.market_label),
    odds: num(row.odds),
    stake: num(row.stake),
    oid: str(row.oid),
    obMid: str(row.ob_mid),
    auto: row.auto === true,
    venue: str(row.venue) || "OB",
    playerId: optPlayerId(row.player_id) || 0,
    accountName: str(row.account_name),
    status: orderStatus(row.status),
    profit: num(row.profit),
    userId: str(row.user_id),
    userName: str(row.user_name),
  };
}
