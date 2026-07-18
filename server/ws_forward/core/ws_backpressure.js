/** WS 转发背压：send 队列过大时丢弃帧，并 pause 上游 TCP，避免 Recv-Q/事件循环被灌死。 */

const DEFAULT_MAX_BUFFERED_BYTES = 512 * 1024;
const DEFAULT_SLOW_CONSUMER_MS = 5_000;

export function maxWsBufferedBytes() {
  const n = Number(process.env.WS_FORWARD_MAX_BUFFERED_BYTES);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_MAX_BUFFERED_BYTES;
}

export function slowConsumerMs() {
  const n = Number(process.env.WS_FORWARD_SLOW_CONSUMER_MS);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_SLOW_CONSUMER_MS;
}

/** @param {import("ws").WebSocket | null | undefined} ws */
export function pauseWsSocket(ws) {
  try {
    const sock = ws?._socket;
    if (sock && typeof sock.pause === "function" && !sock.isPaused?.())
      sock.pause();
  }
  catch {
    /* ignore */
  }
}

/** @param {import("ws").WebSocket | null | undefined} ws */
export function resumeWsSocket(ws) {
  try {
    const sock = ws?._socket;
    if (sock && typeof sock.resume === "function")
      sock.resume();
  }
  catch {
    /* ignore */
  }
}

/**
 * @param {string} platformId
 * @param {"to-client"|"to-upstream"} direction
 */
export function createWsRelayGuard(platformId, direction) {
  const max = maxWsBufferedBytes();
  let lastLogAt = 0;
  let dropped = 0;

  return {
    maxBufferedBytes: max,

    /** 只读探测，不计入 drop（Hub coalesce 路径用） */
    isSendAllowed(ws) {
      if (!ws || ws.readyState !== ws.OPEN)
        return false;
      return ws.bufferedAmount <= max;
    },

    /** @param {import("ws").WebSocket} ws */
    canSend(ws) {
      if (!ws || ws.readyState !== ws.OPEN)
        return false;
      if (ws.bufferedAmount <= max)
        return true;
      dropped += 1;
      const now = Date.now();
      if (now - lastLogAt >= 30_000) {
        lastLogAt = now;
        console.warn(
          `[ws_forward/${platformId}] drop ${direction}: bufferedAmount=${ws.bufferedAmount} max=${max} dropped=${dropped}`,
        );
        dropped = 0;
      }
      return false;
    },
  };
}

/**
 * 1:1 raw 转发：client 背压时 pause 上游；恢复后 resume；长时间过载则掐掉慢客户端。
 * @param {import("ws").WebSocket} clientWs
 * @param {import("ws").WebSocket} upstreamWs
 * @param {string} platformId
 */
export function attachRawPipeBackpressure(clientWs, upstreamWs, platformId) {
  const toClient = createWsRelayGuard(platformId, "to-client");
  const toUpstream = createWsRelayGuard(platformId, "to-upstream");
  const slowMs = slowConsumerMs();
  let overloadedSince = 0;
  let paused = false;

  const setPaused = (next) => {
    if (next === paused)
      return;
    paused = next;
    if (next)
      pauseWsSocket(upstreamWs);
    else
      resumeWsSocket(upstreamWs);
  };

  const tick = () => {
    if (clientWs.readyState !== clientWs.OPEN) {
      setPaused(false);
      return;
    }
    const ok = toClient.isSendAllowed(clientWs);
    if (ok) {
      overloadedSince = 0;
      setPaused(false);
      return;
    }
    setPaused(true);
    if (!overloadedSince)
      overloadedSince = Date.now();
    else if (Date.now() - overloadedSince >= slowMs) {
      console.warn(
        `[ws_forward/${platformId}] slow consumer: bufferedAmount=${clientWs.bufferedAmount} > ${toClient.maxBufferedBytes} for ${slowMs}ms, closing`,
      );
      try {
        clientWs.close(1013, "slow consumer");
      }
      catch {
        /* ignore */
      }
      try {
        upstreamWs.close();
      }
      catch {
        /* ignore */
      }
    }
  };

  const timer = setInterval(tick, 50);
  const stop = () => {
    clearInterval(timer);
    setPaused(false);
  };
  clientWs.on("close", stop);
  clientWs.on("error", stop);
  upstreamWs.on("close", stop);
  upstreamWs.on("error", stop);

  return { toClient, toUpstream, tick, stop };
}

/**
 * Hub 共用上游背压策略：
 * - 不因客户端过载 pause 上游（慢连接用 per-client pending/coalesce 隔离，避免拖死全员）。
 * - 定时 resume，防止历史 pause 或其它路径把上游 TCP 卡在 paused。
 *
 * listClientSockets / toClientGuard 保留参数以兼容旧调用方，当前不再用于 pause 决策。
 * @param {() => Iterable<import("ws").WebSocket>} _listClientSockets
 * @param {() => import("ws").WebSocket | null} getUpstream
 * @param {ReturnType<typeof createWsRelayGuard>} _toClientGuard
 * @param {string} _platformId
 */
export function attachHubUpstreamBackpressure(_listClientSockets, getUpstream, _toClientGuard, _platformId) {
  const timer = setInterval(() => {
    const up = getUpstream();
    if (!up || up.readyState !== up.OPEN)
      return;
    resumeWsSocket(up);
  }, 50);

  return () => clearInterval(timer);
}
