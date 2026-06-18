import { afterEach, describe, expect, test, vi } from "vitest";
import {
  buildTfWsUrl,
  nextTfWsHost,
  resetTfWsHostRotateForTests,
  TF_WS_HOSTS,
} from "./wsConfig";

describe("buildTfWsUrl", () => {
  afterEach(() => {
    resetTfWsHostRotateForTests();
  });

  test("rotates A8 hosts and strips Token prefix", () => {
    expect(buildTfWsUrl("Token abc123")).toBe(
      "wss://api.a8.to/esport/ws/TF?auth_token=abc123&combo=false",
    );
    expect(buildTfWsUrl("def456")).toBe(
      "wss://47.115.75.57/esport/ws/TF?auth_token=def456&combo=false",
    );
    expect(buildTfWsUrl("ghi789")).toBe(
      "wss://api.a8.to/esport/ws/TF?auth_token=ghi789&combo=false",
    );
  });

  test("nextTfWsHost cycles through TF_WS_HOSTS", () => {
    const seen = new Set<string>();
    for (let i = 0; i < TF_WS_HOSTS.length * 2; i++) {
      seen.add(nextTfWsHost());
    }
    expect(seen).toEqual(new Set(TF_WS_HOSTS));
  });
});
