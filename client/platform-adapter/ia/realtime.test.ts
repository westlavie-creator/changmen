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
  });

  test("connects directly to A8 IA ws with wQe gateway origin", async () => {
    const handlers: Record<string, Array<(...args: unknown[]) => void>> = {};
    const socket = {
      on(event: string, fn: (...args: unknown[]) => void) {
        (handlers[event] ||= []).push(fn);
        return this;
      },
      emit: vi.fn(),
      removeAllListeners: vi.fn(),
      disconnect: vi.fn(),
    };
    ioMock.mockReturnValue(socket);

    const messages: IaRealtimeMessage[] = [];
    const client = createIaRealtimeClient("https://ilustre-analytics.org");
    await client.start((message) => messages.push(message));

    expect(ioMock).toHaveBeenCalledWith(
      "wss://47.115.75.57",
      expect.objectContaining({
        transports: ["websocket"],
        path: "/esport/ws/IA",
        extraHeaders: {
          Origin: "https://ilustre-analytics.org",
          token: "hello",
        },
        auth: { token: "https://ilustre-analytics.org" },
      }),
    );

    for (const fn of handlers.connect || []) fn();
    expect(socket.emit).toHaveBeenCalledWith("RoomJoin", {
      room_type: "room_type_index_content_push",
    });

    for (const fn of handlers.roomMessageCallBack || []) {
      fn({ message_type: "message_type_push_point_change", content: { point_id: "p1" } });
    }
    expect(messages).toEqual([
      { message_type: "message_type_push_point_change", content: { point_id: "p1" } },
    ]);

    await client.stop();
    expect(socket.disconnect).toHaveBeenCalledOnce();
  });
});
