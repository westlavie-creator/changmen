/** 每平台 WS 转发运行时统计（连接数、累计、最近错误） */

const stats = new Map();

function ensure(id) {
  if (!stats.has(id)) {
    stats.set(id, {
      active: 0,
      totalConnections: 0,
      lastConnectedAt: 0,
      lastError: "",
      lastErrorAt: 0,
    });
  }
  return stats.get(id);
}

export function recordConnect(id) {
  const s = ensure(id);
  s.active += 1;
  s.totalConnections += 1;
  s.lastConnectedAt = Date.now();
}

export function recordDisconnect(id) {
  const s = ensure(id);
  if (s.active > 0) s.active -= 1;
}

export function recordError(id, message) {
  const s = ensure(id);
  s.lastError = String(message || "").slice(0, 200);
  s.lastErrorAt = Date.now();
}

export function getForwardStats() {
  const out = {};
  for (const [id, s] of stats) {
    out[id] = { ...s };
  }
  return out;
}
