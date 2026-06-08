import { afterEach, describe, expect, test, vi } from "vitest";
import { createRayRealtimeClient, type RayRealtimeMessage } from "./realtime";

type RayRelayApi = {
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  status: ReturnType<typeof vi.fn>;
  onMessage: ReturnType<typeof vi.fn>;
};

function setElectronRayRelay(ray: RayRelayApi): void {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      gamebetRelays: { ray },
    },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(globalThis, "window");
});

describe("createRayRealtimeClient", () => {
  test("uses the Electron relay as a project realtime client", async () => {
    let listener: (message: RayRealtimeMessage) => void = () => {};
    const removeListener = vi.fn();
    const ray = {
      start: vi.fn().mockResolvedValue({ platform: "RAY", upstreamConnected: true }),
      stop: vi.fn().mockResolvedValue({ platform: "RAY", upstreamConnected: false }),
      status: vi.fn().mockResolvedValue({ platform: "RAY", upstreamConnected: true }),
      onMessage: vi.fn((callback: (message: RayRealtimeMessage) => void) => {
        listener = callback;
        return removeListener;
      }),
    };
    setElectronRayRelay(ray);

    const received: RayRealtimeMessage[] = [];
    const client = createRayRealtimeClient();
    await client.start((message) => received.push(message));
    listener({ source: "odds", odds: [{ id: "ray-odd-1", odds: 1.92 }] });

    expect(ray.onMessage).toHaveBeenCalledOnce();
    expect(ray.start).toHaveBeenCalledOnce();
    expect(received).toEqual([{ source: "odds", odds: [{ id: "ray-odd-1", odds: 1.92 }] }]);

    await expect(client.status?.()).resolves.toEqual({ platform: "RAY", upstreamConnected: true });
    await client.stop();

    expect(removeListener).toHaveBeenCalledOnce();
    expect(ray.stop).toHaveBeenCalledOnce();
  });
});
