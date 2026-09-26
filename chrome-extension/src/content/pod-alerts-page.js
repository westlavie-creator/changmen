import { mapPodAlertRows } from "./pod-alerts-map.js";
import { mapPodBookEvents } from "./pod-alerts-book.js";

const SOURCE = "cm-pod-alerts";
const MAX_ALERTS = 400;
const HEARTBEAT_MS = 2_000;
const FULL_RESYNC_MS = 10_000;

let lastDataFingerprint = "";
let lastStatusFingerprint = "";
let lastHeartbeatAt = 0;
let lastFullSnapshotAt = 0;
let lastSnapshotPayload = null;

function post(payload) {
  try {
    chrome.runtime.sendMessage(payload, () => {
      void chrome.runtime.lastError;
    });
  }
  catch { /* 扩展上下文失效 */ }
}

window.addEventListener("message", (event) => {
  if (event.source !== window)
    return;
  const data = event.data;
  if (!data || data.source !== SOURCE || data.kind !== "snapshot")
    return;
  const now = Date.now();
  const mapped = mapPodAlertRows(data.rows);
  const books = mapPodBookEvents(data.books);
  const statusFingerprint = `${data.gridFound === true}|${typeof data.href === "string" ? data.href : location.href}`;
  const dataFingerprint = `${mapped.fingerprint}\n${JSON.stringify(books)}`;
  const dataChanged = dataFingerprint !== lastDataFingerprint;
  const statusChanged = statusFingerprint !== lastStatusFingerprint;

  const needsFullResync = now - lastFullSnapshotAt >= FULL_RESYNC_MS;
  if (!dataChanged && !statusChanged && !needsFullResync) {
    if (now - lastHeartbeatAt < HEARTBEAT_MS)
      return;
    lastHeartbeatAt = now;
    post({
      type: "podAlertsHeartbeat",
      href: typeof data.href === "string" ? data.href : location.href,
      gridFound: data.gridFound === true,
      capturedAt: Number(data.capturedAt) || now,
    });
    return;
  }

  lastDataFingerprint = dataFingerprint;
  lastStatusFingerprint = statusFingerprint;
  lastHeartbeatAt = now;
  lastFullSnapshotAt = now;
  lastSnapshotPayload = {
    type: "podAlertsSnapshot",
    fingerprint: dataFingerprint,
    href: typeof data.href === "string" ? data.href : location.href,
    gridFound: data.gridFound === true,
    capturedAt: Number(data.capturedAt) || Date.now(),
    alerts: mapped.alerts.slice(0, MAX_ALERTS),
    books,
  };
  post(lastSnapshotPayload);
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== "podAlertsResync" || !lastSnapshotPayload)
    return;
  lastFullSnapshotAt = Date.now();
  post({ ...lastSnapshotPayload, capturedAt: Date.now() });
});
