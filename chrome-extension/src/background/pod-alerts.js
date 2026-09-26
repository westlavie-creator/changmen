/** changmen 页长连接名 */
export const POD_ALERTS_PORT = "pod-alerts";

const SOURCE_STALE_MS = 8000;

/** @type {{ alerts: unknown[]; books: unknown[]; capturedAt: number; href: string; gridFound: boolean; sourceConnected: boolean }} */
let snapshot = {
  alerts: [],
  books: [],
  capturedAt: 0,
  href: "",
  gridFound: false,
  sourceConnected: false,
};

/** @type {Set<chrome.runtime.Port>} */
const listeners = new Set();
let lastSeen = 0;
let watchdog = 0;
let snapshotFingerprint = "";

function payload() {
  const sourceConnected = snapshot.sourceConnected
    && lastSeen > 0
    && (Date.now() - lastSeen) < SOURCE_STALE_MS;
  return {
    type: "podAlertsSnapshot",
    alerts: snapshot.alerts,
    books: snapshot.books,
    capturedAt: snapshot.capturedAt,
    href: snapshot.href,
    gridFound: snapshot.gridFound,
    sourceConnected,
  };
}

function broadcast() {
  const msg = payload();
  for (const port of listeners) {
    try {
      port.postMessage(msg);
    }
    catch {
      listeners.delete(port);
    }
  }
}

function ensureWatchdog() {
  if (watchdog)
    return;
  watchdog = setInterval(() => {
    const connected = lastSeen > 0 && (Date.now() - lastSeen) < SOURCE_STALE_MS;
    if (snapshot.sourceConnected !== connected) {
      snapshot.sourceConnected = connected;
      broadcast();
    }
  }, 2000);
}

export function attachPodAlertsPort(port) {
  listeners.add(port);
  try {
    port.postMessage(payload());
  }
  catch { /* ignore */ }
  // MV3 worker 可能被回收；新 changmen 端口接入时向现有 POD 页主动索取完整快照。
  try {
    chrome.tabs.query({}, (tabs) => {
      for (const tab of tabs) {
        if (!tab.id)
          continue;
        chrome.tabs.sendMessage(tab.id, { type: "podAlertsResync" }, () => {
          void chrome.runtime.lastError;
        });
      }
    });
  }
  catch { /* ignore */ }
  port.onDisconnect.addListener(() => {
    listeners.delete(port);
  });
}

/**
 * @param {unknown} message
 * @returns {boolean}
 */
export function ingestPodAlertsMessage(message) {
  if (!message || typeof message !== "object")
    return false;
  const row = /** @type {{ type?: string }} */ (message);
  if (row.type === "podAlertsHeartbeat") {
    const body = /** @type {{ capturedAt?: unknown; href?: unknown; gridFound?: unknown }} */ (message);
    const prevGridFound = snapshot.gridFound;
    const prevHref = snapshot.href;
    snapshot.capturedAt = Number(body.capturedAt) || Date.now();
    snapshot.href = typeof body.href === "string" ? body.href : snapshot.href;
    snapshot.gridFound = body.gridFound === true;
    snapshot.sourceConnected = true;
    lastSeen = Date.now();
    ensureWatchdog();
    if (prevGridFound !== snapshot.gridFound || prevHref !== snapshot.href)
      broadcast();
    return true;
  }
  if (row.type !== "podAlertsSnapshot")
    return false;
  const body = /** @type {{ alerts?: unknown; books?: unknown; capturedAt?: unknown; href?: unknown; gridFound?: unknown; fingerprint?: unknown }} */ (message);
  const nextFingerprint = typeof body.fingerprint === "string" ? body.fingerprint : "";
  const unchanged = Boolean(nextFingerprint && nextFingerprint === snapshotFingerprint);
  snapshot = {
    alerts: Array.isArray(body.alerts) ? body.alerts : [],
    books: Array.isArray(body.books) ? body.books : snapshot.books,
    capturedAt: Number(body.capturedAt) || Date.now(),
    href: typeof body.href === "string" ? body.href : "",
    gridFound: body.gridFound === true,
    sourceConnected: true,
  };
  snapshotFingerprint = nextFingerprint;
  lastSeen = Date.now();
  ensureWatchdog();
  if (!unchanged)
    broadcast();
  return true;
}
