/** WS 转发背压：browser 或 upstream send 队列过大时丢弃帧，避免 arrayBuffers 无界涨。 */

const DEFAULT_MAX_BUFFERED_BYTES = 512 * 1024;

export function maxWsBufferedBytes() {
  const n = Number(process.env.WS_FORWARD_MAX_BUFFERED_BYTES);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_MAX_BUFFERED_BYTES;
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
