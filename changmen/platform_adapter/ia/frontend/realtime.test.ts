import { beforeEach, describe, expect, test, vi } from "vitest";
import { createIaRealtimeClient, type IaRealtimeMessage } from "./realtime";

const { ioMock } = vi.hoisted(() => ({
  ioMock: vi.fn(),
}));

vi.mock("socket.io-client", () => ({
  io: ioMock,
}));

describe("createIaRealtimeClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("window", {});
  });

  test("uses Electron IA relay when available", async () => {
    let callback: ((msg: IaRealtimeMessage) => void) | null = null;
    const removeListener = vi.fn();
    const relay = {
      start: vi.fn().mockResolvedValue({ platform: "IA", upstreamConnected: true }),
      stop: vi.fn().mockResolvedValue({ platform: "IA", upstreamConnected: false }),
      status: vi.fn().mockResolvedValue({ platform: "IA", upstreamConnected: true }),
      onMessage: vi.fn((cb: (msg: IaRealtimeMessage) => void) => {
        callback = cb;
        return removeListener;
      }),
    };
    Object.defineProperty(globalThis.window, "gamebetRelays", {
      configurable: true,
      value: { ia: relay },
    });

    const messages: IaRealtimeMessage[] = [];
    const client = createIaRealtimeClient();
    await client.start((message) => messages.push(message));

    expect(callback).toBeTruthy();
    const emitMessage = callback as unknown as (msg: IaRealtimeMessage) => void;
    emitMessage({ message_type: "message_type_push_point_change", content: { point_id: "p1" } });

    expect(relay.onMessage).toHaveBeenCalledOnce();
    expect(relay.start).toHaveBeenCalledOnce();
    expect(messages).toEqual([
      { message_type: "message_type_push_point_change", content: { point_id: "p1" } },
    ]);

    await client.stop();

    expect(removeListener).toHaveBeenCalledOnce();
    expect(relay.stop).toHaveBeenCalledOnce();
    expect(ioMock).not.toHaveBeenCalled();
  });
});
