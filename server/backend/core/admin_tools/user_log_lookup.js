/**
 * [changmen 扩展] 运维：订单 Link / order_id ↔ user_logs 关联（不改前端 A8 链路）
 */
import {
  fetchOrderByOrderId,
  fetchOrdersByLink,
  fetchUserById,
  fetchUserByName,
  fetchUserLogsInRange,
} from "@changmen/db";

export const ARB_LINK_MIN = 1_000_000_000_000;
export const DEFAULT_LOG_PADDING_MS = 180_000;

export function linkTypeLabel(link) {
  const n = Number(link);
  if (!Number.isFinite(n) || n === 0)
    return "未知";
  if (n < 0)
    return "单边";
  if (n >= ARB_LINK_MIN)
    return "套利";
  return "hash";
}

export function groupMetaLabel(link, orderCount) {
  const n = Number(link);
  if (Number.isFinite(n) && n < 0)
    return "单边";
  if (orderCount > 1 && Number.isFinite(n) && n >= ARB_LINK_MIN) {
    return `套利 ${orderCount} 笔`;
  }
  if (Number.isFinite(n) && n >= ARB_LINK_MIN)
    return "单笔";
  return "hash/未绑定";
}

/** 以订单 create_at 与 link 时间戳估窗口 */
export function computeLogWindow(orders, paddingMs = DEFAULT_LOG_PADDING_MS) {
  const pad = Math.max(Number(paddingMs) || DEFAULT_LOG_PADDING_MS, 30_000);
  const times = (orders || [])
    .map(o => Number(o.create_at) || 0)
    .filter(t => t > 0);
  for (const o of orders || []) {
    const linkTs = Number(o.link) || 0;
    if (linkTs >= ARB_LINK_MIN)
      times.push(linkTs);
  }
  if (!times.length)
    return null;
  const min = Math.min(...times);
  const max = Math.max(...times);
  return { fromMs: min - pad, toMs: max + pad };
}

export function parseLogData(raw) {
  if (raw == null || raw === "")
    return null;
  if (typeof raw === "object")
    return raw;
  try {
    return JSON.parse(String(raw));
  }
  catch {
    return { raw: String(raw) };
  }
}

export function classifyLogTitle(title) {
  const t = String(title || "");
  if (t.includes("请求盘口数据"))
    return "check";
  if (t.includes("下注 =>"))
    return "bet";
  if (t.includes("拒单"))
    return "reject";
  return "other";
}

/** 从 title / data 推断平台（如 [RAY](...)） */
export function extractLogProvider(title, parsed, kind) {
  const bracket = String(title || "").match(/^\[([^\]]+)\]/);
  if (bracket?.[1])
    return bracket[1];
  if (kind === "check" && parsed?.options?.type)
    return String(parsed.options.type);
  if (kind === "bet" && parsed?.result?.provider)
    return String(parsed.result.provider);
  return null;
}

/** 按平台分栏：先订单平台，再仅出现在日志里的平台，最后「其他」 */
export function buildPlatformSections(orders, logs) {
  const sections = [];
  const byKey = new Map();

  const keyOf = provider => (provider ? String(provider) : "__other__");
  const labelOf = provider => provider || "其他";

  const touch = (provider) => {
    const key = keyOf(provider);
    if (!byKey.has(key)) {
      const section = {
        provider: provider || null,
        label: labelOf(provider),
        orders: [],
        logs: [],
      };
      byKey.set(key, section);
      sections.push(section);
    }
    return byKey.get(key);
  };

  for (const order of orders || []) {
    touch(order.provider).orders.push(order);
  }
  for (const log of logs || []) {
    touch(log.provider).logs.push(log);
  }

  for (const section of sections) {
    section.logs.sort((a, b) => a.createAt - b.createAt);
  }

  return sections;
}

/** 从日志推断关联 order_id（下注结果 / PB 拒单轮询） */
export function extractLogOrderId(title, parsed, kind) {
  if (kind === "bet" && parsed?.result?.orderId) {
    return String(parsed.result.orderId);
  }
  if (kind === "reject") {
    const m = String(title || "").match(/-\s*(\S+)\s+拒单/);
    if (m?.[1])
      return m[1];
  }
  return null;
}

/**
 * 按订单分栏：每笔订单一列；同平台未成单尝试单独成列（provider · 未成单）
 */
export function buildOrderSections(orders, logs) {
  const sortedOrders = [...(orders || [])].sort((a, b) => a.createAt - b.createAt);
  const sections = [];
  const byOrderId = new Map();
  const ordersByProvider = new Map();

  for (const order of sortedOrders) {
    const section = {
      key: order.orderId,
      label: String(order.provider || "未知"),
      order,
      logs: [],
    };
    sections.push(section);
    byOrderId.set(order.orderId, section);
    const prov = order.provider;
    if (!ordersByProvider.has(prov))
      ordersByProvider.set(prov, []);
    ordersByProvider.get(prov).push(order);
  }

  const orphanByProvider = new Map();
  const touchOrphan = (provider) => {
    const key = provider ? String(provider) : "__other__";
    if (!orphanByProvider.has(key)) {
      const section = {
        key: `orphan:${key}`,
        label: provider ? `${provider} · 未成单` : "其他",
        order: null,
        logs: [],
      };
      orphanByProvider.set(key, section);
      sections.push(section);
    }
    return orphanByProvider.get(key);
  };

  for (const log of logs || []) {
    const orderId = log.orderId ? String(log.orderId) : null;
    if (orderId && byOrderId.has(orderId)) {
      byOrderId.get(orderId).logs.push(log);
      continue;
    }

    const provider = log.provider;
    const pool = provider ? ordersByProvider.get(provider) : null;

    if (!pool?.length) {
      touchOrphan(provider).logs.push(log);
      continue;
    }
    if (pool.length === 1) {
      byOrderId.get(pool[0].orderId).logs.push(log);
      continue;
    }

    let best = pool[0];
    let bestDist = Math.abs(log.createAt - best.createAt);
    for (const o of pool.slice(1)) {
      const dist = Math.abs(log.createAt - o.createAt);
      if (dist < bestDist) {
        bestDist = dist;
        best = o;
      }
    }
    byOrderId.get(best.orderId).logs.push(log);
  }

  for (const section of sections) {
    section.logs.sort((a, b) => a.createAt - b.createAt);
  }

  return sections
    .filter(s => s.order || s.logs.length > 0)
    .sort((a, b) => {
      if (a.order && b.order)
        return a.order.createAt - b.order.createAt;
      if (a.order)
        return -1;
      if (b.order)
        return 1;
      return (a.logs[0]?.createAt || 0) - (b.logs[0]?.createAt || 0);
    });
}

/** 从预检日志 / 摘要解析 Home|Away */
export function extractLogTarget(parsed, kind, summary) {
  if (kind === "check" && parsed?.options?.target) {
    const t = String(parsed.options.target);
    if (t === "Home" || t === "Away")
      return t;
  }
  const m = String(summary || "").match(/\s(Home|Away)@/);
  return m?.[1] || null;
}

export function sideDisplayLabel(side) {
  if (side === "Home")
    return "主队";
  if (side === "Away")
    return "客队";
  return "未知";
}

function formatLegLabel(side) {
  return sideDisplayLabel(side);
}

function inferTargetFromLogs(logs) {
  for (const log of logs || []) {
    if (log.target === "Home" || log.target === "Away")
      return log.target;
  }
  for (const log of logs || []) {
    const m = String(log.summary || "").match(/\s(Home|Away)@/);
    if (m)
      return m[1];
  }
  return null;
}

function createSideLegs() {
  return [
    { key: "leg-home", legIndex: 0, side: "Home", label: "主队", provider: null, attempts: [] },
    { key: "leg-away", legIndex: 1, side: "Away", label: "客队", provider: null, attempts: [] },
  ];
}

function legIndexForSide(side) {
  return side === "Away" ? 1 : 0;
}

function touchLegProvider(leg, provider) {
  if (!provider)
    return;
  if (!leg.provider) {
    leg.provider = provider;
    return;
  }
  if (leg.provider.includes(provider))
    return;
  leg.provider = `${leg.provider}/${provider}`;
}

function refreshLegLabels(legs) {
  for (const leg of legs) {
    leg.label = formatLegLabel(leg.side);
  }
}

function resolveLegIndexByProvider(provider, legs) {
  if (!provider)
    return legs[0].attempts.length <= legs[1].attempts.length ? 0 : 1;
  for (let i = 0; i < 2; i++) {
    if (legs[i].provider === provider || legs[i].provider?.includes(provider))
      return i;
    for (const att of legs[i].attempts) {
      if (att.order?.provider === provider)
        return i;
    }
  }
  return legs[0].attempts.length <= legs[1].attempts.length ? 0 : 1;
}

function pickLegIndexForUnassigned(legs) {
  const homeN = legs[0].attempts.length;
  const awayN = legs[1].attempts.length;
  if (homeN && !awayN)
    return 1;
  if (!homeN && awayN)
    return 0;
  return homeN <= awayN ? 0 : 1;
}

function assignOrphanLogsToAttempts(attempts, orphanLogs) {
  if (!orphanLogs.length)
    return;
  if (!attempts.length) {
    attempts.push({ key: "orphan", order: null, logs: [...orphanLogs], logSegments: [] });
    return;
  }
  for (const log of orphanLogs) {
    let best = attempts[0];
    let bestDist = Math.abs(log.createAt - (best.order?.createAt || log.createAt));
    for (const att of attempts.slice(1)) {
      const t = att.order?.createAt ?? 0;
      const dist = Math.abs(log.createAt - t);
      if (dist < bestDist) {
        bestDist = dist;
        best = att;
      }
    }
    best.logs.push(log);
  }
}

/** 从 Client_SaveUserLog title 解析账号展示，如 [OB](星空,4) → OB · 星空 / 4 */
export function extractLogAccountLabel(title) {
  const m = String(title || "").match(/^\[([^\]]+)\]\(([^,]+),([^)]+)\)/);
  if (!m)
    return null;
  const provider = m[1];
  const platformName = String(m[2]).trim();
  const playerName = String(m[3]).trim();
  return {
    provider,
    platformName,
    playerName,
    label: `${provider} · ${platformName} / ${playerName}`,
  };
}

/**
 * 按预检日志切分轮次（对齐 A8 主循环：每轮 1 次 check + 下注尝试）
 */
export function buildLogSegments(logs) {
  const sorted = [...(logs || [])].sort((a, b) => a.createAt - b.createAt);
  if (!sorted.length)
    return [];

  const segments = [];
  let current = null;

  const flush = () => {
    if (current?.logs?.length) {
      segments.push(current);
      current = null;
    }
  };

  for (const log of sorted) {
    if (log.kind === "check") {
      flush();
      const parsed = extractLogAccountLabel(log.title);
      current = {
        key: `seg-${log.id ?? log.createAt}`,
        accountLabel: log.accountLabel || parsed?.label || null,
        provider: log.provider || parsed?.provider || null,
        isMakeUp: Boolean(log.loseOrder),
        logs: [log],
      };
    }
    else if (current) {
      current.logs.push(log);
    }
    else {
      flush();
      const parsed = extractLogAccountLabel(log.title);
      current = {
        key: `seg-${log.id ?? log.createAt}`,
        accountLabel: log.accountLabel || parsed?.label || null,
        provider: log.provider || parsed?.provider || null,
        isMakeUp: Boolean(log.loseOrder),
        logs: [log],
      };
    }
  }
  flush();
  return segments;
}

/**
 * 主客队分栏：按 Home/Away；同侧拒单重下在同一栏内分段
 */
export function buildLegSections(orders, logs, meta = {}) {
  const sortedOrders = [...(orders || [])].sort((a, b) => a.createAt - b.createAt);
  const sortedLogs = [...(logs || [])].sort((a, b) => a.createAt - b.createAt);
  const groupLabel = String(meta.groupLabel || "");
  const linkType = String(meta.linkType || "");
  const isArb
    = linkType === "套利"
      || groupLabel.includes("套利")
      || (sortedOrders.length > 1 && sortedOrders.every(o => Number(o.link) >= ARB_LINK_MIN));

  const legs = createSideLegs();
  const attempts = sortedOrders.map(order => ({
    key: order.orderId,
    order,
    logs: [],
    logSegments: [],
    side: null,
  }));
  const attemptByOrderId = new Map(attempts.map(a => [a.order.orderId, a]));
  const orphanLogs = [];

  for (const log of sortedLogs) {
    const orderId = log.orderId ? String(log.orderId) : null;
    if (orderId && attemptByOrderId.has(orderId)) {
      attemptByOrderId.get(orderId).logs.push(log);
    }
    else {
      orphanLogs.push(log);
    }
  }

  for (const att of attempts) {
    att.side = inferTargetFromLogs(att.logs);
    att.logs.sort((a, b) => a.createAt - b.createAt);
  }

  const unassigned = [];
  for (const att of attempts) {
    if (att.side === "Home" || att.side === "Away") {
      const leg = legs[legIndexForSide(att.side)];
      leg.attempts.push(att);
      touchLegProvider(leg, att.order.provider);
    }
    else {
      unassigned.push(att);
    }
  }

  for (const att of unassigned) {
    const legIdx = pickLegIndexForUnassigned(legs);
    att.side = legs[legIdx].side;
    legs[legIdx].attempts.push(att);
    touchLegProvider(legs[legIdx], att.order.provider);
  }

  for (const leg of legs) {
    leg.attempts.sort((a, b) => (a.order?.createAt ?? 0) - (b.order?.createAt ?? 0));
  }

  const orphanBySide = { Home: [], Away: [], unknown: [] };
  for (const log of orphanLogs) {
    const side
      = log.target === "Home" || log.target === "Away"
        ? log.target
        : extractLogTarget(null, log.kind, log.summary);
    if (side === "Home")
      orphanBySide.Home.push(log);
    else if (side === "Away")
      orphanBySide.Away.push(log);
    else orphanBySide.unknown.push(log);
  }

  for (const side of ["Home", "Away"]) {
    const idx = legIndexForSide(side);
    const list = orphanBySide[side];
    if (!list.length)
      continue;
    assignOrphanLogsToAttempts(legs[idx].attempts, list);
    if (!legs[idx].provider) {
      const prov = list.find(l => l.provider)?.provider;
      if (prov)
        legs[idx].provider = prov;
    }
  }

  if (orphanBySide.unknown.length) {
    for (const log of orphanBySide.unknown) {
      const idx = resolveLegIndexByProvider(log.provider, legs);
      assignOrphanLogsToAttempts(legs[idx].attempts, [log]);
      touchLegProvider(legs[idx], log.provider);
    }
  }

  for (const leg of legs) {
    for (const att of leg.attempts) {
      att.logSegments = buildLogSegments(att.logs);
    }
  }

  refreshLegLabels(legs);

  if (isArb) {
    return legs;
  }
  return legs.filter(leg => leg.attempts.some(a => a.order || a.logs.length > 0));
}

/** 从 saveUserLog 行提取可读摘要 */
export function summarizeUserLog(row) {
  const title = String(row?.title || "");
  const kind = classifyLogTitle(title);
  const parsed = parseLogData(row?.data);
  const provider = extractLogProvider(title, parsed, kind);
  const orderId = extractLogOrderId(title, parsed, kind);
  const target = extractLogTarget(parsed, kind, title);
  const out = {
    id: row?.id,
    createAt: Number(row?.create_at) || 0,
    title,
    kind,
    provider,
    orderId: orderId || null,
    target: target || null,
    accountLabel: null,
    loseOrder: false,
    summary: title,
  };

  const acct = extractLogAccountLabel(title);
  if (acct)
    out.accountLabel = acct.label;

  if (kind === "check" && parsed?.options) {
    const o = parsed.options;
    out.target = out.target || (o.target === "Home" || o.target === "Away" ? o.target : null);
    out.loseOrder = Boolean(o.loseOrder);
    out.summary = `${o.type} 预检 ${o.match || ""} ${o.bet || ""} ${o.target}@${o.odds} 金额${o.betMoney}`;
    if (parsed.checkError)
      out.summary += ` · ${parsed.checkError}`;
  }
  else if (kind === "bet" && parsed?.result) {
    const r = parsed.result;
    out.summary = `${r.provider} 下注 ${r.success ? "成功" : "失败"} · ${r.message || ""}`.trim();
  }

  return out;
}

function normalizeOrderRow(row) {
  if (!row)
    return null;
  return {
    orderId: String(row.order_id),
    link: Number(row.link) || 0,
    provider: row.provider,
    playerId: row.player_id,
    match: row.match,
    bet: row.bet,
    item: row.item,
    odds: Number(row.odds) || 0,
    betMoney: Number(row.bet_money) || 0,
    money: Number(row.money) || 0,
    status: row.status,
    createAt: Number(row.create_at) || 0,
  };
}

async function resolveLookupUser(opts) {
  const userId = String(opts?.userId || "").trim();
  if (userId)
    return fetchUserById(userId);
  const userName = String(opts?.userName || "").trim();
  if (userName)
    return fetchUserByName(userName);
  return null;
}

/** 管理端 API：不含 logsRaw */
export function toAdminOrderLogPayload(result) {
  if (!result.ok)
    return result;
  const orders = result.orders || [];
  const logs = result.logs || [];
  return {
    ok: true,
    user: result.user,
    anchor: result.anchor,
    link: result.link,
    linkType: result.linkType,
    groupLabel: result.groupLabel,
    logWindow: result.logWindow,
    orders,
    logs,
    platforms: buildPlatformSections(orders, logs),
    orderSections: buildOrderSections(orders, logs),
    legSections: buildLegSections(orders, logs, {
      groupLabel: result.groupLabel,
      linkType: result.linkType,
    }),
  };
}

/**
 * @param {{ userName?: string, userId?: string, link?: number|string, orderId?: string, paddingMs?: number, logLimit?: number }} opts
 */
export async function lookupOrderLogs(opts) {
  const user = await resolveLookupUser(opts);
  if (!user?.id) {
    const hint = opts?.userId
      ? `用户不存在: ${opts.userId}`
      : opts?.userName
        ? `用户不存在: ${opts.userName}`
        : "缺少 userName 或 userId";
    return { ok: false, error: hint };
  }

  let orders = [];
  let anchor = { type: "user", value: user.user_name };

  if (opts?.link != null && String(opts.link).trim() !== "") {
    const linkVal = Number(opts.link);
    if (!Number.isFinite(linkVal) || linkVal === 0) {
      return { ok: false, error: "无效 link" };
    }
    orders = await fetchOrdersByLink(user.id, linkVal);
    anchor = { type: "link", value: linkVal };
    if (!orders.length) {
      return {
        ok: false,
        error: `未找到订单 link=${linkVal}（用户 ${user.user_name}）`,
        user: { id: user.id, userName: user.user_name },
      };
    }
  }
  else if (opts?.orderId) {
    const row = await fetchOrderByOrderId(user.id, opts.orderId);
    if (!row) {
      return {
        ok: false,
        error: `未找到 order_id=${opts.orderId}`,
        user: { id: user.id, userName: user.user_name },
      };
    }
    orders = [row];
    if (row.link) {
      const linked = await fetchOrdersByLink(user.id, row.link);
      if (linked.length)
        orders = linked;
    }
    anchor = { type: "orderId", value: String(opts.orderId) };
  }
  else {
    return { ok: false, error: "请指定 link 或 orderId" };
  }

  const normalized = orders.map(normalizeOrderRow).filter(Boolean);
  const link = normalized[0]?.link ?? 0;
  const window = computeLogWindow(orders, opts?.paddingMs);
  if (!window) {
    return { ok: false, error: "无法计算日志时间窗" };
  }

  const logs = await fetchUserLogsInRange(
    user.id,
    window.fromMs,
    window.toMs,
    opts?.logLimit ?? 200,
  );

  return {
    ok: true,
    user: { id: user.id, userName: user.user_name },
    anchor,
    link,
    linkType: linkTypeLabel(link),
    groupLabel: groupMetaLabel(link, normalized.length),
    logWindow: window,
    orders: normalized,
    logs: logs.map(summarizeUserLog),
    logsRaw: logs,
  };
}

/** CLI / 管理输出 */
export function formatLookupReport(result) {
  if (!result.ok) {
    return [`错误: ${result.error}`, result.user ? `用户: ${result.user.userName}` : ""]
      .filter(Boolean)
      .join("\n");
  }

  const lines = [];
  lines.push(`用户: ${result.user.userName} (${result.user.id})`);
  lines.push(
    `锚点: ${result.anchor.type}=${result.anchor.value} · Link ${result.link} · ${result.linkType} · ${result.groupLabel}`,
  );
  lines.push(
    `日志窗口: ${formatCnTime(result.logWindow.fromMs)} — ${formatCnTime(result.logWindow.toMs)}`,
  );
  lines.push("");
  lines.push("── 订单 ──");
  for (const o of result.orders) {
    lines.push(
      [
        formatCnTime(o.createAt),
        o.provider,
        o.status,
        `${o.item}@${o.odds}`,
        `¥${o.betMoney}`,
        `order=${o.orderId}`,
      ].join(" · "),
    );
  }
  lines.push("");
  lines.push(`── user_logs (${result.logs.length}) ──`);
  for (const log of result.logs) {
    lines.push(`${formatCnTime(log.createAt)} [${log.kind}] ${log.summary}`);
  }
  if (!result.logs.length) {
    lines.push("（该时间窗内无 Client_SaveUserLog 记录）");
  }
  return lines.join("\n");
}

export function formatCnTime(ts) {
  const n = Number(ts);
  if (!n)
    return "—";
  return new Date(n).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
}
