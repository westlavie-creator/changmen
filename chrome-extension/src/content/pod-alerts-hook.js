/**
 * MAIN world：截官网同一条告警 HTTP，不刮 DOM。
 * 终端对 sword.pinnacleoddsdropper.com/alerts/{userId} 做 cursor 短轮询（约 250ms 间隔），
 * 不是 WebSocket / SSE。增量响应要按 id 累加，不能用最后一次空包覆盖。
 * 另截 /events/{eventId}（Pinnacle 逐档赔），摊成 compact book，给副盘用该档 NVP。
 */
(function podAlertsHookMain() {
  if (window.__CM_POD_ALERTS_HOOK__)
    return;
  window.__CM_POD_ALERTS_HOOK__ = true;

  const SOURCE = "cm-pod-alerts";
  const MAX = 400;
  const MAX_BOOKS = 80;
  const byId = new Map();
  const books = new Map();
  const pendingEvents = new Set();
  let sourceHit = false;
  let lastAlertsUrl = "";
  let fetchTimer = 0;

  function emit() {
    window.postMessage({
      source: SOURCE,
      kind: "snapshot",
      href: String(location.href || ""),
      gridFound: sourceHit,
      rows: [...byId.values()],
      books: [...books.values()],
      capturedAt: Date.now(),
    }, "*");
  }

  function absUrl(url) {
    try {
      return new URL(String(url || ""), location.href).href;
    }
    catch {
      return String(url || "");
    }
  }

  function urlOf(input) {
    if (typeof input === "string")
      return input;
    if (input && typeof input === "object")
      return String(input.url || "");
    return "";
  }

  function isAlertsUrl(url) {
    return /pinnacleoddsdropper\.com\/alerts\//i.test(absUrl(url));
  }

  function isEventsUrl(url) {
    return /pinnacleoddsdropper\.com\/events\/\d+/i.test(absUrl(url));
  }

  function eventIdFrom(url) {
    const m = absUrl(url).match(/\/events\/(\d+)/i);
    return m ? m[1] : "";
  }

  function periodNum(key) {
    const m = String(key || "").match(/(\d+)/);
    if (!m)
      return -1;
    const n = Number(m[1]);
    return n === 0 || n === 1 ? n : -1;
  }

  function flattenEvent(eventId, body) {
    const data = body && (body.data || body);
    const periods = data && data.periods;
    if (!eventId || !periods || typeof periods !== "object")
      return null;
    const lines = [];
    const keys = Object.keys(periods);
    for (let i = 0; i < keys.length; i++) {
      const pkey = keys[i];
      const period = periodNum(pkey);
      if (period < 0)
        continue;
      const row = periods[pkey];
      if (!row || typeof row !== "object")
        continue;
      if (row.spreads && typeof row.spreads === "object") {
        const skeys = Object.keys(row.spreads);
        for (let j = 0; j < skeys.length; j++) {
          const line = Number(skeys[j]);
          const cell = row.spreads[skeys[j]];
          const home = Number(cell && cell.home);
          const away = Number(cell && cell.away);
          if (!Number.isFinite(line) || !(home > 1) || !(away > 1))
            continue;
          lines.push({ period, market: "spreads", line, home, away });
        }
      }
      if (row.totals && typeof row.totals === "object") {
        const tkeys = Object.keys(row.totals);
        for (let j = 0; j < tkeys.length; j++) {
          const line = Number(tkeys[j]);
          const cell = row.totals[tkeys[j]];
          const over = Number(cell && cell.over);
          const under = Number(cell && cell.under);
          if (!Number.isFinite(line) || !(over > 1) || !(under > 1))
            continue;
          lines.push({ period, market: "totals", line, over, under });
        }
      }
      if (row.moneyline && typeof row.moneyline === "object") {
        const home = Number(row.moneyline.home);
        const away = Number(row.moneyline.away);
        if (home > 1 && away > 1)
          lines.push({ period, market: "moneyline", line: 0, home, away });
      }
    }
    if (!lines.length)
      return null;
    return { eventId: String(eventId), capturedAt: Date.now(), lines };
  }

  function ingestBook(eventId, body) {
    const row = flattenEvent(eventId, body);
    if (!row)
      return;
    books.set(row.eventId, row);
    if (books.size > MAX_BOOKS) {
      const ranked = [...books.values()].sort((a, b) => Number(b.capturedAt || 0) - Number(a.capturedAt || 0));
      books.clear();
      for (let i = 0; i < MAX_BOOKS; i++) {
        const item = ranked[i];
        if (item && item.eventId)
          books.set(item.eventId, item);
      }
    }
    emit();
  }

  function isFootballRow(row) {
    if (Number(row.sportId) === 1)
      return true;
    const nick = String((row.alertInfo && row.alertInfo.nickname) || row.nickname || "");
    return /football|soccer/i.test(nick);
  }

  function eventsFetchUrl(id) {
    if (!lastAlertsUrl)
      return "";
    try {
      const u = new URL(lastAlertsUrl);
      u.pathname = u.pathname.replace(/\/alerts\/.*$/, "/events/" + id);
      u.search = "";
      u.hash = "";
      return u.toString();
    }
    catch {
      return "";
    }
  }

  function pumpEvents() {
    if (fetchTimer)
      return;
    fetchTimer = setTimeout(() => {
      fetchTimer = 0;
      const id = pendingEvents.values().next().value;
      if (!id)
        return;
      pendingEvents.delete(id);
      if (books.has(id)) {
        if (pendingEvents.size)
          pumpEvents();
        return;
      }
      const url = eventsFetchUrl(id);
      if (!url) {
        if (pendingEvents.size)
          pumpEvents();
        return;
      }
      origFetch(url).then((res) => {
        if (!res || typeof res.clone !== "function")
          return null;
        return res.clone().json();
      }).then((body) => {
        if (body)
          ingestBook(id, body);
      }).catch(() => {}).finally(() => {
        if (pendingEvents.size)
          pumpEvents();
      });
    }, 400);
  }

  function queueFootballEvents() {
    for (const row of byId.values()) {
      if (!isFootballRow(row))
        continue;
      const id = String(row.ext_event_id || row.eventId || "");
      if (!id || books.has(id) || pendingEvents.has(id))
        continue;
      pendingEvents.add(id);
    }
    if (pendingEvents.size)
      pumpEvents();
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
    queueFootballEvents();
  }

  function tapJson(p, kind, eventId) {
    Promise.resolve(p).then((res) => {
      if (!res || typeof res.clone !== "function")
        return;
      return res.clone().json();
    }).then((body) => {
      if (!body)
        return;
      if (kind === "events")
        ingestBook(eventId, body);
      else
        ingest(body.data || body.alerts || (Array.isArray(body) ? body : []));
    }).catch(() => {
      sourceHit = true;
      emit();
    });
  }

  const origFetch = window.fetch;
  window.fetch = function podAlertsFetch(input, init) {
    const url = urlOf(input);
    if (isAlertsUrl(url))
      lastAlertsUrl = absUrl(url);
    const req = origFetch.apply(this, arguments);
    if (isAlertsUrl(url))
      tapJson(req, "alerts");
    else if (isEventsUrl(url))
      tapJson(req, "events", eventIdFrom(url));
    return req;
  };

  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function podAlertsXhrOpen(method, url) {
    this.__cmPodUrl = String(url || "");
    return origOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function podAlertsXhrSend() {
    this.addEventListener("load", function podAlertsXhrLoad() {
      const url = this.__cmPodUrl || "";
      if (isAlertsUrl(url))
        lastAlertsUrl = absUrl(url);
      if (!isAlertsUrl(url) && !isEventsUrl(url))
        return;
      try {
        const body = JSON.parse(this.responseText);
        if (isEventsUrl(url))
          ingestBook(eventIdFrom(url), body);
        else
          ingest(body.data || body.alerts || (Array.isArray(body) ? body : []));
      }
      catch { /* ignore */ }
    });
    return origSend.apply(this, arguments);
  };

  emit();
})();
