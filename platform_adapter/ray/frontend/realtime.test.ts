import { afterEach, describe, expect, test, vi } from "vitest";
import { createRayRealtimeClient, type RayRealtimeMessage } from "./realtime";

const createMock = vi.fn();
const subscribeMock = vi.fn();
const listenerMock = vi.fn();
const disconnectMock = vi.fn();

vi.mock("socketcluster-client", () => ({
  default: {
    create: (...args: unknown[]) => createMock(...args),
  },
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe("createRayRealtimeClient", () => {
  test("connects directly to cfsocket with A8 collect token", async () => {
    const messages = [{ source: "odds", odds: [{ id: "ray-odd-1", odds: 1.92 }] }];
    subscribeMock.mockReturnValue({
      listener: () => ({ once: () => Promise.resolve() }),
      [Symbol.asyncIterator]: async function* () {
        for (const msg of messages) yield msg;
      },
    });
    createMock.mockReturnValue({
      subscribe: subscribeMock,
      disconnect: disconnectMock,
      listener: (event: string) => {
        if (event === "connect" || event === "disconnect" || event === "error") {
          return {
            [Symbol.asyncIterator]: async function* empty() {
              /* watchRaySocketState background loops */
            },
          };
        }
        return { once: () => Promise.resolve() };
      },
    });

    const received: RayRealtimeMessage[] = [];
    const client = createRayRealtimeClient();
    await client.start((message) => received.push(message));
    await vi.waitFor(() => expect(received.length).toBeGreaterThan(0));

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        hostname: "cfsocket.365raylinks.com",
        path: "/socketcluster/",
        secure: true,
        port: 443,
        wsOptions: expect.objectContaining({
          headers: expect.objectContaining({
            Origin: "https://ray164.com",
            Authorization: expect.stringContaining("Bearer "),
          }),
        }),
      }),
    );
    expect(subscribeMock).toHaveBeenCalledWith("match");
    expect(received).toEqual([{ source: "odds", odds: [{ id: "ray-odd-1", odds: 1.92 }] }]);

    await client.stop();
    expect(disconnectMock).toHaveBeenCalledOnce();
  });
});
