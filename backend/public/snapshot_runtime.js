/**
 * 浏览器端：HTTP snapshot 为底表，/esport/ws/* 增量 patch。
 */
(function (global) {
  const MARKET_STATUS_OPEN = 6;
  const MARKET_VISIBLE_SHOW = 1;
  const MARKET_SUSPENDED_OFF = 0;

  function numberOrZero(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  function isMarketLocked(fields) {
    const s = numberOrZero(fields?.status);
    const v = numberOrZero(fields?.visible ?? MARKET_VISIBLE_SHOW);
    const u = numberOrZero(fields?.suspended ?? MARKET_SUSPENDED_OFF);
    return s !== MARKET_STATUS_OPEN || v !== MARKET_VISIBLE_SHOW || u !== MARKET_SUSPENDED_OFF;
  }

  function describeRayOddStatus(status) {
    const s = numberOrZero(status);
    const locked = s !== 1;
    return {
      locked,
      code: locked ? "locked" : "open",
      label: locked ? "锁盘" : "可投注",
    };
  }

  function mqttTopicsForMatch(matchId) {
    const id = String(matchId);
    return [
      `/odd/insert/${id}`,
      `/odd/statusUpdate/${id}`,
      `/odd/visible/${id}`,
      `/odd/suspended/${id}`,
      `/market/sortCodeUpdate/${id}`,
      `/market/suspended/${id}`,
      `/market/visible/${id}`,
      `/market/statusUpdate/${id}`,
      `/market/oddsUpdate/${id}`,
    ];
  }

  function parseMqttTopic(rawTopic) {
    const match = /^(.+?)(\d+)$/.exec(String(rawTopic || ""));
    if (!match) return { topic: String(rawTopic || ""), matchId: "", type: "unknown" };
    const topic = match[1];
    const known = {
      "/market/oddsUpdate/": "market.oddsUpdate",
      "/market/statusUpdate/": "market.statusUpdate",
      "/market/suspended/": "market.suspended",
      "/market/visible/": "market.visible",
      "/odd/statusUpdate/": "odd.statusUpdate",
      "/odd/visible/": "odd.visible",
      "/odd/suspended/": "odd.suspended",
    };
    return {
      topic,
      matchId: match[2],
      type: known[topic] || "unknown",
    };
  }

  function buildObOddsIndex(snapshot) {
    const index = {};
    const matches = snapshot?.platforms?.OB?.matches || [];
    for (const m of matches) {
      const stages = m.stages?.length
        ? m.stages
        : [
            {
              stageId: 0,
              winHomeId: m.winHomeId,
              winAwayId: m.winAwayId,
              winMarketId: m.winMarketId,
            },
          ];
      for (const stage of stages) {
        if (stage.winHomeId) {
          index[String(stage.winHomeId)] = {
            matchId: String(m.matchId),
            marketId: String(stage.winMarketId || ""),
            side: "home",
          };
        }
        if (stage.winAwayId) {
          index[String(stage.winAwayId)] = {
            matchId: String(m.matchId),
            marketId: String(stage.winMarketId || ""),
            side: "away",
          };
        }
      }
    }
    return index;
  }

  function findObMatch(snapshot, matchId) {
    return snapshot?.platforms?.OB?.matches?.find((m) => String(m.matchId) === String(matchId));
  }

  function applyOddToObMatch(match, oddsId, odd, locked) {
    let touched = false;
    const stages = match.stages?.length
      ? match.stages
      : [
          {
            stageId: 0,
            label: "全场",
            winHome: match.winHome,
            winAway: match.winAway,
            winHomeId: match.winHomeId,
            winAwayId: match.winAwayId,
            winLocked: match.winLocked,
          },
        ];

    for (const stage of stages) {
      if (String(stage.winHomeId) === String(oddsId)) {
        stage.winHome = odd;
        if (locked != null) stage.winLocked = locked;
        touched = true;
      }
      if (String(stage.winAwayId) === String(oddsId)) {
        stage.winAway = odd;
        if (locked != null) stage.winLocked = locked;
        touched = true;
      }
    }

    if (touched && !match.stages?.length) {
      const s0 = stages[0];
      match.winHome = s0.winHome;
      match.winAway = s0.winAway;
      match.winLocked = s0.winLocked;
    } else if (touched) {
      match.stages = stages;
      const overall = stages.find((s) => s.stageId === 0) || stages[0];
      match.winHome = overall.winHome;
      match.winAway = overall.winAway;
      match.winLocked = overall.winLocked;
    }
    match.updatedAt = Date.now();
    return touched;
  }

  function applyMarketLockToObMatch(match, marketId, locked) {
    let touched = false;
    const stages = match.stages || [];
    for (const stage of stages) {
      if (String(stage.winMarketId) !== String(marketId)) continue;
      stage.winLocked = locked;
      touched = true;
    }
    if (!stages.length && String(match.winMarketId) === String(marketId)) {
      match.winLocked = locked;
      touched = true;
    }
    if (touched) match.updatedAt = Date.now();
    return touched;
  }

  function applyObMqtt(snapshot, topic, payload) {
    const topicInfo = parseMqttTopic(topic);
    const items = Array.isArray(payload) ? payload : payload ? [payload] : [];
    const index = buildObOddsIndex(snapshot);
    let touched = false;
    let matchId = topicInfo.matchId || null;

    if (topicInfo.type === "market.oddsUpdate") {
      for (const item of items) {
        const oddsId = String(item.id || item.odds_id || "");
        const row = index[oddsId];
        if (!row) continue;
        const match = findObMatch(snapshot, row.matchId);
        if (!match) continue;
        const odd = numberOrZero(item.odd ?? item.odds);
        if (applyOddToObMatch(match, oddsId, odd, null)) {
          touched = true;
          matchId = row.matchId;
        }
      }
    } else if (
      topicInfo.type === "market.statusUpdate" ||
      topicInfo.type === "market.suspended" ||
      topicInfo.type === "market.visible"
    ) {
      for (const item of items) {
        const marketId = String(item.market_id || item.id || "");
        let locked;
        if (topicInfo.type === "market.suspended") {
          locked = numberOrZero(item.suspended) === 1;
        } else if (topicInfo.type === "market.visible") {
          locked = numberOrZero(item.visible) !== MARKET_VISIBLE_SHOW;
        } else {
          locked = isMarketLocked(item);
        }
        const match = findObMatch(snapshot, topicInfo.matchId);
        if (match && applyMarketLockToObMatch(match, marketId, locked)) {
          touched = true;
          matchId = topicInfo.matchId;
        }
      }
    } else if (
      topicInfo.type === "odd.statusUpdate" ||
      topicInfo.type === "odd.visible" ||
      topicInfo.type === "odd.suspended"
    ) {
      for (const item of items) {
        const oddsId = String(item.id || item.odds_id || "");
        const row = index[oddsId];
        if (!row) continue;
        const match = findObMatch(snapshot, row.matchId);
        if (!match) continue;
        let locked;
        if (item.status !== undefined) {
          locked = isMarketLocked(item);
        } else if (topicInfo.type === "odd.visible") {
          locked = numberOrZero(item.visible) !== MARKET_VISIBLE_SHOW;
        } else {
          locked = numberOrZero(item.suspended) === 1;
        }
        const odd =
          row.side === "home"
            ? match.stages?.find((s) => String(s.winHomeId) === oddsId)?.winHome ?? match.winHome
            : match.stages?.find((s) => String(s.winAwayId) === oddsId)?.winAway ?? match.winAway;
        if (applyOddToObMatch(match, oddsId, odd, locked)) {
          touched = true;
          matchId = row.matchId;
        }
      }
    }

    return { touched, matchId, platform: "OB" };
  }

  function applyRayMessage(snapshot, msg) {
    if (!msg || msg.source !== "odds" || !Array.isArray(msg.odds)) {
      if (msg?.source === "match" && msg.match?.id) {
        const match = snapshot?.platforms?.RAY?.matches?.find(
          (m) => String(m.matchId) === String(msg.match.id)
        );
        if (match && msg.match.status != null) {
          match.isLive = numberOrZero(msg.match.status) === 2;
          match.updatedAt = Date.now();
          return { touched: true, matchId: match.matchId, platform: "RAY" };
        }
      }
      return { touched: false };
    }

    let touched = false;
    let flashId = null;

    for (const item of msg.odds) {
      const oddsId = String(item.id ?? item.odds_id);
      const matchId = String(item.match_id ?? "");
      const match = snapshot?.platforms?.RAY?.matches?.find(
        (m) => String(m.matchId) === matchId
      );
      if (!match?.stages) continue;

      const odd = Number(item.odds);
      const st = describeRayOddStatus(item.status);

      for (const stage of match.stages) {
        if (String(stage.winHomeId) === oddsId) {
          stage.winHome = odd;
          stage.winLocked = st.locked;
          stage.winMarketStatus = st;
          touched = true;
          flashId = matchId;
        }
        if (String(stage.winAwayId) === oddsId) {
          stage.winAway = odd;
          stage.winLocked = st.locked;
          stage.winMarketStatus = st;
          touched = true;
          flashId = matchId;
        }
      }

      if (touched) {
        const overall = match.stages.find((s) => s.stageId === 0) || match.stages[0];
        match.winHome = overall?.winHome;
        match.winAway = overall?.winAway;
        match.winLocked = overall?.winLocked;
        match.updatedAt = Date.now();
      }
    }

    return { touched, matchId: flashId, platform: "RAY" };
  }

  function obTopicsFromSnapshot(snapshot) {
    const matches = snapshot?.platforms?.OB?.matches || [];
    const set = new Set();
    for (const m of matches) {
      for (const t of mqttTopicsForMatch(m.matchId)) set.add(t);
    }
    return [...set];
  }

  function mergeClientStreamStatus(snapshot, collectStats) {
    if (!snapshot?.platforms) return snapshot;
    const out = JSON.parse(JSON.stringify(snapshot));
    if (out.platforms.OB) {
      out.platforms.OB.status = {
        ...(out.platforms.OB.status || {}),
        mqtt: Boolean(collectStats?.OB?.connected),
      };
    }
    if (out.platforms.RAY) {
      out.platforms.RAY.status = {
        ...(out.platforms.RAY.status || {}),
        ws: Boolean(collectStats?.RAY?.connected),
      };
    }
    if (out.platforms.TF) {
      out.platforms.TF.status = {
        ...(out.platforms.TF.status || {}),
        ws: Boolean(collectStats?.TF?.connected),
      };
    }
    return out;
  }

  global.SnapshotRuntime = {
    mqttTopicsForMatch,
    obTopicsFromSnapshot,
    applyObMqtt,
    applyRayMessage,
    mergeClientStreamStatus,
  };
})(typeof window !== "undefined" ? window : globalThis);
