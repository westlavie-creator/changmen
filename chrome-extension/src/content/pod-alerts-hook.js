/**
 * MAIN world：截官网同一条告警 HTTP，不刮 DOM。
 * 终端对 sword.pinnacleoddsdropper.com/alerts/{userId} 做 cursor 短轮询（约 250ms 间隔），
 * 不是 WebSocket / SSE。增量响应要按 id 累加，不能用最后一次空包覆盖。
 */
(function podAlertsHookMain() {
  if (window.__CM_POD_ALERTS_HOOK__)
    return;
  window.__CM_POD_ALERTS_HOOK__ = true;

  const SOURCE = "cm-pod-alerts";
  const MAX = 400;
  const byId = new Map();
  let sourceHit = false;

  function emit() {
    window.postMessage({
      source: SOURCE,
      kind: "snapshot",
      href: String(location.href || ""),
      gridFound: sourceHit,
      rows: [...byId.values()],
      capturedAt: Date.now(),
    }, "*");
  }

  function ingest(rows) {
    if (!Array.isArray(rows))
      return;
    sourceHit = true;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row || typeof row !== "object")
        continue;
      const type = String(row.type || "");
      if (type && type !== "oddsDrop")
        continue;
      const id = String(row.id || row.alertId || "");
      if (!id)
        continue;
      byId.set(id, row);
    }
    if (byId.size > MAX) {
      const ranked = [...byId.values()].sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0));
      byId.clear();
      for (let i = 0; i < MAX; i++) {
        const row = ranked[i];
        const id = String(row.id || row.alertId || "");
        if (id)
          byId.set(id, row);
      }
    }
    emit();
  }

  function urlOf(input) {
    if (typeof input === "string")
      return input;
    if (input && typeof input === "object")
      return String(input.url || "");
    return "";
  }

  function isAlertsUrl(url) {
    return /pinnacleoddsdropper\.com\/alerts\//i.test(url);
  }

  function tapJson(p) {
    Promise.resolve(p).then((res) => {
      if (!res || typeof res.clone !== "function")
        return;
      return res.clone().json();
    }).then((body) => {
      if (!body)
        return;
      ingest(body.data || body.alerts || (Array.isArray(body) ? body : []));
    }).catch(() => {
      sourceHit = true;
      emit();
    });
  }

  const origFetch = window.fetch;
  window.fetch = function podAlertsFetch(input, init) {
    const req = origFetch.apply(this, arguments);
    if (isAlertsUrl(urlOf(input)))
      tapJson(req);
    return req;
  };

  emit();
})();
