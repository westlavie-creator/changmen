/* global EsportCollect, SnapshotRuntime */
(function () {
  const cfg = window.PLATFORM_VIEW || {};
  const platformId = cfg.platformId ? String(cfg.platformId).toUpperCase() : null;
  const isSingle = Boolean(platformId);

  const grid = document.getElementById("grid");
  const empty = document.getElementById("empty");
  const streamStatusEl = document.getElementById("stream-status");
  const syncPill = document.getElementById("sync-pill");
  const countPill = document.getElementById("count-pill");
  const pageTitle = document.getElementById("page-title");
  const platformDesc = document.getElementById("platform-desc");
  const prevOdds = new Map();

  const betOverlay = document.getElementById("bet-overlay");
  const betSub = document.getElementById("bet-sub");
  const betParams = document.getElementById("bet-params");
  const betClose = document.getElementById("bet-close");

  let registry = [];
  let streamMetaById = {};

  function encodeBetRef(ref) {
    if (!ref) return "";
    return encodeURIComponent(JSON.stringify(ref));
  }

  function buildOrderParams(ref) {
    const odd = Number(ref.odds).toFixed(3);
    const unified = {
      platform: ref.platform,
      gameCode: ref.gameCode,
      marketCode: ref.marketCode,
      stageId: ref.stageId,
      side: ref.side,
      matchId: ref.matchId,
      marketId: ref.marketId,
      oddsId: ref.oddsId,
      odds: Number(ref.odds),
      locked: ref.locked,
      label: ref.label,
    };

    if (ref.platform === "OB") {
      const b0 = `mch=${ref.matchId}&mkt=${ref.marketId}&oid=${ref.oddsId}&odd=${odd}&a={amount}&bt=1`;
      return {
        betRef: unified,
        platformOrder: {
          endpoint: "POST {gateway}/game/bet",
          contentType: "application/x-www-form-urlencoded",
          fields: {
            c: 1,
            "b[0]": b0,
            types: 1,
            time_stamp: "{unix_seconds}",
            secret_key: "md5({token}_{time_stamp}_{uid}_)",
          },
        },
      };
    }

    if (ref.platform === "RAY") {
      return {
        betRef: unified,
        platformOrder: {
          endpoint: "POST {gateway}/v2/order",
          contentType: "application/x-www-form-urlencoded",
        },
      };
    }

    return { betRef: unified, platformOrder: { note: "未知平台或未接入下单" } };
  }

  function renderOddBox(ref, sideLabel, oddValue, oddCls) {
    const hasRef = ref && ref.oddsId && ref.marketId;
    const cls = hasRef ? "odd-box clickable" : "odd-box disabled";
    const data = hasRef ? ` data-bet-ref="${encodeBetRef(ref)}"` : "";
    return `
      <div class="${cls}"${data} title="${hasRef ? "点击查看下单参数" : ""}">
        <div class="odd-side">${sideLabel}</div>
        <div class="odd-value ${oddCls}">${fmtOdd(oddValue)}</div>
      </div>`;
  }

  function openParamsModal(ref, matchTitle) {
    const payload = buildOrderParams(ref);
    betSub.textContent = `${matchTitle} · ${ref.label || ref.side} · ${ref.platform}`;
    betParams.textContent = JSON.stringify(payload, null, 2);
    betOverlay.hidden = false;
  }

  function closeParamsModal() {
    betOverlay.hidden = true;
  }

  if (betClose) betClose.addEventListener("click", closeParamsModal);
  if (betOverlay) {
    betOverlay.addEventListener("click", (e) => {
      if (e.target === betOverlay) closeParamsModal();
    });
  }

  if (grid) {
    grid.addEventListener("click", (e) => {
      const box = e.target.closest(".odd-box.clickable");
      if (!box?.dataset.betRef) return;
      try {
        const ref = JSON.parse(decodeURIComponent(box.dataset.betRef));
        const card = box.closest(".card");
        const home = card?.querySelector(".team.home")?.textContent || "";
        const away = card?.querySelector(".team.away")?.textContent || "";
        openParamsModal(ref, `${home} vs ${away}`);
      } catch {
        /* ignore */
      }
    });
  }

  function fmtTime(ts) {
    if (!ts) return "--";
    return new Date(ts).toLocaleString("zh-CN", { hour12: false });
  }

  function fmtOdd(v) {
    if (v == null || Number.isNaN(v)) return "--";
    return Number(v).toFixed(3);
  }

  function oddClass(id, value) {
    const prev = prevOdds.get(id);
    prevOdds.set(id, value);
    if (prev == null || value == null) return "";
    if (value > prev) return "up";
    if (value < prev) return "down";
    return "";
  }

  function renderStageCol(m, stage) {
    const sid = stage.stageId;
    const homeKey = `${m.matchId}:${sid}:h`;
    const awayKey = `${m.matchId}:${sid}:a`;
    const homeCls = oddClass(stage.winHomeId || homeKey, stage.winHome);
    const awayCls = oddClass(stage.winAwayId || awayKey, stage.winAway);
    const lockCls = stage.winLocked ? "locked" : "";
    return `
      <div class="stage-col">
        <div class="stage-label ${lockCls}">${stage.label || (sid === 0 ? "全场" : `地图${sid}`)}</div>
        ${renderOddBox(stage.winHomeRef, "主", stage.winHome, homeCls)}
        ${renderOddBox(stage.winAwayRef, "客", stage.winAway, awayCls)}
      </div>`;
  }

  function renderCard(m, pid) {
    const stages = m.stages?.length
      ? m.stages
      : [{
          stageId: 0,
          label: "全场",
          winHome: m.winHome,
          winAway: m.winAway,
          winHomeId: m.winHomeId,
          winAwayId: m.winAwayId,
          winLocked: m.winLocked,
          winHomeRef: m.winHomeRef,
          winAwayRef: m.winAwayRef,
        }];
    const anyLocked = stages.some((s) => s.winLocked);
    const gameLabel = m.gameName || "未知游戏";
    const liveBadge = m.isLive
      ? `<span class="live-tag">进行中</span>`
      : `<span class="scope-tag">${m.scheduleLabel || "赛程"}</span>`;
    const cardId = `${pid}:${m.matchId}`;
    return `
      <article class="card" data-id="${cardId}" data-match="${m.matchId}">
        <div class="tournament">
          <span class="game-tag">${gameLabel}</span>
          ${liveBadge}
          ${m.tournament || m.league || "电竞赛事"} · BO${m.bo || "?"}
        </div>
        <div class="teams">
          <div class="team home">${m.home}</div>
          <div class="vs">VS</div>
          <div class="team away">${m.away}</div>
        </div>
        <div class="stages">${stages.map((s) => renderStageCol(m, s)).join("")}</div>
        <div class="meta">
          <span>${fmtTime(m.startTime)}</span>
          <span class="${anyLocked ? "locked" : ""}">${stages.length} 局 · ${m.matchId}</span>
        </div>
      </article>`;
  }

  function normalizeSnapshot(data) {
    if (!data) return { platforms: {} };
    if (data.platforms) return data;
    if (Array.isArray(data.matches)) {
      const id = platformId || "OB";
      return {
        platforms: {
          [id]: {
            label: id,
            enabled: true,
            status: data.status || {},
            matches: data.matches,
            updatedAt: data.updatedAt || Date.now(),
          },
        },
        updatedAt: data.updatedAt || Date.now(),
      };
    }
    return data;
  }

  function isStreamConnected(pid, status) {
    const meta = streamMetaById[pid];
    if (!meta) return false;
    return Boolean(status?.[meta.key]);
  }

  function streamBadgeHtml(pid, status, enabled) {
    const meta = streamMetaById[pid];
    if (!meta) return "";
    if (enabled === false) {
      return `<span class="stream-badge off">${pid} · 未启用</span>`;
    }
    const on = isStreamConnected(pid, status);
    const cls = on ? "ok" : "bad";
    const text = on ? `${meta.protocol} 已连` : `${meta.protocol} 未连`;
    return `<span class="stream-badge ${cls}">${pid} · ${text}</span>`;
  }

  function renderStreamStatusPills(platforms) {
    if (!streamStatusEl) return;
    const order = registry.map((p) => p.id);
    const ids = isSingle ? [platformId] : order.filter((id) => platforms[id] != null);
    const pills = ids
      .map((id) => {
        const snap = platforms[id];
        if (!snap) return "";
        const meta = streamMetaById[id];
        const enabled = snap.enabled !== false;
        if (!meta) return "";
        if (!enabled) {
          return `<span class="pill off">${id} · 未启用</span>`;
        }
        const on = isStreamConnected(id, snap.status || {});
        const cls = on ? "ok" : "bad";
        return `<span class="pill ${cls}">${id} · ${meta.protocol} ${on ? "已连" : "未连"}</span>`;
      })
      .join("");
    streamStatusEl.innerHTML = pills || `<span class="pill off">实时 · --</span>`;
  }

  function renderPlatformSection(pid, snap) {
    const label = snap.label || pid;
    const status = snap.status || {};
    const matches = snap.matches || [];
    const sync = status.lastSync ? fmtTime(status.lastSync) : "--";
    const note = status.note ? ` · ${status.note}` : "";
    const err = status.error ? ` · ${status.error}` : "";
    const streamBadge = streamBadgeHtml(pid, status, snap.enabled !== false);
    const headLink = isSingle
      ? ""
      : `<a href="/platforms/${pid.toLowerCase()}/" style="color:#93c5fd;font-size:12px">单独查看</a>`;

    if (!matches.length) {
      const emptyText = status.syncing
        ? "正在同步…"
        : status.error
          ? `同步失败：${status.error}`
          : snap.enabled === false
            ? "平台未启用（设置 ENABLE_" + pid + "=1）"
            : status.note || "暂无比赛";
      return `
        <section class="platform-block" data-platform="${pid}">
          <div class="platform-head">
            <h2>${label}</h2>
            <div class="platform-meta">
              <span>${streamBadge}</span>
              <span>同步 ${sync}${note}${err}</span>
              ${headLink}
            </div>
          </div>
          <div class="platform-empty">${emptyText}</div>
        </section>`;
    }

    return `
      <section class="platform-block" data-platform="${pid}">
        <div class="platform-head">
          <h2>${label}</h2>
          <div class="platform-meta">
            <span>${matches.length} 场</span>
            <span>${streamBadge}</span>
            <span>同步 ${sync}</span>
            ${headLink}
          </div>
        </div>
        <div class="grid">${matches.map((m) => renderCard(m, pid)).join("")}</div>
      </section>`;
  }

  function renderSnapshot(data) {
    data = normalizeSnapshot(data);
    const platforms = data.platforms || {};
    let entries = Object.entries(platforms);

    if (isSingle) {
      entries = entries.filter(([id]) => id === platformId);
      if (!entries.length && platforms[platformId]) {
        entries = [[platformId, platforms[platformId]]];
      }
    } else {
      entries = entries.filter(([, snap]) => snap.enabled !== false);
    }

    let total = 0;
    let latestSync = 0;
    for (const [, snap] of entries) {
      total += snap.matches?.length || 0;
      const st = snap.status || {};
      if (st.lastSync && st.lastSync > latestSync) latestSync = st.lastSync;
    }

    renderStreamStatusPills(platforms);
    if (syncPill) syncPill.textContent = "同步 · " + (latestSync ? fmtTime(latestSync) : "--");
    if (countPill) countPill.textContent = "比赛 · " + total;

    if (!grid) return;
    if (!entries.length) {
      grid.innerHTML = "";
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;
    grid.innerHTML = entries.map(([id, snap]) => renderPlatformSection(id, snap)).join("");
  }

  function flashMatch(matchId, pid) {
    const sel = pid ? `[data-id="${pid}:${matchId}"]` : `[data-match="${matchId}"]`;
    const el = grid?.querySelector(sel);
    if (!el) return;
    el.classList.add("flash");
    setTimeout(() => el.classList.remove("flash"), 600);
  }

  let snapshotCache = null;
  const collect = typeof EsportCollect !== "undefined" ? new EsportCollect() : null;

  function paintSnapshot() {
    if (!snapshotCache) return;
    const merged = collect
      ? SnapshotRuntime.mergeClientStreamStatus(snapshotCache, collect.getStats())
      : snapshotCache;
    renderSnapshot(merged);
  }

  function subscribeObTopics() {
    if (!collect || !snapshotCache || !collect._obClient?.connected) return;
    collect.subscribeOB(SnapshotRuntime.obTopicsFromSnapshot(snapshotCache));
  }

  async function syncSnapshot() {
    const url = isSingle ? `/api/snapshot/${encodeURIComponent(platformId)}` : "/api/snapshot";
    const res = await fetch(url);
    if (!res.ok) throw new Error("snapshot fetch failed");
    const body = await res.json();
    if (isSingle && body.matches) {
      snapshotCache = normalizeSnapshot({
        platforms: {
          [platformId]: {
            label: platformId,
            enabled: true,
            status: body.status || {},
            matches: body.matches,
            updatedAt: body.updatedAt || Date.now(),
          },
        },
      });
    } else {
      snapshotCache = normalizeSnapshot(body);
    }
    paintSnapshot();
    subscribeObTopics();
  }

  async function loadRegistry() {
    try {
      const res = await fetch("/api/platforms");
      if (!res.ok) return;
      const data = await res.json();
      registry = data.platforms || [];
      streamMetaById = {};
      for (const p of registry) {
        if (p.streamMeta) streamMetaById[p.id] = p.streamMeta;
      }
      if (isSingle && pageTitle) {
        const meta = registry.find((p) => p.id === platformId);
        pageTitle.textContent = meta ? `${meta.labelZh || meta.label} · 实时赔率` : `${platformId} · 实时赔率`;
        if (platformDesc && meta) {
          platformDesc.textContent = `${meta.collectionDesc} · ${meta.implementation === "done" ? "已接入" : "待接入"}`;
          platformDesc.hidden = false;
        }
      }
    } catch {
      /* ignore */
    }
  }

  if (collect) {
    collect.on("OB", ({ topic, payload }) => {
      if (!snapshotCache || (isSingle && platformId !== "OB")) return;
      const r = SnapshotRuntime.applyObMqtt(snapshotCache, topic, payload);
      if (r.touched) {
        paintSnapshot();
        if (r.matchId) flashMatch(r.matchId, r.platform);
      }
    });

    collect.on("RAY", (msg) => {
      if (!snapshotCache || (isSingle && platformId !== "RAY")) return;
      const r = SnapshotRuntime.applyRayMessage(snapshotCache, msg);
      if (r.touched) {
        paintSnapshot();
        if (r.matchId) flashMatch(r.matchId, r.platform);
      }
    });

    collect.onStatsChange(() => {
      paintSnapshot();
      subscribeObTopics();
    });
  }

  async function start() {
    await loadRegistry();
    try {
      await syncSnapshot();
    } catch {
      /* keep empty state */
    }
    if (collect && (!isSingle || platformId === "OB")) {
      try {
        collect.connectOB();
      } catch (e) {
        console.error("OB MQTT", e);
      }
    }
    if (collect && (!isSingle || platformId === "RAY")) {
      try {
        await collect.connectRAY();
      } catch (e) {
        console.error("RAY WS", e);
      }
    }
    setInterval(() => {
      syncSnapshot().catch(() => {});
    }, 30000);
  }

  start();
})();
