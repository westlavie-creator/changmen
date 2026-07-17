import { beforeEach, describe, expect, test, vi } from "vitest";

import { createIaRealtimeClient, type IaRealtimeMessage } from "./realtime";

import {
  IA_OFFICIAL_WS,
  IA_OFFICIAL_WS_PATH,
  IA_WS_FORWARD_PATH,
} from "./wsConfig";



const { ioMock } = vi.hoisted(() => ({

  ioMock: vi.fn(),

}));



vi.mock("socket.io-client", () => ({

  io: ioMock,

}));



function mockSocket() {

  const handlers: Record<string, Array<(...args: unknown[]) => void>> = {};

  const socket = {

    connected: false,

    on(event: string, fn: (...args: unknown[]) => void) {

      (handlers[event] ||= []).push(fn);

      return this;

    },

    emit: vi.fn(),

    removeAllListeners: vi.fn(),

    disconnect: vi.fn(() => {

      socket.connected = false;

    }),

    fire(event: string, ...args: unknown[]) {

      for (const fn of handlers[event] || []) fn(...args);

    },

  };

  ioMock.mockReturnValue(socket);

  return socket;

}



describe("createIaRealtimeClient", () => {

  beforeEach(() => {

    vi.clearAllMocks();

    vi.useRealTimers();

  });



  test("starts on official socket.ajj123.net then RoomJoin", async () => {

    const socket = mockSocket();

    const client = createIaRealtimeClient("https://ilustre-analytics.org");

    await client.start(() => {});



    expect(ioMock).toHaveBeenCalledWith(

      IA_OFFICIAL_WS,

      expect.objectContaining({

        transports: ["websocket"],

        path: IA_OFFICIAL_WS_PATH,

        reconnection: false,

        withCredentials: true,

        extraHeaders: { Origin: "https://ilustre-analytics.org" },

        auth: { token: "123" },

      }),

    );



    socket.connected = true;

    socket.fire("connect");

    expect(socket.emit).toHaveBeenCalledWith("RoomJoin", {

      room_type: "room_type_index_content_push",

    });



    await client.stop();

    expect(socket.disconnect).toHaveBeenCalled();

  });



  test("delivers roomMessageCallBack payloads", async () => {

    const socket = mockSocket();

    const messages: IaRealtimeMessage[] = [];

    const client = createIaRealtimeClient("https://ilustre-analytics.org");

    await client.start((message) => messages.push(message));



    socket.connected = true;

    socket.fire("connect");

    socket.fire("roomMessageCallBack", {

      message_type: "message_type_push_point_change",

      content: { point_id: "p1" },

    });



    expect(messages).toEqual([

      { message_type: "message_type_push_point_change", content: { point_id: "p1" } },

    ]);

    await client.stop();

  });



  test("falls back to CHANGMEN forward when official connect fails", async () => {

    vi.stubGlobal("window", { location: { origin: "http://localhost:5274" } });

    const official = mockSocket();

    const changmen = mockSocket();

    ioMock.mockReturnValueOnce(official).mockReturnValueOnce(changmen);



    const client = createIaRealtimeClient("https://ilustre-analytics.org");

    await client.start(() => {});



    official.fire("connect_error", new Error("official down"));

    await Promise.resolve();

    expect(ioMock).toHaveBeenCalledTimes(2);

    expect(ioMock).toHaveBeenLastCalledWith(
      "http://127.0.0.1:3560",
      expect.objectContaining({
        path: IA_WS_FORWARD_PATH,
        extraHeaders: {
          Origin: "https://ilustre-analytics.org",
          token: "hello",
        },
        auth: { token: "https://ilustre-analytics.org" },
      }),
    );



    await client.stop();

    vi.unstubAllGlobals();

  });



  test("cycles back to official when CHANGMEN forward fails (no A8)", async () => {

    vi.stubGlobal("window", { location: { origin: "http://localhost:5274" } });

    const official = mockSocket();

    const changmen = mockSocket();

    const officialRetry = mockSocket();

    ioMock.mockReturnValueOnce(official).mockReturnValueOnce(changmen).mockReturnValueOnce(officialRetry);



    const client = createIaRealtimeClient("https://ilustre-analytics.org");

    await client.start(() => {});



    official.fire("connect_error", new Error("official down"));

    await Promise.resolve();

    changmen.fire("connect_error", new Error("changmen down"));

    await Promise.resolve();



    expect(ioMock).toHaveBeenCalledTimes(3);

    expect(ioMock).toHaveBeenLastCalledWith(

      IA_OFFICIAL_WS,

      expect.objectContaining({

        path: IA_OFFICIAL_WS_PATH,

      }),

    );



    await client.stop();

    vi.unstubAllGlobals();

  });

});


