import { mapPodAlertRows } from "./pod-alerts-map.js";

const SOURCE = "cm-pod-alerts";
const MAX_ALERTS = 400;

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
  const mapped = mapPodAlertRows(data.rows);
  post({
    type: "podAlertsSnapshot",
    href: typeof data.href === "string" ? data.href : location.href,
    gridFound: data.gridFound === true,
    capturedAt: Number(data.capturedAt) || Date.now(),
    alerts: mapped.alerts.slice(0, MAX_ALERTS),
  });
});
