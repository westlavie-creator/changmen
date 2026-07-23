/**
 * 订单 Link / 买卖对对齐 / 按日归账（读路径 enrich + save 时 resolve link）。
 * 不改订单金额语义。由 order_store.js re-export 公开 API。
 */
import * as sb from "@changmen/db";
import {
  backendBindLinkFromCreateAt,
  isArbBindLink,
  placeholderLinkFromCreateAt,
} from "@changmen/db";
import { toDateKey } from "./date_key.js";
import { parseNum } from "./dto.js";
import {
  isPredictionBuyRawRow,
  isPredictionSellRawRow,
  orderRaw,
  predictionSellBuyIdFromRaw,
  predictionSellMetaFromSave,
} from "./kinds.js";

function mergeRawOrderRowsById(...lists) {
  const byId = new Map();
  for (const list of lists) {
    for (const r of list || []) {
      const id = String(r?.order_id ?? "").trim().toLowerCase();
      if (id)
        byId.set(id, r);
    }
  }
  return [...byId.values()];
}

/** 展示前把卖单 link 对齐到父买单（不写库；供分组 / 归账日） */
export function alignRawPredictionSellLinksToBuys(rows) {
  const list = rows || [];
  /**
   * link=0 的买单若原样进分组，会与其它 link=0 单挤在同一桶，
   * 跨日归账会用 min(anchors) 误伤同桶其它买卖对。
   * 分组前把买单 link=0 归一成 create_at 占位，再让卖单跟过去。
   */
  const buysNormalized = list.map((r) => {
    if (!isPredictionBuyRawRow(r))
      return r;
    const link = Number(r.link) || 0;
    if (link !== 0)
      return r;
    const ph = placeholderLinkFromCreateAt(r.create_at);
    if (Number(r.link) === ph)
      return r;
    return { ...r, link: ph };
  });

  const buyById = new Map();
  for (const r of buysNormalized) {
    if (!isPredictionBuyRawRow(r))
      continue;
    const id = String(r?.order_id ?? "").trim().toLowerCase();
    if (id)
      buyById.set(id, r);
  }
  if (!buyById.size)
    return buysNormalized;

  return buysNormalized.map((r) => {
    const buyId = predictionSellBuyIdFromRaw(r).toLowerCase();
    if (!buyId)
      return r;
    const buy = buyById.get(buyId);
    if (!buy)
      return r;
    const buyLink = Number(buy.link) || 0;
    if (Number(r.link) === buyLink)
      return r;
    return { ...r, link: buyLink };
  });
}

function orderProfitDateTsFromRaw(row, peers) {
  const raw = orderRaw(row);
  const provider = String(row?.provider || "").trim();
  const buyId = predictionSellBuyIdFromRaw(row).toLowerCase();
  if (buyId) {
    const buy = peers.find(p => String(p?.order_id || "").trim().toLowerCase() === buyId);
    const buyAt = Number(buy?.create_at) || 0;
    if (buyAt > 0)
      return buyAt;
  }
  // 无 buyId 时：同 link 找买单（PM / PF 对称）
  const isPmSell = provider === "Polymarket" && String(raw.pmSide || "").toLowerCase() === "sell";
  const isPfSell = provider === "PredictFun" && String(raw.pfSide || "").toLowerCase() === "sell";
  if (isPmSell || isPfSell) {
    const link = Number(row.link) || 0;
    const buyAts = peers
      .filter((p) => {
        const pr = orderRaw(p);
        const pProv = String(p?.provider || "").trim();
        if (isPmSell) {
          return pProv === "Polymarket"
            && String(pr.pmSide || "").toLowerCase() !== "sell"
            && (link === 0 || (Number(p.link) || 0) === link);
        }
        return pProv === "PredictFun"
          && String(pr.pfSide || "").toLowerCase() !== "sell"
          && (link === 0 || (Number(p.link) || 0) === link);
      })
      .map(p => Number(p.create_at) || 0)
      .filter(n => n > 0);
    if (buyAts.length)
      return Math.min(...buyAts);
  }
  return Number(row?.create_at) || 0;
}

function filterRawOrdersBelongingToDate(rows, dateKey) {
  const list = alignRawPredictionSellLinksToBuys(rows || []);
  const byLink = new Map();
  for (const r of list) {
    const link = Number(r.link) || 0;
    if (!byLink.has(link))
      byLink.set(link, []);
    byLink.get(link).push(r);
  }
  const out = [];
  for (const group of byLink.values()) {
    const predSells = group.filter(isPredictionSellRawRow);
    if (predSells.length) {
      const anchors = predSells
        .map(s => orderProfitDateTsFromRaw(s, group))
        .filter(n => n > 0);
      if (anchors.length) {
        const anchorDay = toDateKey(Math.min(...anchors));
        if (anchorDay !== dateKey)
          continue;
      }
      out.push(...group);
      continue;
    }
    out.push(...group);
  }
  return out;
}

/**
 * [changmen 扩展] 并入同 Link + 按 buyId 并入跨日父买单/子卖单，再对齐 sell.link。
 * @param {object[]} dayRows
 * @param {{ userId?: string, userIds?: string[] }} opts
 */
export async function mergePredictionBuySellSiblings(dayRows, opts = {}) {
  const userId = String(opts.userId || "").trim();
  const seed = [...(dayRows || [])];
  if (!seed.length)
    return [];

  // 管理端多用户：按 user_id 分别并 sibling，避免跨用户串单
  if (!userId) {
    const byUser = new Map();
    const missingUser = [];
    for (const r of seed) {
      const uid = String(r?.user_id ?? "").trim();
      if (!uid) {
        missingUser.push(r);
        continue;
      }
      if (!byUser.has(uid))
        byUser.set(uid, []);
      byUser.get(uid).push(r);
    }
    const parts = await Promise.all(
      [...byUser.entries()].map(([uid, list]) =>
        mergePredictionBuySellSiblings(list, { userId: uid })),
    );
    return mergeRawOrderRowsById(...parts, missingUser)
      .sort((a, b) => (Number(b.create_at) || 0) - (Number(a.create_at) || 0));
  }

  let merged = seed;
  const links = [...new Set(
    merged.map(r => Number(r.link) || 0).filter(n => n !== 0),
  )];
  if (links.length && typeof sb.fetchOrdersByLinks === "function") {
    const siblings = await sb.fetchOrdersByLinks(userId, links);
    merged = mergeRawOrderRowsById(merged, siblings);
  }

  const parentBuyIds = [];
  const buyIdsForChildSells = [];
  for (const r of merged) {
    const sellBuyId = predictionSellBuyIdFromRaw(r);
    if (sellBuyId)
      parentBuyIds.push(sellBuyId);
    if (isPredictionBuyRawRow(r)) {
      const oid = String(r?.order_id ?? "").trim();
      if (oid)
        buyIdsForChildSells.push(oid);
    }
  }

  const missingParentIds = parentBuyIds.filter((id) => {
    const needle = id.toLowerCase();
    return !merged.some(r => String(r?.order_id ?? "").trim().toLowerCase() === needle);
  });

  const fetchParents = missingParentIds.length && typeof sb.fetchOrdersByUserOrderIds === "function"
    ? sb.fetchOrdersByUserOrderIds(userId, missingParentIds)
    : Promise.resolve([]);
  const fetchChildSells = buyIdsForChildSells.length
    && typeof sb.fetchPredictionSellsByBuyOrderIds === "function"
    ? sb.fetchPredictionSellsByBuyOrderIds(userId, buyIdsForChildSells)
    : Promise.resolve([]);

  const [parents, childSells] = await Promise.all([fetchParents, fetchChildSells]);
  merged = mergeRawOrderRowsById(merged, parents, childSells);

  if (typeof sb.fetchOrdersByLinks === "function") {
    const links2 = [...new Set(
      merged.map(r => Number(r.link) || 0).filter(n => n !== 0),
    )];
    const newLinks = links2.filter(l => !links.includes(l));
    if (newLinks.length) {
      const more = await sb.fetchOrdersByLinks(userId, newLinks);
      merged = mergeRawOrderRowsById(merged, more);
    }
  }

  return alignRawPredictionSellLinksToBuys(merged)
    .sort((a, b) => (Number(b.create_at) || 0) - (Number(a.create_at) || 0));
}

/** 按日列表：buyId/Link sibling 并入后归买单日 */
export async function enrichOrdersBelongingToDate(dayRows, dateKey, opts = {}) {
  const merged = await mergePredictionBuySellSiblings(dayRows, opts);
  return filterRawOrdersBelongingToDate(merged, dateKey);
}

/** order_id 大小写不敏感查找（PM 0x hex 偶发大小写不一致） */
function findOrderRowById(byOrderId, orderId) {
  const id = String(orderId ?? "").trim();
  if (!id)
    return undefined;
  const direct = byOrderId.get(id);
  if (direct)
    return direct;
  const needle = id.toLowerCase();
  for (const [key, row] of byOrderId) {
    if (String(key).toLowerCase() === needle)
      return row;
  }
  return undefined;
}

function findAssignedLink(assignedInBatch, orderId) {
  const id = String(orderId ?? "").trim();
  if (!id)
    return 0;
  const direct = parseNum(assignedInBatch.get(id), 0);
  if (direct !== 0)
    return direct;
  const needle = id.toLowerCase();
  for (const [key, link] of assignedInBatch) {
    if (String(key).toLowerCase() === needle) {
      const n = parseNum(link, 0);
      if (n !== 0)
        return n;
    }
  }
  return 0;
}

export function resolveSaveOrderLink(
  o,
  prevRaw,
  orderId,
  createAt,
  linkByOrderId,
  existingByOrderId,
  assignedInBatch,
  provider,
) {
  const { isSell, buyOrderId } = predictionSellMetaFromSave(o, prevRaw, provider);
  // PM/PF 卖单：始终跟对应买单 Link（绑定修正时覆盖旧占位 link）
  if (isSell && buyOrderId) {
    const buyRow = findOrderRowById(existingByOrderId, buyOrderId);
    const buyLink = parseNum(buyRow?.link, 0) || findAssignedLink(assignedInBatch, buyOrderId);
    if (buyLink !== 0)
      return buyLink;
    // 买单尚未入库时：用客户端带上的买单 Link（跨日卖仍同组）
    const incomingBuyLink = parseNum(o.link ?? o.Link ?? o.LinkID, 0);
    if (incomingBuyLink !== 0)
      return incomingBuyLink;
  }

  const boundLink = Number(linkByOrderId.get(orderId)) || 0;
  // 已绑套利 Link：SaveOrder 同步不覆盖（Bind 确认后保持稳定）
  if (isArbBindLink(boundLink))
    return boundLink;

  // [changmen 扩展] 客户端拉单时附带最终 linkId，缩短 create_at-1 占位窗口
  const incomingLink = parseNum(o.link ?? o.Link ?? o.LinkID, 0);
  if (incomingLink !== 0)
    return incomingLink;

  if (boundLink !== 0)
    return boundLink;

  return backendBindLinkFromCreateAt(createAt);
}
