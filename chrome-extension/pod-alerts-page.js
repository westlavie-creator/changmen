(() => {
  // src/content/pod-alerts-map.js
  function str(v) {
    return String(v ?? "").trim();
  }
  function num(v, fallback = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }
  function optNum(v) {
    if (v == null || v === "")
      return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  function mapPodAlert(row) {
    if (!row || typeof row !== "object")
      return null;
    const info = row.alertInfo && typeof row.alertInfo === "object" ? row.alertInfo : {};
    const id = str(row.alertId || row.id);
    if (!id)
      return null;
    const home = str(row.homeTeam || row.home);
    const away = str(row.awayTeam || row.away);
    const lineType = str(row.lineType);
    return {
      id,
      eventId: str(row.ext_event_id || row.eventId),
      sport: str(info.nickname || row.nickname),
      sportId: num(row.sportId),
      league: str(row.leagueName),
      home,
      away,
      starts: num(row.starts),
      alertedAt: num(info.alertedAt || row.timestamp || row.alertedAt),
      market: str(row.market || lineType),
      lineType,
      period: num(row.period ?? row.periodNumber),
      outcome: str(row.rowOutcome || row.outcome),
      points: optNum(row.points),
      previous: num(row.previous ?? row.changeFrom),
      current: num(row.current ?? row.changeTo),
      nvp: num(row.noVigPrice),
      dropPct: num(row.percentageChange),
      ways: optNum(row.moneylineNumberOfWays)
    };
  }
  function mapPodAlertRows(rows) {
    if (!Array.isArray(rows))
      return { alerts: [], fingerprint: "" };
    const alerts = [];
    for (const row of rows) {
      const mapped = mapPodAlert(
        /** @type {Record<string, unknown>} */
        row
      );
      if (mapped)
        alerts.push(mapped);
    }
    alerts.sort((a, b) => Number(b.alertedAt) - Number(a.alertedAt) || String(a.id).localeCompare(String(b.id)));
    const fingerprint = alerts.map((a) => `${a.id}:${a.current}:${a.nvp}:${a.dropPct}`).join("|");
    return { alerts, fingerprint };
  }

  // src/content/pod-alerts-page.js
  var SOURCE = "cm-pod-alerts";
  var MAX_ALERTS = 400;
  function post(payload) {
    try {
      chrome.runtime.sendMessage(payload, () => {
        void chrome.runtime.lastError;
      });
    } catch {
    }
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
      alerts: mapped.alerts.slice(0, MAX_ALERTS)
    });
  });
})();
