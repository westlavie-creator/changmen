import { describe, expect, test } from "vitest";
import { upstreamRouteFromUrl } from "./directRealtimeStatus";

describe("upstreamRouteFromUrl", () => {
  test("treats 47.115.75.57 as A8", () => {
    expect(upstreamRouteFromUrl("wss://47.115.75.57/esport/ws/OB")).toBe("a8");
    expect(upstreamRouteFromUrl("wss://47.115.75.57/esport/ws/IA")).toBe("a8");
  });

  test("treats api.a8.to as A8", () => {
    expect(upstreamRouteFromUrl("wss://api.a8.to/esport/ws/TF?auth_token=x")).toBe("a8");
  });

  test("treats platform source hosts as official", () => {
    expect(upstreamRouteFromUrl("wss://pro-dj-aws-mqtt.x7hsa3.com:8084/mqtt")).toBe("official");
    expect(upstreamRouteFromUrl("wss://cfsocket.365raylinks.com/socketcluster/")).toBe("official");
  });
});
