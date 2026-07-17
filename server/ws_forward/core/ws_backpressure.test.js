import { describe, expect, it, vi } from "vitest";
import {
  attachRawPipeBackpressure,
  createWsRelayGuard,
  maxWsBufferedBytes,
  pauseWsSocket,
  resumeWsSocket,
  slowConsumerMs,
} from "../core/ws_backpressure.js";

describe("ws_backpressure", () => {
  it("defaults to 512KB max buffered", () => {
    expect(maxWsBufferedBytes()).toBe(512 * 1024);
  });

  it("defaults slow consumer window", () => {
    expect(slowConsumerMs()).toBe(5_000);
  });

  it("blocks send when bufferedAmount exceeds max", () => {
    const guard = createWsRelayGuard("PM-MARKET", "to-client");
    const ws = { OPEN: 1, readyState: 1, bufferedAmount: 1024 * 1024 };
    expect(guard.canSend(ws)).toBe(false);
    expect(guard.isSendAllowed(ws)).toBe(false);
    expect(guard.canSend({ OPEN: 1, readyState: 1, bufferedAmount: 0 })).toBe(true);
    expect(guard.isSendAllowed({ OPEN: 1, readyState: 1, bufferedAmount: 0 })).toBe(true);
  });

  it("pause/resume underlying socket", () => {
    const sock = { paused: false, pause() { this.paused = true; }, resume() { this.paused = false; }, isPaused() { return this.paused; } };
    const ws = { _socket: sock };
    pauseWsSocket(ws);
    expect(sock.paused).toBe(true);
    resumeWsSocket(ws);
    expect(sock.paused).toBe(false);
  });

  it("pauses upstream when client is overloaded", () => {
    vi.useFakeTimers();
    const sock = { paused: false, pause() { this.paused = true; }, resume() { this.paused = false; }, isPaused() { return this.paused; } };
    const clientWs = {
      OPEN: 1,
      readyState: 1,
      bufferedAmount: 1024 * 1024,
      on: vi.fn(),
      close: vi.fn(),
    };
    const upstreamWs = {
      OPEN: 1,
      readyState: 1,
      bufferedAmount: 0,
      _socket: sock,
      on: vi.fn(),
      close: vi.fn(),
    };
    const ctrl = attachRawPipeBackpressure(clientWs, upstreamWs, "PM-USER");
    ctrl.tick();
    expect(sock.paused).toBe(true);
    clientWs.bufferedAmount = 0;
    ctrl.tick();
    expect(sock.paused).toBe(false);
    ctrl.stop();
    vi.useRealTimers();
  });
});
