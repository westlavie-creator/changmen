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

  // src/content/pod-alerts-book.js
  function num2(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  function calculateNoVig(a, b) {
    const x = parseFloat(a);
    const y = parseFloat(b);
    if (isNaN(x) || isNaN(y) || x <= 1 || y <= 1)
      return 0;
    const implied = [1 / x, 1 / y];
    let k = 1;
    let powered = implied.map((p) => Math.pow(p, k));
    for (let i = 0; i < 100; i++) {
      const err = powered.reduce((s, p) => s + p, 0) - 1;
      const deriv = implied.reduce((s, p) => s + Math.log(p) * Math.pow(p, k), 0);
      if (!deriv)
        break;
      k -= err / deriv;
      powered = implied.map((p) => Math.pow(p, k));
      if (Math.abs(err) < 1e-4)
        break;
    }
    const nvp = 1 / powered[0];
    if (!Number.isFinite(nvp) || nvp <= 1)
      return 0;
    return parseFloat(nvp.toFixed(3));
  }
  function mapLine(eventId, row) {
    const market = String(row && row.market || "").toLowerCase();
    const line = Number(row && row.line);
    if (!eventId || market !== "spreads" && market !== "totals" && market !== "moneyline")
      return null;
    if (!Number.isFinite(line))
      return null;
    const home = num2(row.home);
    const away = num2(row.away);
    const over = num2(row.over);
    const under = num2(row.under);
    return {
      eventId: String(eventId),
      period: num2(row.period),
      market,
      line,
      nvpHome: home > 1 && away > 1 ? calculateNoVig(home, away) : 0,
      nvpAway: home > 1 && away > 1 ? calculateNoVig(away, home) : 0,
      nvpOver: over > 1 && under > 1 ? calculateNoVig(over, under) : 0,
      nvpUnder: over > 1 && under > 1 ? calculateNoVig(under, over) : 0
    };
  }
  function mapPodBookEvents(events) {
    if (!Array.isArray(events))
      return [];
    const out = [];
    for (const event of events) {
      if (!event || typeof event !== "object")
        continue;
      const eventId = String(event.eventId || "");
      const lines = Array.isArray(event.lines) ? event.lines : [];
      for (const row of lines) {
        const mapped = mapLine(eventId, row);
        if (mapped)
          out.push(mapped);
      }
    }
    return out;
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
      alerts: mapped.alerts.slice(0, MAX_ALERTS),
      books: mapPodBookEvents(data.books)
    });
  });
})();
